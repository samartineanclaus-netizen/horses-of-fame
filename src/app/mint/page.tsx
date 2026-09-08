"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, encodeFunctionData, http } from "viem";
import {
  ERC20_APPROVE_ABI,
  GENESIS_SALE_ABI,
  HOF_CONTRACTS,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

const ONE_NFT_PRICE = BigInt(30_000_000); // V7: 30 USDC, 6 decimals.
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

function parseQuantity(value: string): bigint {
  if (!/^\d+$/.test(value)) throw new Error("Mint quantity must be a positive whole number");
  const quantity = BigInt(value);
  if (quantity < BigInt(1)) throw new Error("Mint quantity must be at least 1");
  return quantity;
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

    try {
      setBusy(true);
      const mintQuantity = parseQuantity(quantity);
      if (saleState && saleState.sold + mintQuantity > PUBLIC_SUPPLY) {
        throw new Error(`Only ${(PUBLIC_SUPPLY - saleState.sold).toString()} Public Mint NFT(s) remain.`);
      }
      const cost = ONE_NFT_PRICE * mintQuantity;
      const from = await requestAccount(ethereum);
      setAccount(from);

      setStatus(`1/2 — Approve ${(Number(cost) / 1_000_000).toLocaleString()} USDC.`);
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [sale, cost],
      });
      const approveHash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: usdc, data: approveData }],
      });
      setStatus("Waiting for USDC approval confirmation...");
      await waitForSuccess(approveHash);

      setStatus(`2/2 — Submit mint for ${mintQuantity.toString()} Genesis NFT(s).`);
      const mintData = encodeFunctionData({
        abi: GENESIS_SALE_ABI,
        functionName: "mint",
        args: [mintQuantity],
      });
      const mintHash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: sale, data: mintData }],
      });
      setStatus("Waiting for Genesis mint confirmation...");
      await waitForSuccess(mintHash);
      setStatus(`Mint confirmed: ${String(mintHash)}`);
      await loadSaleState();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Mint failed or was cancelled.");
    } finally {
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
          <p>Price: 30 USDC per NFT.</p>
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
