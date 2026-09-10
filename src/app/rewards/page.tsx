"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import {
  CANONICAL_BOARD_STATUS_ABI,
  ERC20_BALANCE_ABI,
  CANONICAL_REWARDS_LINK_ABI,
  HOF_CONTRACTS,
  ROBINHOOD_TESTNET_RPC,
  SEASON_REWARDS_ABI,
} from "@/lib/hofClient";

type SeasonRow = {
  season: number;
  finalized: boolean;
  communityPaid: boolean;
  winners: readonly `0x${string}`[] | null;
};

type RewardsState = {
  balance: bigint;
  communityPaid: bigint;
  rollover: bigint;
  communityRemaining: bigint;
  hofReserved: bigint;
  chapterPrizePool: bigint;
  first: bigint;
  second: bigint;
  third: bigint;
  seasons: SeasonRow[];
};

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

function formatUSDC(value: bigint) {
  const whole = value / BigInt(1_000_000);
  const fraction = value % BigInt(1_000_000);
  if (fraction === BigInt(0)) return `${whole.toLocaleString()} USDC`;
  return `${whole.toLocaleString()}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")} USDC`;
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function RewardsPage() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [status, setStatus] = useState("Loading V7 reward accounting...");

  useEffect(() => {
    let cancelled = false;

    async function loadRewards() {
      const rewards = HOF_CONTRACTS.seasonRewards;
      const usdc = HOF_CONTRACTS.usdc;
      const community = HOF_CONTRACTS.trustedLeaderboards;
      if (!rewards || !usdc || !community) {
        setStatus("Awaiting canonical V7 Rewards, payment token and Leaderboards configuration.");
        return;
      }

      try {
        if(await publicClient.getChainId() !== 46630) throw Error("Wrong chain");
        const blockNumber=await publicClient.getBlockNumber();
        const [linkedBoard,linkedToken,rollover]=await Promise.all([
          publicClient.readContract({address:rewards,abi:CANONICAL_REWARDS_LINK_ABI,functionName:"communitySeason",blockNumber}),
          publicClient.readContract({address:rewards,abi:CANONICAL_REWARDS_LINK_ABI,functionName:"usdc",blockNumber}),
          publicClient.readContract({address:rewards,abi:CANONICAL_REWARDS_LINK_ABI,functionName:"communityRolloverToChapter2",blockNumber})]);
        if(linkedBoard.toLowerCase()!==community.toLowerCase()||linkedToken.toLowerCase()!==usdc.toLowerCase())throw Error("Canonical reward wiring mismatch");
        const [
          balance,
          communityPaid,
          communityRemaining,
          hofReserved,
          chapterPrizePool,
          first,
          second,
          third,
          seasonsFinalized,
        ] = await Promise.all([
          publicClient.readContract({ blockNumber, address: usdc, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [rewards] }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "communityPaid" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "communityRemaining" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "hofReserved" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "CHAPTER_PRIZE_POOL" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "COMMUNITY_FIRST" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "COMMUNITY_SECOND" }),
          publicClient.readContract({ blockNumber, address: rewards, abi: SEASON_REWARDS_ABI, functionName: "COMMUNITY_THIRD" }),
          publicClient.readContract({ blockNumber, address: community, abi: CANONICAL_BOARD_STATUS_ABI, functionName: "seasonsFinalized" }),
        ]);

        const rows = await Promise.all(
          Array.from({ length: 6 }, async (_, index) => {
            const season = index + 1;
            const paid = await publicClient.readContract({
              blockNumber,
              address: rewards,
              abi: SEASON_REWARDS_ABI,
              functionName: "communitySeasonPaid",
              args: [season],
            });
            const finalized = season <= Number(seasonsFinalized);
            const winners = finalized
              ? await publicClient.readContract({
                  blockNumber,
                  address: community,
                  abi: CANONICAL_BOARD_STATUS_ABI,
                  functionName: "getSeasonTop3",
                  args: [season],
                })
              : null;
            return { season, finalized, communityPaid: paid, winners } satisfies SeasonRow;
          }),
        );

        if (cancelled) return;
        setState({ rollover, balance, communityPaid, communityRemaining, hofReserved, chapterPrizePool, first, second, third, seasons: rows });
        setStatus("V7 reward accounting loaded from Robinhood Chain Testnet.");
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus("Could not read the configured V7 reward contracts.");
      }
    }

    void loadRewards();
    return () => { cancelled = true; };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#d6b06a" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#d6b06a" }}>CHAPTER I — V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>REWARDS</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          Chapter I allocates 48,000 USDC across six seasons: 4,000 Community + 4,000 HOF per season. The HOF beneficiary mechanism is still to finalize in V7, so this page exposes that allocation only as reserved accounting.
        </p>

        <p>Unawarded Community prizes remain earmarked for Chapter 2. HOF amounts are reserved, not currently payable. Testnet MockUSDC is TEST ONLY / NO VALUE.</p>
        <section style={{ marginTop: 30, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p>{status}</p>
          {state && (
            <div style={{ lineHeight: 1.9 }}>
              <p><strong>Chapter I Prize Pool:</strong> {formatUSDC(state.chapterPrizePool)}</p>
              <p><strong>Rewards contract balance:</strong> {formatUSDC(state.balance)}</p>
              <p><strong>Community paid:</strong> {formatUSDC(state.communityPaid)}</p>
              <p><strong>Community remaining:</strong> {formatUSDC(state.communityRemaining)}</p>
              <p><strong>Chapter 2 Community rollover:</strong> {formatUSDC(state.rollover)}</p><p><strong>HOF reserved:</strong> {formatUSDC(state.hofReserved)}</p>
            </div>
          )}
        </section>

        {state && (
          <>
            <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
              <h2>Community podium payout</h2>
              <p>1st: {formatUSDC(state.first)} · 2nd: {formatUSDC(state.second)} · 3rd: {formatUSDC(state.third)}</p>
            </section>

            <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
              <h2>Season payment history</h2>
              {state.seasons.map((row) => (
                <div key={row.season} style={{ padding: "16px 0", borderTop: "1px solid #222" }}>
                  <strong>Season {row.season}</strong>
                  <p>Standings finalized: {row.finalized ? "Yes" : "No"} · Community rewards processed: {row.communityPaid ? "Yes" : "No"}</p>
                  {row.winners && (
                    <p>
                      Community Top 3: {row.winners.map((wallet,index)=><span key={index}>{index>0?" / ":""}{/^0x0{40}$/i.test(wallet)?"Unawarded → rollover":shortWallet(wallet)}</span>)}
                    </p>
                  )}
                </div>
              ))}
            </section>

            <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
              <h2>HOF reward half</h2>
              <p style={{ lineHeight: 1.6 }}>
                24,000 USDC is reserved for the HOF side across six seasons. No HOF payout control is exposed here because V7 explicitly leaves the final season-end beneficiary/ownership mechanism for the 22 race horses to finalize.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
