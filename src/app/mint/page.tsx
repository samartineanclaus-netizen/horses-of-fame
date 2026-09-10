"use client";

import Link from "next/link";
import { runMint, planQuantity } from "../../../lib/mint/batches.cjs";
import { useEffect, useMemo, useState, useRef } from "react";
import { createPublicClient, encodeFunctionData, http, parseEventLogs } from "viem";
import {
  ERC20_APPROVE_ABI,
  ERC20_BALANCE_ABI,
  ROBINHOOD_TESTNET_CHAIN_ID_HEX,
  GENESIS_SALE_ABI,
  HOF_CONTRACTS,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

const PUBLIC_SUPPLY = BigInt(2000);
const TEN_DAYS = BigInt(10 * 24 * 60 * 60);
const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

type SaleState = {
  sold: bigint;
  deadline: bigint;
  soldOutAt: bigint;
  successful: boolean;
  refundsEnabled: boolean;
};

function parseTokenIds(value: string): bigint[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Enter at least one Public Mint token ID");
  return parts.map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid token ID: ${part}`);
    return BigInt(part);
  });
}

function formatTimestamp(timestamp: bigint) {
  const milliseconds = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(milliseconds)) return timestamp.toString();
  return new Date(milliseconds).toLocaleString();
}

async function waitForSuccess(hash: unknown) {
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("Wallet did not return a valid transaction hash");
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
  return hash;
}

export default function MintPage() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("Ready");
  const [quantity, setQuantity] = useState("1");
  const [refundIds, setRefundIds] = useState("");
  const [saleState, setSaleState] = useState<SaleState | null>(null);
  const [busy, setBusy] = useState(false);
  const mintLock = useRef(false);

  const configured = useMemo(
    () => Boolean(HOF_CONTRACTS.sale && HOF_CONTRACTS.usdc),
    [],
  );

  async function loadSaleState() {
    const sale = HOF_CONTRACTS.sale;
    if (!sale) return;
    try {
      const [sold, deadline, soldOutAt, successful, refundsEnabled] = await Promise.all([
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "sold" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "deadline" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "soldOutAt" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "saleSuccessful" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "refundsEnabled" }),
      ]);
      setSaleState({ sold, deadline, soldOutAt, successful, refundsEnabled });
    } catch (error) {
      console.error("Could not load V7 sale state:", error);
    }
  }

  useEffect(() => {
    void loadSaleState();
  }, []);

  async function connect() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus("Install an EVM wallet such as MetaMask.");
      return;
    }
    try {
      const nextAccount = await requestAccount(ethereum);
      setAccount(nextAccount);
      setStatus("Wallet connected to Robinhood Chain Testnet.");
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed or was cancelled.");
    }
  }

  async function mintGenesis() {
    const ethereum = getEthereum();
    const sale = HOF_CONTRACTS.sale;
    const usdc = HOF_CONTRACTS.usdc;
    if (!ethereum || !sale || !usdc) {
      setStatus("V7 sale/USDC contract addresses are not configured yet.");
      return;
    }

    if (mintLock.current) return;
    mintLock.current = true;
    let engineStarted = false;
    try {
      setBusy(true);
      const mintQuantity = planQuantity(quantity);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const key = `hof-mint:${ROBINHOOD_TESTNET_CHAIN_ID_HEX}:${sale.toLowerCase()}:${from.toLowerCase()}`;
      const saved = localStorage.getItem(key);
      const old = saved ? JSON.parse(saved) : null;
      // Resume the saved purchase, including its pending hash, before starting another.
      const journal = old && (old.pending || BigInt(old.confirmed) < BigInt(old.total)) ? old : null;
      if (journal) setQuantity(journal.total);
      async function identity() {
        const accounts = await ethereum!.request({ method: "eth_accounts" }) as string[];
        const chain = await ethereum!.request({ method: "eth_chainId" });
        if (accounts[0]?.toLowerCase() !== from.toLowerCase() || chain !== ROBINHOOD_TESTNET_CHAIN_ID_HEX)
          throw new Error("Wallet or chain changed. Restore the original wallet/network to resume.");
      }
      async function send(to: `0x${string}`, data: `0x${string}`) {
        let padded: bigint;
        try {
        await identity();
        const gas = await publicClient.estimateGas({ account: from as `0x${string}`, to, data });
        padded = (gas * BigInt(120) + BigInt(99)) / BigInt(100);
        if (padded > BigInt(5_000_000)) throw new Error("Estimated gas exceeds the 5M operational budget. No transaction sent; contact support.");
        await identity();
        } catch (error) { throw Object.assign(error as Error, { notBroadcast: true }); }
        return ethereum!.request({ method: "eth_sendTransaction", params: [{ from, to, data, gas: `0x${padded.toString(16)}` }] });
      }
      engineStarted = true;
      await runMint({
        quantity: mintQuantity, journal,
        save: (value: unknown) => localStorage.setItem(key, JSON.stringify(value)),
        progress: setStatus,
        read: async () => {
          await identity();
          const block = await publicClient.getBlock();
          const blockNumber = block.number;
          const [sold, deadline, balance, allowance] = await Promise.all([
            publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "sold", blockNumber }),
            publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "deadline", blockNumber }),
            publicClient.readContract({ address: usdc, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [from as `0x${string}`], blockNumber }),
            publicClient.readContract({ address: usdc, abi: [{ type: "function", name: "allowance", stateMutability: "view", inputs: [{type:"address"},{type:"address"}], outputs:[{type:"uint256"}] }], functionName: "allowance", args: [from as `0x${string}`, sale], blockNumber }),
          ]);
          return { remaining: PUBLIC_SUPPLY - sold, deadline, timestamp: block.timestamp, balance, allowance };
        },
        approve: (cost: bigint) => send(usdc, encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: "approve", args: [sale, cost] })),
        mint: (n: bigint) => send(sale, encodeFunctionData({ abi: GENESIS_SALE_ABI, functionName: "mint", args: [n] })),
        wait: async (hash: `0x${string}`, pending: {kind: string; quantity: string}) => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
          if (receipt.status !== "success" || pending.kind !== "mint") return receipt;
          const events = parseEventLogs({ abi: [{ type: "event", name: "Minted", inputs: [{name:"buyer",type:"address",indexed:true},{name:"quantity",type:"uint256",indexed:false},{name:"paid",type:"uint256",indexed:false}] }] as const, logs: receipt.logs.filter(log => log.address.toLowerCase() === sale.toLowerCase()) });
          const included = events.some(event => event.args.buyer.toLowerCase() === from.toLowerCase() && event.args.quantity === BigInt(pending.quantity) && event.args.paid === BigInt(pending.quantity) * BigInt(30_000_000));
          return { status: included ? "success" : "reverted" };
        },
      });
      await loadSaleState();
    } catch (error) {
      console.error(error);
      if (!engineStarted) setStatus(error instanceof Error ? error.message : "Mint failed or was cancelled.");
    } finally {
      mintLock.current = false;
      setBusy(false);
    }
  }

  async function refundPublicMint() {
    const ethereum = getEthereum();
    const sale = HOF_CONTRACTS.sale;
    if (!ethereum || !sale) {
      setStatus("V7 sale contract address is not configured yet.");
      return;
    }

    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const tokenIds = parseTokenIds(refundIds);

      const enabled = await publicClient.readContract({
        address: sale,
        abi: GENESIS_SALE_ABI,
        functionName: "refundsEnabled",
      });
      if (!enabled) {
        throw new Error("Refunds are not enabled. V7 refunds activate only after the failed-sale deadline condition.");
      }

      const data = encodeFunctionData({
        abi: GENESIS_SALE_ABI,
        functionName: "refund",
        args: [tokenIds],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: sale, data }],
      });
      setStatus("Waiting for refund confirmation...");
      await waitForSuccess(hash);
      setStatus(`Refund confirmed for ${tokenIds.length} Public Mint NFT(s). Tx: ${String(hash)}`);
      await loadSaleState();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Refund failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — GENESIS · V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>PUBLIC MINT</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6 }}>
          2,000 Public Mint NFTs · 30 USDC each · Robinhood Chain. This page calls the V7 sale contract only when its testnet addresses are configured.
        </p>

        <div style={{ marginTop: 32, padding: 24, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Wallet:</strong> {account || "Not connected"}</p>
          <p><strong>Sale config:</strong> {configured ? "Configured" : "Waiting for deployed V7 addresses"}</p>
          {saleState && (
            <>
              <p><strong>Public Mint sold:</strong> {saleState.sold.toString()} / 2,000</p>
              <p><strong>Final deadline:</strong> {formatTimestamp(saleState.deadline)}</p>
              <p><strong>Sale successful:</strong> {saleState.successful ? "Yes" : "No"}</p>
              {saleState.soldOutAt > BigInt(0) && (
                <>
                  <p><strong>Sold out:</strong> {formatTimestamp(saleState.soldOutAt)}</p>
                  <p><strong>V7 first-race target:</strong> by {formatTimestamp(saleState.soldOutAt + TEN_DAYS)}</p>
                </>
              )}
              <p><strong>Refunds enabled:</strong> {saleState.refundsEnabled ? "Yes" : "No"}</p>
            </>
          )}
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={connect} style={{ padding: "14px 20px", cursor: "pointer" }}>
            CONNECT WALLET
          </button>
        </div>

        <section style={{ marginTop: 24, padding: 24, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Mint Genesis</h2>
          <label style={{ display: "block", marginTop: 14 }}>
            Quantity
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="numeric"
              style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }}
            />
          </label>
          <p>Price: 30 USDC per NFT. Maximum 25 NFT per transaction. Buying 100 requires four separate mint transactions, plus USDC approval if needed. Each confirmed batch is final even if a later batch fails. Supply is not reserved. Gas is estimated for each batch; the quantity cap does not guarantee gas usage for contract wallets. Pending purchases are checked before resuming.</p>
          <button
            type="button"
            onClick={mintGenesis}
            disabled={!configured || busy || Boolean(saleState?.successful)}
            style={{ padding: "14px 20px", cursor: configured && !busy && !saleState?.successful ? "pointer" : "not-allowed" }}
          >
            {busy ? "PROCESSING..." : "MINT WITH USDC"}
          </button>
        </section>

        <section style={{ marginTop: 24, padding: 24, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Failed-sale refund</h2>
          <p style={{ lineHeight: 1.6 }}>
            If all 2,000 Public Mint NFTs are not sold by the final deadline, V7 enables an on-chain refund of exactly 30 USDC for each refundable Public Mint NFT still owned by this wallet. The NFT is burned as part of the refund.
          </p>
          <label style={{ display: "block", marginTop: 14 }}>
            Public Mint token IDs, comma separated
            <input
              value={refundIds}
              onChange={(event) => setRefundIds(event.target.value)}
              placeholder="23, 451, 1253"
              style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }}
            />
          </label>
          <button
            type="button"
            onClick={refundPublicMint}
            disabled={!HOF_CONTRACTS.sale || busy || !saleState?.refundsEnabled}
            style={{ marginTop: 16, padding: "12px 18px", cursor: HOF_CONTRACTS.sale && !busy && saleState?.refundsEnabled ? "pointer" : "not-allowed" }}
          >
            REFUND PUBLIC MINT NFT(S)
          </button>
        </section>
      </div>
    </main>
  );
}
