"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import {
  COMMUNITY_SEASON_ABI,
  HOF_CONTRACTS,
  HOF_LEADERBOARD_ABI,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

type HofRow = { horse: number; points: string };
type CommunityWalletState = {
  wallet: string;
  currentSeason: string;
  racesRegistered: string;
  seasonsFinalized: string;
  seasonPoints: string;
  allTimePoints: string;
};

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

export default function StandingsPage() {
  const [hofRows, setHofRows] = useState<HofRow[]>([]);
  const [hofMeta, setHofMeta] = useState({ currentSeason: "-", racesRecorded: "-", seasonsFinalized: "-" });
  const [hofStatus, setHofStatus] = useState("Loading HOF All-Time standings...");
  const [community, setCommunity] = useState<CommunityWalletState | null>(null);
  const [communityStatus, setCommunityStatus] = useState("Connect a wallet to read its V7 Community points.");

  useEffect(() => {
    let cancelled = false;

    async function loadHof() {
      const address = HOF_CONTRACTS.hofLeaderboard;
      if (!address) {
        setHofStatus("V7 HOF leaderboard address is not configured yet.");
        return;
      }

      try {
        const [currentSeason, racesRecorded, seasonsFinalized, ranking] = await Promise.all([
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "currentSeason" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "racesRecorded" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "seasonsFinalized" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "allTimeRanking" }),
        ]);

        const points = await Promise.all(
          ranking.map((horse) =>
            publicClient.readContract({
              address,
              abi: HOF_LEADERBOARD_ABI,
              functionName: "allTimePoints",
              args: [horse],
            }),
          ),
        );

        if (cancelled) return;
        setHofMeta({
          currentSeason: String(currentSeason),
          racesRecorded: String(racesRecorded),
          seasonsFinalized: String(seasonsFinalized),
        });
        setHofRows(ranking.map((horse, index) => ({ horse: Number(horse), points: String(points[index]) })));
        setHofStatus("V7 HOF All-Time ranking loaded from Robinhood Chain Testnet.");
      } catch (error) {
        console.error(error);
        if (!cancelled) setHofStatus("Could not read the configured HOF leaderboard.");
      }
    }

    loadHof();
    return () => { cancelled = true; };
  }, []);

  async function loadCommunityWallet() {
    const ethereum = getEthereum();
    const address = HOF_CONTRACTS.communitySeason;
    if (!ethereum) {
      setCommunityStatus("Install an EVM wallet such as MetaMask.");
      return;
    }
    if (!address) {
      setCommunityStatus("V7 Community contract address is not configured yet.");
      return;
    }

    try {
      setCommunityStatus("Loading wallet Community standings...");
      const account = await requestAccount(ethereum);
      const wallet = account as `0x${string}`;
      const [currentSeason, racesRegistered, seasonsFinalized, seasonPoints, allTimePoints] = await Promise.all([
        publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "currentSeason" }),
        publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "racesRegistered" }),
        publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "seasonsFinalized" }),
        publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "seasonPoints", args: [wallet] }),
        publicClient.readContract({ address, abi: COMMUNITY_SEASON_ABI, functionName: "allTimePoints", args: [wallet] }),
      ]);

      setCommunity({
        wallet: account,
        currentSeason: String(currentSeason),
        racesRegistered: String(racesRegistered),
        seasonsFinalized: String(seasonsFinalized),
        seasonPoints: String(seasonPoints),
        allTimePoints: String(allTimePoints),
      });
      setCommunityStatus("Wallet Community points loaded from Robinhood Chain Testnet.");
    } catch (error) {
      console.error(error);
      setCommunityStatus("Could not load Community points or wallet connection was cancelled.");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>STANDINGS</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          Season scores reset after 10 races. All-Time Community and HOF points persist across all six Chapter I seasons.
        </p>

        <section style={{ marginTop: 32, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Hall of Fame — All-Time</h2>
          <p>{hofStatus}</p>
          <p>
            Current season: {hofMeta.currentSeason} · Races recorded: {hofMeta.racesRecorded}/10 · Seasons finalized: {hofMeta.seasonsFinalized}/6
          </p>
          {hofRows.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={{ textAlign: "left", padding: 10 }}>Rank</th><th style={{ textAlign: "left", padding: 10 }}>HOF #</th><th style={{ textAlign: "right", padding: 10 }}>All-Time PTS</th></tr>
                </thead>
                <tbody>
                  {hofRows.map((row, index) => (
                    <tr key={row.horse} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: 10 }}>{index + 1}</td>
                      <td style={{ padding: 10 }}>#{String(row.horse).padStart(2, "0")}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Community — Your Wallet</h2>
          <p>{communityStatus}</p>
          <button type="button" onClick={loadCommunityWallet} style={{ padding: "12px 18px", cursor: "pointer" }}>
            LOAD MY COMMUNITY POINTS
          </button>
          {community && (
            <div style={{ marginTop: 20, lineHeight: 1.8 }}>
              <p><strong>Wallet:</strong> {community.wallet}</p>
              <p><strong>Current season:</strong> {community.currentSeason}</p>
              <p><strong>Races registered:</strong> {community.racesRegistered}/10</p>
              <p><strong>Seasons finalized:</strong> {community.seasonsFinalized}/6</p>
              <p><strong>Current season points:</strong> {community.seasonPoints}</p>
              <p><strong>All-Time points:</strong> {community.allTimePoints}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
