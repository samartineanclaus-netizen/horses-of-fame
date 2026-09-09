"use client";
import {HofHorseIdentity} from "@/components/HofHorseCard";

import Link from "next/link";
import { useState } from "react";
import { createPublicClient, http } from "viem";
import {
  COMMUNITY_SEASON_ABI,
  GENESIS_VOTING_ABI,
  HOF_CONTRACTS,
  RACE_VOTING_ABI,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

type WalletNft = { tokenId: bigint; vp: bigint; usedThisRace: boolean };
type WalletSnapshot = {
  wallet: string;
  nfts: WalletNft[];
  totalVp: bigint;
  unusedRaceVp: bigint;
  committedVp: bigint;
  committed: boolean;
  revealed: boolean;
  revealedHorse: number;
  seasonPoints: bigint;
  allTimePoints: bigint;
};

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

export default function WalletPage() {
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [status, setStatus] = useState("Connect wallet to load your V7 Genesis position.");
  const [busy, setBusy] = useState(false);

  async function loadWallet() {
    const ethereum = getEthereum();
    if (!ethereum) {
      setStatus("Install an EVM wallet such as MetaMask.");
      return;
    }

    const genesis = HOF_CONTRACTS.genesis;
    const race = HOF_CONTRACTS.raceVoting;
    const community = HOF_CONTRACTS.communitySeason;
    if (!genesis) {
      setStatus("Genesis contract is not configured yet.");
      return;
    }

    try {
      setBusy(true);
      const wallet = await requestAccount(ethereum);
      const address = wallet as `0x${string}`;
      setStatus("Loading Genesis NFTs, Voting Power and championship points...");

      const balance = await publicClient.readContract({
        address: genesis,
        abi: GENESIS_VOTING_ABI,
        functionName: "balanceOf",
        args: [address],
      });

      const tokenIds = await Promise.all(
        Array.from({ length: Number(balance) }, (_, index) =>
          publicClient.readContract({
            address: genesis,
            abi: GENESIS_VOTING_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [address, BigInt(index)],
          }),
        ),
      );

      const nfts = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const vp = await publicClient.readContract({
            address: genesis,
            abi: GENESIS_VOTING_ABI,
            functionName: "votingPowerOf",
            args: [tokenId],
          });
          const usedThisRace = race
            ? await publicClient.readContract({
                address: race,
                abi: RACE_VOTING_ABI,
                functionName: "tokenUsed",
                args: [tokenId],
              })
            : false;
          return { tokenId, vp, usedThisRace };
        }),
      );

      const totalVp = nfts.reduce((sum, nft) => sum + nft.vp, BigInt(0));
      const unusedRaceVp = nfts.reduce(
        (sum, nft) => sum + (!nft.usedThisRace ? nft.vp : BigInt(0)),
        BigInt(0),
      );

      let committedVp = BigInt(0);
      let committed = false;
      let revealed = false;
      let revealedHorse = 0;
      if (race) {
        const [commitment, vp, isRevealed, horse] = await Promise.all([
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "commitmentOf", args: [address] }),
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "committedVP", args: [address] }),
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "revealed", args: [address] }),
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "revealedHorse", args: [address] }),
        ]);
        committed = commitment !== ZERO_BYTES32;
        committedVp = vp;
        revealed = isRevealed;
        revealedHorse = Number(horse);
      }

      let seasonPoints = BigInt(0);
      let allTimePoints = BigInt(0);
      if (community) {
        [seasonPoints, allTimePoints] = await Promise.all([
          publicClient.readContract({ address: community, abi: COMMUNITY_SEASON_ABI, functionName: "seasonPoints", args: [address] }),
          publicClient.readContract({ address: community, abi: COMMUNITY_SEASON_ABI, functionName: "allTimePoints", args: [address] }),
        ]);
      }

      setSnapshot({
        wallet,
        nfts,
        totalVp,
        unusedRaceVp,
        committedVp,
        committed,
        revealed,
        revealedHorse,
        seasonPoints,
        allTimePoints,
      });
      setStatus("Wallet position loaded from Robinhood Chain Testnet.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Could not load wallet position.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 44, letterSpacing: 2, color: "#7cff6b" }}>CHAPTER I — GENESIS · V7</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 72px)", margin: "8px 0 18px" }}>MY WALLET</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          Read-only legacy testnet dashboard. The voting usage and points below belong to the earlier commit/reveal contracts, not the new owner-trusted race.
        </p>
        <p><Link href="/race">Open owner-trusted Voting</Link> · <Link href="/standings">Season &amp; All-Time Leaderboards</Link></p>

        <div style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={loadWallet} disabled={busy} style={{ padding: "12px 18px" }}>
            {busy ? "LOADING..." : snapshot ? "REFRESH WALLET" : "CONNECT & LOAD"}
          </button>
        </div>

        {snapshot && (
          <>
            <section style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              {[
                ["Genesis NFTs", snapshot.nfts.length.toString()],
                ["Current wallet VP", snapshot.totalVp.toString()],
                ["Unused VP this race", snapshot.unusedRaceVp.toString()],
                ["Committed VP", snapshot.committedVp.toString()],
                ["Season points", snapshot.seasonPoints.toString()],
                ["All-Time points", snapshot.allTimePoints.toString()],
              ].map(([label, value]) => (
                <div key={label} style={{ border: "1px solid #333", borderRadius: 12, padding: 18 }}>
                  <small style={{ color: "#aaa" }}>{label}</small>
                  <div style={{ fontSize: 30, marginTop: 8 }}>{value}</div>
                </div>
              ))}
            </section>

            <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
              <h2>Legacy race snapshot</h2>
              <p><strong>Committed:</strong> {snapshot.committed ? "Yes" : "No"}</p>
              <p><strong>Revealed:</strong> {snapshot.revealed ? "Yes" : "No"}</p>
              {snapshot.revealed && <p><strong>Revealed HOF horse:</strong> <HofHorseIdentity number={snapshot.revealedHorse}/></p>}
              <p style={{ color: "#aaa" }}>Used NFT VP stays single-use for the current race even if the NFT is transferred.</p>
              <Link href="/race" style={{ color: "#7cff6b" }}>Open race flow →</Link>
            </section>

            <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
              <h2>Genesis inventory</h2>
              {snapshot.nfts.length === 0 ? (
                <p>No Genesis NFTs in this wallet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr><th style={{ textAlign: "left", padding: 10 }}>NFT</th><th style={{ textAlign: "left", padding: 10 }}>VP now</th><th style={{ textAlign: "left", padding: 10 }}>Used this race</th></tr></thead>
                    <tbody>
                      {snapshot.nfts.map((nft) => (
                        <tr key={nft.tokenId.toString()} style={{ borderTop: "1px solid #222" }}>
                          <td style={{ padding: 10 }}>#{nft.tokenId.toString()}</td>
                          <td style={{ padding: 10 }}>{nft.vp.toString()}</td>
                          <td style={{ padding: 10 }}>{nft.usedThisRace ? "Yes" : "No"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
