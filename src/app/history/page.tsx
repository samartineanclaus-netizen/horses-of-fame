"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import {
  COMMUNITY_SEASON_ABI,
  HOF_CONTRACTS,
  HOF_LEADERBOARD_ABI,
  ROBINHOOD_TESTNET_RPC,
} from "@/lib/hofClient";

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

type HofHistoryRow = { horse: number; points: string };
type SeasonHistory = {
  season: number;
  communityTop3: readonly `0x${string}`[];
  hofRows: HofHistoryRow[];
};

function shortWallet(wallet: string) {
  return wallet === "0x0000000000000000000000000000000000000000"
    ? "—"
    : `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<SeasonHistory[]>([]);
  const [status, setStatus] = useState("Loading V7 Season History...");

  async function load() {
    const community = HOF_CONTRACTS.communitySeason;
    const hof = HOF_CONTRACTS.hofLeaderboard;
    if (!community || !hof) {
      setHistory([]);
      setStatus("V7 Community and HOF leaderboard addresses are not both configured yet.");
      return;
    }

    try {
      const [communityFinalized, hofFinalized] = await Promise.all([
        publicClient.readContract({ address: community, abi: COMMUNITY_SEASON_ABI, functionName: "seasonsFinalized" }),
        publicClient.readContract({ address: hof, abi: HOF_LEADERBOARD_ABI, functionName: "seasonsFinalized" }),
      ]);

      if (communityFinalized !== hofFinalized) {
        setHistory([]);
        setStatus(`Leaderboard state mismatch: Community finalized ${communityFinalized}, HOF finalized ${hofFinalized}.`);
        return;
      }

      const count = Number(communityFinalized);
      if (count === 0) {
        setHistory([]);
        setStatus("No Chapter I season has been finalized yet.");
        return;
      }

      const seasons = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const season = index + 1;
          const communityTop3 = await publicClient.readContract({
            address: community,
            abi: COMMUNITY_SEASON_ABI,
            functionName: "getSeasonTop3",
            args: [season],
          });

          const points = await Promise.all(
            Array.from({ length: 22 }, (_, horseIndex) =>
              publicClient.readContract({
                address: hof,
                abi: HOF_LEADERBOARD_ABI,
                functionName: "seasonHistory",
                args: [season, horseIndex + 1],
              }),
            ),
          );

          const hofRows = points
            .map((value, horseIndex) => ({ horse: horseIndex + 1, points: String(value), raw: value }))
            .sort((a, b) => {
              if (a.raw !== b.raw) return a.raw > b.raw ? -1 : 1;
              return a.horse - b.horse;
            })
            .map(({ horse, points }) => ({ horse, points }));

          return { season, communityTop3: [...communityTop3], hofRows } satisfies SeasonHistory;
        }),
      );

      setHistory(seasons);
      setStatus(`Loaded ${count} finalized V7 season${count === 1 ? "" : "s"} from Robinhood Chain Testnet.`);
    } catch (error) {
      console.error(error);
      setHistory([]);
      setStatus("Could not load the configured V7 Season History.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>SEASON HISTORY</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          Each finalized 10-race season is archived before active scores reset. Community Top 3 and all 22 HOF season point totals remain readable on-chain.
        </p>
        <p><strong>Status:</strong> {status}</p>
        <button type="button" onClick={() => void load()} style={{ padding: "12px 18px" }}>REFRESH HISTORY</button>

        {history.map((entry) => (
          <section key={entry.season} style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
            <h2>Season {entry.season}</h2>
            <h3>Community Top 3</h3>
            <ol>
              {entry.communityTop3.map((wallet, index) => (
                <li key={`${entry.season}-${wallet}-${index}`} style={{ marginBottom: 8 }}>
                  {index + 1}. {shortWallet(wallet)}
                </li>
              ))}
            </ol>

            <h3 style={{ marginTop: 24 }}>Hall of Fame standings</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 10 }}>Rank</th>
                    <th style={{ textAlign: "left", padding: 10 }}>HOF #</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Season PTS</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.hofRows.map((row, index) => (
                    <tr key={row.horse} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: 10 }}>{index + 1}</td>
                      <td style={{ padding: 10 }}>#{String(row.horse).padStart(2, "0")}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
