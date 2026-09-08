"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import {
  COMMUNITY_SEASON_ABI,
  HOF_CONTRACTS,
  HOF_LEADERBOARD_ABI,
  ROBINHOOD_TESTNET_RPC,
  SEASON_REWARDS_ABI,
} from "@/lib/hofClient";

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

const GENESIS_STATUS_ABI = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "communityAllocationMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "teamReserveMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "revealed", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "teamWallet", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "saleContract", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const SALE_STATUS_ABI = [
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "saleSuccessful", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "refundsEnabled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "distributed", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "prizePoolTreasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

type StatusState = {
  genesis?: {
    totalSupply: string;
    communityMinted: string;
    teamMinted: string;
    revealed: boolean;
    teamWallet: string;
    saleContract: string;
  };
  sale?: {
    sold: string;
    deadline: string;
    successful: boolean;
    refundsEnabled: boolean;
    distributed: boolean;
    prizePoolTreasury: string;
  };
  community?: { currentSeason: string; races: string; finalized: string };
  hof?: { currentSeason: string; races: string; finalized: string };
  rewards?: { communityPaid: string; communityRemaining: string; hofReserved: string };
};

function usdc(raw: string) {
  const value = Number(raw) / 1_000_000;
  return Number.isFinite(value) ? `${value.toLocaleString()} USDC` : raw;
}

function dateFromUnix(raw: string) {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds)) return raw;
  return new Date(seconds * 1000).toLocaleString();
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: 22, border: "1px solid #333", borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

export default function StatusPage() {
  const [state, setState] = useState<StatusState>({});
  const [status, setStatus] = useState("Loading V7 contracts from Robinhood Chain Testnet...");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next: StatusState = {};

        if (HOF_CONTRACTS.genesis) {
          const address = HOF_CONTRACTS.genesis;
          const [totalSupply, communityMinted, teamMinted, revealed, teamWallet, saleContract] = await Promise.all([
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "totalSupply" }),
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "communityAllocationMinted" }),
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "teamReserveMinted" }),
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "revealed" }),
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "teamWallet" }),
            publicClient.readContract({ address, abi: GENESIS_STATUS_ABI, functionName: "saleContract" }),
          ]);
          next.genesis = {
            totalSupply: String(totalSupply),
            communityMinted: String(communityMinted),
            teamMinted: String(teamMinted),
            revealed,
            teamWallet,
            saleContract,
          };
        }

        if (HOF_CONTRACTS.sale) {
          const address = HOF_CONTRACTS.sale;
          const [sold, deadline, successful, refundsEnabled, distributed, prizePoolTreasury] = await Promise.all([
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "sold" }),
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "deadline" }),
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "saleSuccessful" }),
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "refundsEnabled" }),
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "distributed" }),
            publicClient.readContract({ address, abi: SALE_STATUS_ABI, functionName: "prizePoolTreasury" }),
          ]);
          next.sale = {
            sold: String(sold),
            deadline: String(deadline),
            successful,
            refundsEnabled,
            distributed,
            prizePoolTreasury,
          };
        }

        if (HOF_CONTRACTS.communitySeason) {
          const address = HOF_CONTRACTS.communitySeason;
          const [currentSeason, races, finalized] = await Promise.all([
            publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "currentSeason" }),
            publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "racesRegistered" }),
            publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "seasonsFinalized" }),
          ]);
          next.community = { currentSeason: String(currentSeason), races: String(races), finalized: String(finalized) };
        }

        if (HOF_CONTRACTS.hofLeaderboard) {
          const address = HOF_CONTRACTS.hofLeaderboard;
          const [currentSeason, races, finalized] = await Promise.all([
            publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "currentSeason" }),
            publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "racesRecorded" }),
            publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "seasonsFinalized" }),
          ]);
          next.hof = { currentSeason: String(currentSeason), races: String(races), finalized: String(finalized) };
        }

        if (HOF_CONTRACTS.seasonRewards) {
          const address = HOF_CONTRACTS.seasonRewards;
          const [communityPaid, communityRemaining, hofReserved] = await Promise.all([
            publicClient.readContract({ address, abi: SEASON_REWARDS_ABI, functionName: "communityPaid" }),
            publicClient.readContract({ address, abi: SEASON_REWARDS_ABI, functionName: "communityRemaining" }),
            publicClient.readContract({ address, abi: SEASON_REWARDS_ABI, functionName: "hofReserved" }),
          ]);
          next.rewards = {
            communityPaid: String(communityPaid),
            communityRemaining: String(communityRemaining),
            hofReserved: String(hofReserved),
          };
        }

        if (!cancelled) {
          setState(next);
          setStatus("On-chain V7 state loaded. This page is read-only.");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus("Could not read one or more configured V7 contracts. No transaction was sent.");
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — V7 · READ ONLY</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 14px" }}>SYSTEM STATUS</h1>
        <p style={{ fontSize: 18, lineHeight: 1.6 }}>{status}</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginTop: 30 }}>
          <Card title="Genesis 2,222">
            {state.genesis ? <>
              <p>Current total supply: <strong>{state.genesis.totalSupply}</strong> / 2,222</p>
              <p>Community allocation minted: <strong>{state.genesis.communityMinted}</strong> / 111</p>
              <p>Team Reserve minted: <strong>{state.genesis.teamMinted}</strong> / 111</p>
              <p>Metadata revealed: <strong>{state.genesis.revealed ? "Yes" : "No"}</strong></p>
              <p style={{ overflowWrap: "anywhere" }}>Team wallet: {state.genesis.teamWallet}</p>
              <p style={{ overflowWrap: "anywhere" }}>Sale contract: {state.genesis.saleContract}</p>
            </> : <p>Genesis address not configured.</p>}
          </Card>

          <Card title="Public Mint 2,000 × 30 USDC">
            {state.sale ? <>
              <p>Sold: <strong>{state.sale.sold}</strong> / 2,000</p>
              <p>Deadline: <strong>{dateFromUnix(state.sale.deadline)}</strong></p>
              <p>Sell-out success: <strong>{state.sale.successful ? "Yes" : "No"}</strong></p>
              <p>Failed-sale refunds enabled: <strong>{state.sale.refundsEnabled ? "Yes" : "No"}</strong></p>
              <p>60k proceeds distributed: <strong>{state.sale.distributed ? "Yes" : "No"}</strong></p>
              <p style={{ overflowWrap: "anywhere" }}>Prize Pool destination: {state.sale.prizePoolTreasury}</p>
            </> : <p>Sale address not configured.</p>}
          </Card>

          <Card title="Community Championship">
            {state.community ? <>
              <p>Current season: <strong>{state.community.currentSeason}</strong></p>
              <p>Races registered this season: <strong>{state.community.races}</strong> / 10</p>
              <p>Seasons finalized: <strong>{state.community.finalized}</strong> / 6</p>
              <p><Link href="/standings" style={{ color: "#7cff6b" }}>Open Community standings →</Link></p>
            </> : <p>Community leaderboard address not configured.</p>}
          </Card>

          <Card title="Hall of Fame Championship">
            {state.hof ? <>
              <p>Current season: <strong>{state.hof.currentSeason}</strong></p>
              <p>Races recorded this season: <strong>{state.hof.races}</strong> / 10</p>
              <p>Seasons finalized: <strong>{state.hof.finalized}</strong> / 6</p>
              <p><Link href="/standings" style={{ color: "#7cff6b" }}>Open HOF standings →</Link></p>
            </> : <p>HOF leaderboard address not configured.</p>}
          </Card>

          <Card title="Prize Pool accounting">
            {state.rewards ? <>
              <p>Community paid: <strong>{usdc(state.rewards.communityPaid)}</strong></p>
              <p>Community remaining: <strong>{usdc(state.rewards.communityRemaining)}</strong></p>
              <p>HOF reserved: <strong>{usdc(state.rewards.hofReserved)}</strong></p>
              <p style={{ lineHeight: 1.5 }}>HOF beneficiary payout remains intentionally unavailable until the V7 beneficiary mechanism is finalized.</p>
              <p><Link href="/rewards" style={{ color: "#7cff6b" }}>Open rewards →</Link></p>
            </> : <p>Season Rewards address not configured.</p>}
          </Card>
        </div>

        <div style={{ marginTop: 26, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <Link href="/mint" style={{ color: "#7cff6b" }}>Public Mint</Link>
          <Link href="/refund" style={{ color: "#7cff6b" }}>Refund</Link>
          <Link href="/race" style={{ color: "#7cff6b" }}>Race</Link>
          <Link href="/standings" style={{ color: "#7cff6b" }}>Standings</Link>
          <Link href="/rewards" style={{ color: "#7cff6b" }}>Rewards</Link>
        </div>
      </div>
    </main>
  );
}
