"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, http } from "viem";
import {
  GENESIS_SALE_ABI,
  HOF_CONTRACTS,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

function parseTokenIds(value: string): bigint[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Enter at least one Public Mint token ID");
  const ids = parts.map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid token ID: ${part}`);
    return BigInt(part);
  });
  if (new Set(ids.map(String)).size !== ids.length) throw new Error("Duplicate token ID");
  return ids;
}

export default function RefundPage() {
  const [account, setAccount] = useState("");
  const [tokenIds, setTokenIds] = useState("");
  const [saleState, setSaleState] = useState({ sold: "-", deadline: "-", successful: false, refundsEnabled: false });
  const [status, setStatus] = useState("Loading V7 sale status...");
  const [busy, setBusy] = useState(false);

  async function refreshStatus() {
    const sale = HOF_CONTRACTS.sale;
    if (!sale) {
      setStatus("V7 sale contract address is not configured yet.");
      return;
    }
    try {
      const [sold, deadline, successful, refundsEnabled] = await Promise.all([
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "sold" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "deadline" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "saleSuccessful" }),
        publicClient.readContract({ address: sale, abi: GENESIS_SALE_ABI, functionName: "refundsEnabled" }),
      ]);
      setSaleState({
        sold: sold.toString(),
        deadline: new Date(Number(deadline) * 1000).toLocaleString(),
        successful,
        refundsEnabled,
      });
      setStatus(refundsEnabled ? "Refunds are enabled for the failed V7 Public Mint." : "Refunds are not enabled.");
    } catch (error) {
      console.error(error);
      setStatus("Could not read the V7 sale contract.");
    }
  }

  useEffect(() => {
    void refreshStatus();
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
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed or was cancelled.");
    }
  }

  async function refund() {
    const ethereum = getEthereum();
    const sale = HOF_CONTRACTS.sale;
    if (!ethereum || !sale) {
      setStatus("V7 sale contract is not configured.");
      return;
    }
    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const ids = parseTokenIds(tokenIds);
      const data = encodeFunctionData({ abi: GENESIS_SALE_ABI, functionName: "refund", args: [ids] });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: sale, data }],
      });
      setStatus(`Refund submitted. The contract burns the listed eligible Public Mint NFTs and returns 30 USDC each atomically. Tx: ${String(hash)}`);
      await refreshStatus();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Refund failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — GENESIS · V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 72px)", margin: "8px 0 20px" }}>FAILED-SALE REFUND</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          V7 enables on-chain refunds only if the 2,000 Public Mint NFTs do not fully sell by the configured deadline. Each eligible refunded NFT returns exactly 30 USDC and is burned in the same transaction.
        </p>

        <section style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Public sold:</strong> {saleState.sold} / 2000</p>
          <p><strong>Deadline:</strong> {saleState.deadline}</p>
          <p><strong>Sale successful:</strong> {saleState.successful ? "Yes" : "No"}</p>
          <p><strong>Refunds enabled:</strong> {saleState.refundsEnabled ? "Yes" : "No"}</p>
          <p><strong>Wallet:</strong> {account || "Not connected"}</p>
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={connect} style={{ padding: "12px 18px", cursor: "pointer" }}>CONNECT WALLET</button>
          <button type="button" onClick={() => void refreshStatus()} style={{ marginLeft: 10, padding: "12px 18px", cursor: "pointer" }}>REFRESH STATUS</button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <label style={{ display: "block" }}>
            Public Mint token IDs owned by this wallet, comma separated
            <input
              value={tokenIds}
              onChange={(event) => setTokenIds(event.target.value)}
              placeholder="e.g. 23, 24"
              style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }}
            />
          </label>
          <button
            type="button"
            onClick={refund}
            disabled={!saleState.refundsEnabled || busy}
            style={{ marginTop: 16, padding: "12px 18px", cursor: saleState.refundsEnabled && !busy ? "pointer" : "not-allowed" }}
          >
            {busy ? "PROCESSING..." : "REFUND ELIGIBLE NFTS"}
          </button>
        </section>
      </div>
    </main>
  );
}
