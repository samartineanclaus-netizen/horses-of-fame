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
type CommunityPodium = { season: number; wallets: readonly `0x${string}`[] };
type CommunityWalletState = {
  wallet: string;
  currentSeason: string;
  racesRegistered: string;
  seasonsFinalized: string;
  seasonPoints: string;
  allTimePoints: string;
};
type CommunityAllTimeRow = {
  wallet: `0x${string}`;
  points: bigint;
  lowestTokenId: bigint | null;
  unresolvedTie: boolean;
};

const COMMUNITY_ALL_TIME_ABI = [
  { type: "function", name: "chapterWalletCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "chapterWalletAt", stateMutability: "view", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "allTimePoints", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lowestOwnedTokenId", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const GENESIS_BALANCE_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

function HofTable({ rows, pointsLabel }: { rows: HofRow[]; pointsLabel: string }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 18 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 10 }}>Rank</th>
            <th style={{ textAlign: "left", padding: 10 }}>HOF #</th>
            <th style={{ textAlign: "right", padding: 10 }}>{pointsLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.horse} style={{ borderTop: "1px solid #222" }}>
              <td style={{ padding: 10 }}>{index + 1}</td>
              <td style={{ padding: 10 }}>#{String(row.horse).padStart(2, "0")}</td>
              <td style={{ padding: 10, textAlign: "right" }}>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortWallet(wallet: string) {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
}

export default function StandingsPage() {
  const [hofSeasonRows, setHofSeasonRows] = useState<HofRow[]>([]);
  const [hofAllTimeRows, setHofAllTimeRows] = useState<HofRow[]>([]);
  const [hofMeta, setHofMeta] = useState({ currentSeason: "-", racesRecorded: "-", seasonsFinalized: "-" });
  const [hofStatus, setHofStatus] = useState("Loading HOF standings...");
  const [communityPodiums, setCommunityPodiums] = useState<CommunityPodium[]>([]);
  const [podiumStatus, setPodiumStatus] = useState("Loading finalized Community podiums...");
  const [communityAllTimeRows, setCommunityAllTimeRows] = useState<CommunityAllTimeRow[]>([]);
  const [communityAllTimeStatus, setCommunityAllTimeStatus] = useState("Load the V7 Community All-Time standings on demand.");
  const [communityAllTimeBusy, setCommunityAllTimeBusy] = useState(false);
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
        const [currentSeason, racesRecorded, seasonsFinalized, seasonRanking, allTimeRanking] = await Promise.all([
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "currentSeason" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "racesRecorded" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "seasonsFinalized" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "ranking" }),
          publicClient.readContract({ address, abi: HOF_LEADERBOARD_ABI, functionName: "allTimeRanking" }),
        ]);

        const [seasonPoints, allTimePoints] = await Promise.all([
          Promise.all(
            seasonRanking.map((horse) =>
              publicClient.readContract({
                address,
                abi: HOF_LEADERBOARD_ABI,
                functionName: "seasonPoints",
                args: [horse],
              }),
            ),
          ),
          Promise.all(
            allTimeRanking.map((horse) =>
              publicClient.readContract({
                address,
                abi: HOF_LEADERBOARD_ABI,
                functionName: "allTimePoints",
                args: [horse],
              }),
            ),
          ),
        ]);

        if (cancelled) return;
        setHofMeta({
          currentSeason: String(currentSeason),
          racesRecorded: String(racesRecorded),
          seasonsFinalized: String(seasonsFinalized),
        });
        setHofSeasonRows(seasonRanking.map((horse, index) => ({ horse: Number(horse), points: String(seasonPoints[index]) })));
        setHofAllTimeRows(allTimeRanking.map((horse, index) => ({ horse: Number(horse), points: String(allTimePoints[index]) })));
        setHofStatus("V7 HOF standings loaded from Robinhood Chain Testnet.");
      } catch (error) {
        console.error(error);
        if (!cancelled) setHofStatus("Could not read the configured HOF leaderboard.");
      }
    }

    loadHof();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCommunityPodiums() {
      const address = HOF_CONTRACTS.communitySeason;
      if (!address) {
        setPodiumStatus("V7 Community contract address is not configured yet.");
        return;
      }

      try {
        const finalized = await publicClient.readContract({
          address,
          abi: COMMUNITY_SEASON_ABI,
          functionName: "seasonsFinalized",
        });
        const count = Number(finalized);
        if (count === 0) {
          if (!cancelled) {
            setCommunityPodiums([]);
            setPodiumStatus("No Community season has been finalized yet.");
          }
          return;
        }

        const podiums = await Promise.all(
          Array.from({ length: count }, async (_, index) => {
            const season = index + 1;
            const wallets = await publicClient.readContract({
              address,
              abi: COMMUNITY_SEASON_ABI,
              functionName: "getSeasonTop3",
              args: [season],
            });
            return { season, wallets: [...wallets] } as CommunityPodium;
          }),
        );

        if (!cancelled) {
          setCommunityPodiums(podiums);
          setPodiumStatus("Finalized Community podiums loaded on-chain.");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) setPodiumStatus("Could not load finalized Community podiums.");
      }
    }

    loadCommunityPodiums();
    return () => { cancelled = true; };
  }, []);

  async function loadCommunityAllTime() {
    const communityAddress = HOF_CONTRACTS.communitySeason;
    const genesisAddress = HOF_CONTRACTS.genesis;
    if (!communityAddress || !genesisAddress) {
      setCommunityAllTimeStatus("V7 Community/Genesis contract addresses are not configured yet.");
      return;
    }

    try {
      setCommunityAllTimeBusy(true);
      setCommunityAllTimeStatus("Loading Community All-Time wallets and tie-break state...");
      const count = await publicClient.readContract({
        address: communityAddress,
        abi: COMMUNITY_ALL_TIME_ABI,
        functionName: "chapterWalletCount",
      });

      if (count === BigInt(0)) {
        setCommunityAllTimeRows([]);
        setCommunityAllTimeStatus("No Community wallets have recorded Chapter I race points yet.");
        return;
      }

      const wallets = await Promise.all(
        Array.from({ length: Number(count) }, (_, index) =>
          publicClient.readContract({
            address: communityAddress,
            abi: COMMUNITY_ALL_TIME_ABI,
            functionName: "chapterWalletAt",
            args: [BigInt(index)],
          }),
        ),
      );

      const rows = await Promise.all(
        wallets.map(async (wallet) => {
          const [points, balance] = await Promise.all([
            publicClient.readContract({
              address: communityAddress,
              abi: COMMUNITY_ALL_TIME_ABI,
              functionName: "allTimePoints",
              args: [wallet],
            }),
            publicClient.readContract({
              address: genesisAddress,
              abi: GENESIS_BALANCE_ABI,
              functionName: "balanceOf",
              args: [wallet],
            }),
          ]);

          const lowestTokenId = balance > BigInt(0)
            ? await publicClient.readContract({
                address: communityAddress,
                abi: COMMUNITY_ALL_TIME_ABI,
                functionName: "lowestOwnedTokenId",
                args: [wallet],
              })
            : null;

          return { wallet, points, lowestTokenId, unresolvedTie: false } satisfies CommunityAllTimeRow;
        }),
      );

      rows.sort((a, b) => {
        if (a.points !== b.points) return a.points > b.points ? -1 : 1;
        if (a.lowestTokenId !== null && b.lowestTokenId === null) return -1;
        if (a.lowestTokenId === null && b.lowestTokenId !== null) return 1;
        if (a.lowestTokenId !== null && b.lowestTokenId !== null) {
          if (a.lowestTokenId === b.lowestTokenId) return 0;
          return a.lowestTokenId < b.lowestTokenId ? -1 : 1;
        }
        return 0;
      });

      const marked = rows.map((row, index, all) => ({
        ...row,
        unresolvedTie: row.lowestTokenId === null && all.some((other, otherIndex) =>
          otherIndex !== index && other.lowestTokenId === null && other.points === row.points,
        ),
      }));

      setCommunityAllTimeRows(marked);
      setCommunityAllTimeStatus(
        marked.some((row) => row.unresolvedTie)
          ? "All-Time points loaded. At least one equal-point tie between wallets holding zero Genesis NFTs remains unresolved by V7 and is marked below."
          : "V7 Community All-Time standings loaded with the approved casting tie-break.",
      );
    } catch (error) {
      console.error(error);
      setCommunityAllTimeStatus("Could not load the configured Community All-Time standings.");
    } finally {
      setCommunityAllTimeBusy(false);
    }
  }

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
          <h2>Hall of Fame — Current Season</h2>
          <p>{hofStatus}</p>
          <p>
            Current season: {hofMeta.currentSeason} · Races recorded: {hofMeta.racesRecorded}/10 · Seasons finalized: {hofMeta.seasonsFinalized}/6
          </p>
          <HofTable rows={hofSeasonRows} pointsLabel="Season PTS" />
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Hall of Fame — All-Time</h2>
          <p>All-Time points accumulate across all six seasons and carry prestige only.</p>
          <HofTable rows={hofAllTimeRows} pointsLabel="All-Time PTS" />
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Community — All-Time</h2>
          <p style={{ lineHeight: 1.6 }}>
            Equal points use the approved casting tie-break: a tied wallet with no Genesis NFT loses to a tied wallet that still holds one; if both hold NFTs, the lower-numbered NFT wins. If every tied wallet holds zero NFTs, V7 does not yet define a fallback, so that tie is shown as unresolved rather than invented here.
          </p>
          <p>{communityAllTimeStatus}</p>
          <button type="button" onClick={loadCommunityAllTime} disabled={communityAllTimeBusy} style={{ padding: "12px 18px", cursor: communityAllTimeBusy ? "not-allowed" : "pointer" }}>
            {communityAllTimeBusy ? "LOADING..." : "LOAD COMMUNITY ALL-TIME"}
          </button>
          {communityAllTimeRows.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 10 }}>Rank</th>
                    <th style={{ textAlign: "left", padding: 10 }}>Wallet</th>
                    <th style={{ textAlign: "right", padding: 10 }}>All-Time PTS</th>
                    <th style={{ textAlign: "right", padding: 10 }}>Lowest held NFT</th>
                  </tr>
                </thead>
                <tbody>
                  {communityAllTimeRows.map((row, index) => (
                    <tr key={row.wallet} style={{ borderTop: "1px solid #222" }}>
                      <td style={{ padding: 10 }}>{row.unresolvedTie ? "TIE*" : index + 1}</td>
                      <td style={{ padding: 10 }}>{shortWallet(row.wallet)}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{row.points.toString()}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{row.lowestTokenId === null ? "None" : `#${row.lowestTokenId.toString()}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {communityAllTimeRows.some((row) => row.unresolvedTie) && (
                <p style={{ fontSize: 13, opacity: 0.75 }}>* Equal-point wallets with no Genesis NFT have no V7 fallback tie-break yet.</p>
              )}
            </div>
          )}
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>Community — Finalized Season Podiums</h2>
          <p>{podiumStatus}</p>
          {communityPodiums.map((podium) => (
            <div key={podium.season} style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #222" }}>
              <strong>Season {podium.season}</strong>
              <p style={{ lineHeight: 1.8 }}>
                1st: {shortWallet(podium.wallets[0])} · 2nd: {shortWallet(podium.wallets[1])} · 3rd: {shortWallet(podium.wallets[2])}
              </p>
            </div>
          ))}
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
