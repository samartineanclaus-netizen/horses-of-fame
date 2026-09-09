"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  bytesToHex,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
} from "viem";
import {
  COMMUNITY_SEASON_ABI,
  GENESIS_READ_ABI,
  HOF_CONTRACTS,
  RACE_VOTING_ABI,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

type StoredPick = { horse: number; salt: `0x${string}` };
type RaceState = { opensAt: bigint; closesAt: bigint; votingOpen: boolean };
type WalletState = { committed: boolean; committedVP: bigint; revealed: boolean };
type OwnedNft = { tokenId: bigint; vp: bigint; used: boolean };

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

function parseTokenIds(value: string): bigint[] {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error("Enter at least one NFT token ID");
  return parts.map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid token ID: ${part}`);
    return BigInt(part);
  });
}

function storageKey(race: string, wallet: string) {
  return `hof:v7:race:${race.toLowerCase()}:${wallet.toLowerCase()}`;
}

function nftListValue(nfts: OwnedNft[]) {
  return nfts.map((nft) => nft.tokenId.toString()).join(", ");
}

export default function RacePage() {
  const [account, setAccount] = useState("");
  const [horse, setHorse] = useState("1");
  const [tokenIds, setTokenIds] = useState("");
  const [topUpIds, setTopUpIds] = useState("");
  const [status, setStatus] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const [raceState, setRaceState] = useState<RaceState | null>(null);
  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [ownedNfts, setOwnedNfts] = useState<OwnedNft[]>([]);

  const race = HOF_CONTRACTS.raceVoting;
  const configured = useMemo(() => Boolean(race && HOF_CONTRACTS.genesis), [race]);
  const eligibleNfts = useMemo(() => ownedNfts.filter((nft) => nft.vp > BigInt(0) && !nft.used), [ownedNfts]);

  async function loadRaceState(wallet?: string) {
    if (!race) return;
    try {
      const [opensAt, closesAt, votingOpen] = await Promise.all([
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "opensAt" }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "closesAt" }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "votingOpen" }),
      ]);
      setRaceState({ opensAt, closesAt, votingOpen });

      if (wallet && HOF_CONTRACTS.genesis) {
        const walletAddress = wallet as `0x${string}`;
        const [commitment, committedVP, revealed, balance] = await Promise.all([
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "commitmentOf", args: [walletAddress] }),
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "committedVP", args: [walletAddress] }),
          publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "revealed", args: [walletAddress] }),
          publicClient.readContract({ address: HOF_CONTRACTS.genesis, abi: GENESIS_READ_ABI, functionName: "balanceOf", args: [walletAddress] }),
        ]);
        setWalletState({ committed: commitment !== `0x${"0".repeat(64)}`, committedVP, revealed });

        const inventory = await Promise.all(
          Array.from({ length: Number(balance) }, async (_, index) => {
            const tokenId = await publicClient.readContract({
              address: HOF_CONTRACTS.genesis!,
              abi: GENESIS_READ_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [walletAddress, BigInt(index)],
            });
            const [vp, used] = await Promise.all([
              publicClient.readContract({ address: HOF_CONTRACTS.genesis!, abi: GENESIS_READ_ABI, functionName: "votingPowerOf", args: [tokenId] }),
              publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "tokenUsed", args: [tokenId] }),
            ]);
            return { tokenId, vp, used } as OwnedNft;
          }),
        );
        setOwnedNfts(inventory);
      }
    } catch (error) {
      console.error("Could not load race state:", error);
    }
  }

  useEffect(() => {
    void loadRaceState();
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
      await loadRaceState(nextAccount);
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed or was cancelled.");
    }
  }

  async function commitPick() {
    const ethereum = getEthereum();
    if (!ethereum || !race) {
      setStatus("The active V7 race contract is not configured yet.");
      return;
    }

    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const horseNumber = Number(horse);
      if (!Number.isInteger(horseNumber) || horseNumber < 1 || horseNumber > 22) throw new Error("Horse number must be between 1 and 22");
      const ids = parseTokenIds(tokenIds);

      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const salt = bytesToHex(random) as `0x${string}`;
      const commitment = keccak256(encodeAbiParameters([{ type: "uint8" }, { type: "bytes32" }], [horseNumber, salt]));
      const data = encodeFunctionData({ abi: RACE_VOTING_ABI, functionName: "commitVote", args: [commitment, ids] });
      const hash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: race, data }] });

      const pick: StoredPick = { horse: horseNumber, salt };
      localStorage.setItem(storageKey(race, from), JSON.stringify(pick));
      setStatus(`Secret pick submitted. Keep this browser storage until reveal. Tx: ${String(hash)}`);
      await loadRaceState(from);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Vote failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function addVotingPower() {
    const ethereum = getEthereum();
    if (!ethereum || !race) {
      setStatus("The active V7 race contract is not configured yet.");
      return;
    }
    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const ids = parseTokenIds(topUpIds);
      const data = encodeFunctionData({ abi: RACE_VOTING_ABI, functionName: "addVotingPower", args: [ids] });
      const hash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: race, data }] });
      setStatus(`Additional unused NFT VP submitted to the SAME pick. Tx: ${String(hash)}`);
      await loadRaceState(from);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "VP top-up failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function revealPick() {
    const ethereum = getEthereum();
    if (!ethereum || !race) {
      setStatus("The active V7 race contract is not configured yet.");
      return;
    }
    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const raw = localStorage.getItem(storageKey(race, from));
      if (!raw) throw new Error("No locally stored secret pick found for this wallet and race");
      const pick = JSON.parse(raw) as StoredPick;
      const data = encodeFunctionData({ abi: RACE_VOTING_ABI, functionName: "revealVote", args: [pick.horse, pick.salt] });
      const hash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: race, data }] });
      setStatus(`Reveal submitted. Tx: ${String(hash)}`);
      await loadRaceState(from);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Reveal failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function claimCommunityPoints() {
    const ethereum = getEthereum();
    const community = HOF_CONTRACTS.communitySeason;
    if (!ethereum || !race || !community) {
      setStatus("The V7 race/Community contracts are not configured yet.");
      return;
    }
    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      const data = encodeFunctionData({ abi: COMMUNITY_SEASON_ABI, functionName: "claimRacePoints", args: [race] });
      const hash = await ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: community, data }] });
      setStatus(`Community points claim submitted. Tx: ${String(hash)}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Community points claim failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>V7 FLAGSHIP RACE</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>SECRET PICK</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6 }}>One wallet = one secret pick. Eligible unused NFT VP supplied by the wallet backs that same horse. A newly acquired unused NFT can add VP to the same pick while the 24-hour voting window remains open.</p>

        <div style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Wallet:</strong> {account || "Not connected"}</p>
          <p><strong>Race contract:</strong> {race || "Waiting for active V7 race address"}</p>
          <p><strong>Configured:</strong> {configured ? "Yes" : "No"}</p>
          {raceState && <p><strong>Voting open:</strong> {raceState.votingOpen ? "Yes" : "No"} · Opens {raceState.opensAt.toString()} · Closes {raceState.closesAt.toString()}</p>}
          {walletState && <p><strong>Committed VP:</strong> {walletState.committedVP.toString()} · Revealed: {walletState.revealed ? "Yes" : "No"}</p>}
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={connect} style={{ padding: "12px 18px", cursor: "pointer" }}>CONNECT / REFRESH WALLET</button>
        </div>

        {account && (
          <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
            <h2>Wallet Genesis NFTs</h2>
            <p>{ownedNfts.length === 0 ? "No Genesis NFTs found." : ownedNfts.map((nft) => `#${nft.tokenId} · ${nft.vp} VP · ${nft.used ? "used" : "unused"}`).join(" | ")}</p>
          </section>
        )}

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>1. Commit one secret pick</h2>
          <label style={{ display: "block", marginTop: 14 }}>HOF horse number (1–22)<input value={horse} onChange={(e) => setHorse(e.target.value)} inputMode="numeric" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} /></label>
          <label style={{ display: "block", marginTop: 14 }}>Eligible NFT token IDs, comma separated<input value={tokenIds} onChange={(e) => setTokenIds(e.target.value)} placeholder="23, 451, 1253" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} /></label>
          {eligibleNfts.length > 0 && <button type="button" onClick={() => setTokenIds(nftListValue(eligibleNfts))} style={{ marginTop: 10, padding: "8px 12px" }}>USE ALL CURRENT UNUSED ELIGIBLE NFTS</button>}
          <br />
          <button type="button" onClick={commitPick} disabled={!race || busy || Boolean(walletState?.committed)} style={{ marginTop: 16, padding: "12px 18px" }}>COMMIT SECRET PICK</button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>2. Add VP from newly acquired unused NFT(s)</h2>
          <p>This cannot change your horse. It only adds VP to the pick already committed by this wallet.</p>
          <input value={topUpIds} onChange={(e) => setTopUpIds(e.target.value)} placeholder="New token IDs, e.g. 777" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} />
          {eligibleNfts.length > 0 && <button type="button" onClick={() => setTopUpIds(nftListValue(eligibleNfts))} style={{ marginTop: 10, padding: "8px 12px" }}>USE ALL CURRENT UNUSED ELIGIBLE NFTS</button>}
          <br />
          <button type="button" onClick={addVotingPower} disabled={!race || busy || !walletState?.committed || Boolean(walletState?.revealed)} style={{ marginTop: 16, padding: "12px 18px" }}>ADD VP TO SAME PICK</button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>3. Reveal after voting closes</h2>
          <p>The salt and horse number are stored locally in this browser after a commit submission. The final V7 reveal/finalization deadline mechanics remain an open implementation question and are not invented here.</p>
          <button type="button" onClick={revealPick} disabled={!race || busy || !walletState?.committed || Boolean(walletState?.revealed) || Boolean(raceState?.votingOpen)} style={{ padding: "12px 18px" }}>REVEAL PICK</button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>4. Claim Community race points</h2>
          <p>After the closed race has been registered in the current Community season, this calls the existing V7 scoring contract. The contract enforces reveal, current-season membership and one scoring result per wallet per race.</p>
          <button type="button" onClick={claimCommunityPoints} disabled={!race || !HOF_CONTRACTS.communitySeason || busy || !walletState?.revealed} style={{ padding: "12px 18px" }}>CLAIM COMMUNITY POINTS</button>
        </section>
      </div>
    </main>
  );
}
