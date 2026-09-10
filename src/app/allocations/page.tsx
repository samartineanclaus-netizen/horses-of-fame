"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { HOF_CONTRACTS, ROBINHOOD_TESTNET_RPC } from "@/lib/hofClient";

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

const GENESIS_ALLOCATION_ABI = [
  { type: "function", name: "MAX_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "PUBLIC_MINT_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "COMMUNITY_ALLOCATION_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "TEAM_RESERVE_SUPPLY", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "communityAllocationMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "teamReserveMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "nonPublicAllocationMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "teamWallet", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const SALE_ABI = [
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "saleSuccessful", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

type AllocationState = {
  totalSupply: string;
  publicSold: string;
  communityMinted: string;
  teamMinted: string;
  nonPublicMinted: string;
  teamWallet: string;
  saleSuccessful: boolean;
};

export default function AllocationsPage() {
  const [state, setState] = useState<AllocationState | null>(null);
  const [status, setStatus] = useState("Loading V7 Genesis allocation state...");

  async function load() {
    const genesis = HOF_CONTRACTS.genesis;
    const sale = HOF_CONTRACTS.sale;
    if (!genesis || !sale) {
      setState(null);
      setStatus("V7 Genesis and sale contract addresses are not both configured yet.");
      return;
    }

    try {
      const [
        maxSupply,
        publicSupply,
        communitySupply,
        teamSupply,
        totalSupply,
        communityMinted,
        teamMinted,
        nonPublicMinted,
        teamWallet,
        publicSold,
        saleSuccessful,
      ] = await Promise.all([
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "MAX_SUPPLY" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "PUBLIC_MINT_SUPPLY" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "COMMUNITY_ALLOCATION_SUPPLY" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "TEAM_RESERVE_SUPPLY" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "totalSupply" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "communityAllocationMinted" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "teamReserveMinted" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "nonPublicAllocationMinted" }),
        publicClient.readContract({ address: genesis, abi: GENESIS_ALLOCATION_ABI, functionName: "teamWallet" }),
        publicClient.readContract({ address: sale, abi: SALE_ABI, functionName: "sold" }),
        publicClient.readContract({ address: sale, abi: SALE_ABI, functionName: "saleSuccessful" }),
      ]);

      if (maxSupply !== BigInt(2222) || publicSupply !== BigInt(2000) || communitySupply !== BigInt(111) || teamSupply !== BigInt(111)) {
        throw new Error("Configured contracts do not expose the locked V7 2,222 / 2,000 / 111 / 111 allocation constants");
      }
      if (communityMinted + teamMinted !== nonPublicMinted) {
        throw new Error("Configured Genesis non-public allocation accounting is inconsistent");
      }

      setState({
        totalSupply: String(totalSupply),
        publicSold: String(publicSold),
        communityMinted: String(communityMinted),
        teamMinted: String(teamMinted),
        nonPublicMinted: String(nonPublicMinted),
        teamWallet,
        saleSuccessful,
      });
      setStatus("Locked V7 Genesis allocation buckets loaded from Robinhood Chain Testnet.");
    } catch (error) {
      console.error(error);
      setState(null);
      setStatus(error instanceof Error ? error.message : "Could not load V7 allocation state.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 850, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#d6b06a" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#d6b06a" }}>CHAPTER I — GENESIS · V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>ALLOCATION STATUS</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          V7 locks Genesis at 2,222 NFTs: 2,000 Public Mint, 111 Community and 111 Team Reserve. This page reads the deployed counters only; it does not choose the unresolved Community distribution split or Team Reserve operational terms.
        </p>
        <p><strong>Status:</strong> {status}</p>
        <button type="button" onClick={() => void load()} style={{ padding: "12px 18px" }}>REFRESH</button>

        {state && (
          <section style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
            <p><strong>Genesis currently minted:</strong> {state.totalSupply} / 2222</p>
            <p><strong>Public Mint sold:</strong> {state.publicSold} / 2000</p>
            <p><strong>Community allocation minted:</strong> {state.communityMinted} / 111</p>
            <p><strong>Team Reserve minted:</strong> {state.teamMinted} / 111</p>
            <p><strong>Total non-public minted:</strong> {state.nonPublicMinted} / 222</p>
            <p><strong>Team Reserve Wallet:</strong> {state.teamWallet}</p>
            <p><strong>Public Mint sold out:</strong> {state.saleSuccessful ? "Yes" : "No"}</p>
          </section>
        )}
      </div>
    </main>
  );
}
