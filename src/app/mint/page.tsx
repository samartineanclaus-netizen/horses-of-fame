"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { encodeFunctionData } from "viem";
import {
  ERC20_APPROVE_ABI,
  GENESIS_SALE_ABI,
  HOF_CONTRACTS,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

const ONE_NFT_PRICE = BigInt(30_000_000); // V7: 30 USDC, 6 decimals.

export default function MintPage() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);

  const configured = useMemo(
    () => Boolean(HOF_CONTRACTS.sale && HOF_CONTRACTS.usdc),
    [],
  );

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

  async function mintOne() {
    const ethereum = getEthereum();
    const sale = HOF_CONTRACTS.sale;
    const usdc = HOF_CONTRACTS.usdc;
    if (!ethereum || !sale || !usdc) {
      setStatus("V7 sale/USDC contract addresses are not configured yet.");
      return;
    }

    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);

      setStatus("1/2 — Approve exactly 30 USDC for one Genesis mint.");
      const approveData = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [sale, ONE_NFT_PRICE],
      });
      await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: usdc, data: approveData }],
      });

      setStatus("2/2 — Submit the V7 Genesis mint transaction.");
      const mintData = encodeFunctionData({
        abi: GENESIS_SALE_ABI,
        functionName: "mint",
        args: [BigInt(1)],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: sale, data: mintData }],
      });
      setStatus(`Mint submitted: ${String(hash)}`);
    } catch (error) {
      console.error(error);
      setStatus("Mint failed or was cancelled. No V7 rule was changed.");
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
          <p><strong>Status:</strong> {status}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}>
            <button type="button" onClick={connect} style={{ padding: "14px 20px", cursor: "pointer" }}>
              CONNECT WALLET
            </button>
            <button
              type="button"
              onClick={mintOne}
              disabled={!configured || busy}
              style={{ padding: "14px 20px", cursor: configured && !busy ? "pointer" : "not-allowed" }}
            >
              {busy ? "PROCESSING..." : "MINT 1 — 30 USDC"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
