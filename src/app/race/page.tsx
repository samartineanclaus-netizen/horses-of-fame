"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  GENESIS_VOTING_ABI,
  HOF_CONTRACTS,
  RACE_VOTING_ABI,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

type StoredPick = { horse: number; salt: `0x${string}` };
type RaceState = { opensAt: bigint; closesAt: bigint; votingOpen: boolean };
type WalletRaceState = { committed: boolean; committedVP: bigint; revealed: boolean; revealedHorse: number };
type EligibleNft = { tokenId: bigint; vp: bigint };

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });
const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

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

function formatTimestamp(timestamp: bigint) {
  const ms = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(ms)) return timestamp.toString();
  return new Date(ms).toLocaleString();
}

function nftListValue(nfts: EligibleNft[]) {
  return nfts.map((nft) => nft.tokenId.toString()).join(", ");
}

export default function RacePage() {
  const [account, setAccount] = useState("");
  const [horse, setHorse] = useState("1");
  const [tokenIds, setTokenIds] = useState("");
  const [topUpIds, setTopUpIds] = useState("");
  const [status, setStatus] = useState("Ready");
  const [raceState, setRaceState] = useState<RaceState | null>(null);
  const [walletState, setWalletState] = useState<WalletRaceState | null>(null);
  const [eligibleNfts, setEligibleNfts] = useState<EligibleNft[]>([]);
  const [inventoryStatus, setInventoryStatus] = useState("Connect wallet to load eligible Genesis NFTs.");
  const [localPick, setLocalPick] = useState<StoredPick | null>(null);
  const [busy, setBusy] = useState(false);

  const race = HOF_CONTRACTS.raceVoting;
  const communitySeason = HOF_CONTRACTS.communitySeason;
  const genesis = HOF_CONTRACTS.genesis;

  async function loadRaceState() {
    if (!race) return;
    try {
      const [opensAt, closesAt, votingOpen] = await Promise.all([
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "opensAt" }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "closesAt" }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "votingOpen" }),
      ]);
      setRaceState({ opensAt, closesAt, votingOpen });
    } catch (error) {
      console.error("Could not load V7 race state:", error);
    }
  }

  async function loadWalletState(wallet: string): Promise<WalletRaceState | null> {
    if (!race || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
    const address = wallet as `0x${string}`;
    try {
      const [commitment, committedVP, revealed, revealedHorse] = await Promise.all([
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "commitmentOf", args: [address] }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "committedVP", args: [address] }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "revealed", args: [address] }),
        publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "revealedHorse", args: [address] }),
      ]);
      const nextState = {
        committed: commitment !== ZERO_BYTES32,
        committedVP,
        revealed,
        revealedHorse: Number(revealedHorse),
      };
      setWalletState(nextState);
      const raw = localStorage.getItem(storageKey(race, wallet));
      setLocalPick(raw ? JSON.parse(raw) as StoredPick : null);
      return nextState;
    } catch (error) {
      console.error("Could not load wallet race state:", error);
      return null;
    }
  }

  async function loadEligibleNfts(wallet: string, hasCommitted?: boolean) {
    if (!race || !genesis || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      setInventoryStatus("Genesis/race contract configuration is incomplete.");
      return;
    }
    const address = wallet as `0x${string}`;
    try {
      setInventoryStatus("Loading wallet Genesis NFTs and current-race usage...");
      const balance = await publicClient.readContract({
        address: genesis,
        abi: GENESIS_VOTING_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      const ids = await Promise.all(
        Array.from({ length: Number(balance) }, (_, index) =>
          publicClient.readContract({
            address: genesis,
            abi: GENESIS_VOTING_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [address, BigInt(index)],
          }),
        ),
      );
      const details = await Promise.all(
        ids.map(async (tokenId) => {
          const [vp, used] = await Promise.all([
            publicClient.readContract({ address: genesis, abi: GENESIS_VOTING_ABI, functionName: "votingPowerOf", args: [tokenId] }),
            publicClient.readContract({ address: race, abi: RACE_VOTING_ABI, functionName: "tokenUsed", args: [tokenId] }),
          ]);
          return { tokenId, vp, used };
        }),
      );
      const eligible = details.filter((item) => item.vp > BigInt(0) && !item.used).map(({ tokenId, vp }) => ({ tokenId, vp }));
      setEligibleNfts(eligible);
      const totalVp = eligible.reduce((sum, nft) => sum + nft.vp, BigInt(0));
      setInventoryStatus(`${eligible.length} unused voting-eligible NFT(s) available now · ${totalVp.toString()} VP.`);

      if (eligible.length > 0) {
        if (hasCommitted) setTopUpIds(nftListValue(eligible));
        else setTokenIds(nftListValue(eligible));
      }
    } catch (error) {
      console.error(error);
      setInventoryStatus("Could not enumerate this wallet's Genesis voting NFTs.");
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
      await loadRaceState();
      const nextWalletState = await loadWalletState(nextAccount);
      await loadEligibleNfts(nextAccount, nextWalletState?.committed ?? false);
      setStatus("Wallet connected to Robinhood Chain Testnet.");
    } catch (error) {
      console.error(error);
      setStatus("Wallet connection failed or was cancelled.");
    }
  }

  async function refreshInventory() {
    if (!account) {
      await connect();
      return;
    }
    const nextWalletState = await loadWalletState(account);
    await loadEligibleNfts(account, nextWalletState?.committed ?? false);
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
      if (!Number.isInteger(horseNumber) || horseNumber < 1 || horseNumber > 22) {
        throw new Error("Horse number must be between 1 and 22");
      }
      const ids = parseTokenIds(tokenIds);

      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const salt = bytesToHex(random) as `0x${string}`;
      const commitment = keccak256(
        encodeAbiParameters(
          [{ type: "uint8" }, { type: "bytes32" }],
          [horseNumber, salt],
        ),
      );

      const data = encodeFunctionData({
        abi: RACE_VOTING_ABI,
        functionName: "commitVote",
        args: [commitment, ids],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: race, data }],
      });

      const pick: StoredPick = { horse: horseNumber, salt };
      localStorage.setItem(storageKey(race, from), JSON.stringify(pick));
      setLocalPick(pick);
      setStatus(`Secret pick submitted. Keep the local secret backup until reveal. Tx: ${String(hash)}`);
      await loadWalletState(from);
      await loadRaceState();
      await loadEligibleNfts(from, true);
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
      const data = encodeFunctionData({
        abi: RACE_VOTING_ABI,
        functionName: "addVotingPower",
        args: [ids],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: race, data }],
      });
      setStatus(`Additional unused NFT VP submitted to the SAME pick. Tx: ${String(hash)}`);
      await loadWalletState(from);
      await loadEligibleNfts(from, true);
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

      const data = encodeFunctionData({
        abi: RACE_VOTING_ABI,
        functionName: "revealVote",
        args: [pick.horse, pick.salt],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: race, data }],
      });
      setStatus(`Reveal submitted. Tx: ${String(hash)}`);
      await loadWalletState(from);
      await loadRaceState();
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Reveal failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function claimCommunityPoints() {
    const ethereum = getEthereum();
    if (!ethereum || !race || !communitySeason) {
      setStatus("The active V7 race/Community contracts are not configured yet.");
      return;
    }

    try {
      setBusy(true);
      const from = await requestAccount(ethereum);
      setAccount(from);
      const data = encodeFunctionData({
        abi: COMMUNITY_SEASON_ABI,
        functionName: "claimRacePoints",
        args: [race],
      });
      const hash = await ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from, to: communitySeason, data }],
      });
      setStatus(`Community points claim submitted. Tx: ${String(hash)}`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Community points claim failed or was cancelled.");
    } finally {
      setBusy(false);
    }
  }

  const availableVp = eligibleNfts.reduce((sum, nft) => sum + nft.vp, BigInt(0));

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>V7 FLAGSHIP RACE</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>SECRET PICK</h1>
        <p style={{ fontSize: 20, lineHeight: 1.6 }}>
          One wallet = one secret pick. Your eligible NFT VP backs that same horse. A newly acquired unused NFT can add VP to the same pick while the 24-hour voting window remains open.
        </p>

        <div style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Wallet:</strong> {account || "Not connected"}</p>
          <p><strong>Race contract:</strong> {race || "Waiting for active V7 race address"}</p>
          <p><strong>Community contract:</strong> {communitySeason || "Waiting for V7 Community address"}</p>
          {raceState && (
            <>
              <p><strong>Voting opens:</strong> {formatTimestamp(raceState.opensAt)}</p>
              <p><strong>Voting closes:</strong> {formatTimestamp(raceState.closesAt)}</p>
              <p><strong>Voting open now:</strong> {raceState.votingOpen ? "Yes" : "No"}</p>
            </>
          )}
          {walletState && (
            <>
              <p><strong>Wallet committed:</strong> {walletState.committed ? "Yes" : "No"}</p>
              <p><strong>Committed VP:</strong> {walletState.committedVP.toString()}</p>
              <p><strong>Revealed:</strong> {walletState.revealed ? "Yes" : "No"}</p>
              {walletState.revealed && <p><strong>Revealed HOF horse:</strong> #{walletState.revealedHorse}</p>}
            </>
          )}
          <p><strong>Unused eligible inventory:</strong> {inventoryStatus}</p>
          {eligibleNfts.length > 0 && (
            <p><strong>Available now:</strong> {eligibleNfts.map((nft) => `#${nft.tokenId} (${nft.vp} VP)`).join(" · ")} · Total {availableVp.toString()} VP</p>
          )}
          <p><strong>Status:</strong> {status}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={connect} style={{ padding: "12px 18px", cursor: "pointer" }}>CONNECT / REFRESH WALLET</button>
            <button type="button" onClick={refreshInventory} disabled={!race || !genesis || busy} style={{ padding: "12px 18px", cursor: "pointer" }}>REFRESH ELIGIBLE NFTS</button>
          </div>
        </div>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>1. Commit one secret pick</h2>
          <label style={{ display: "block", marginTop: 14 }}>
            HOF horse number (1–22)
            <input value={horse} onChange={(e) => setHorse(e.target.value)} inputMode="numeric" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} />
          </label>
          <label style={{ display: "block", marginTop: 14 }}>
            Eligible NFT token IDs, comma separated
            <input value={tokenIds} onChange={(e) => setTokenIds(e.target.value)} placeholder="23, 451, 1253" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} />
          </label>
          {eligibleNfts.length > 0 && !walletState?.committed && (
            <button type="button" onClick={() => setTokenIds(nftListValue(eligibleNfts))} style={{ marginTop: 10, padding: "8px 12px" }}>
              USE ALL CURRENT UNUSED ELIGIBLE NFTS
            </button>
          )}
          <br />
          <button type="button" onClick={commitPick} disabled={!race || busy || Boolean(walletState?.committed)} style={{ marginTop: 16, padding: "12px 18px" }}>
            COMMIT SECRET PICK
          </button>
          {localPick && (
            <div style={{ marginTop: 18, padding: 14, background: "#111", overflowWrap: "anywhere" }}>
              <strong>Local reveal backup</strong>
              <p>Horse: #{localPick.horse}</p>
              <p>Salt: {localPick.salt}</p>
              <p>Keep this private until the reveal stage. It is stored only in this browser and is required to reveal the committed pick.</p>
            </div>
          )}
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>2. Add VP from newly acquired unused NFT(s)</h2>
          <p>This cannot change your horse. It only adds currently owned, unused voting power to the pick already committed by this wallet.</p>
          <input value={topUpIds} onChange={(e) => setTopUpIds(e.target.value)} placeholder="New token IDs, e.g. 777" style={{ display: "block", width: "100%", padding: 12, marginTop: 8 }} />
          {eligibleNfts.length > 0 && walletState?.committed && !walletState.revealed && (
            <button type="button" onClick={() => setTopUpIds(nftListValue(eligibleNfts))} style={{ marginTop: 10, padding: "8px 12px" }}>
              USE ALL CURRENT UNUSED ELIGIBLE NFTS
            </button>
          )}
          <br />
          <button type="button" onClick={addVotingPower} disabled={!race || busy || !walletState?.committed || Boolean(walletState?.revealed)} style={{ marginTop: 16, padding: "12px 18px" }}>
            ADD VP TO SAME PICK
          </button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>3. Reveal after voting closes</h2>
          <p>The salt and horse number are stored locally in this browser after a commit submission. V7's final reveal/finalization deadline mechanics remain an open implementation question and are not invented here.</p>
          <button type="button" onClick={revealPick} disabled={!race || busy || !walletState?.committed || Boolean(walletState?.revealed) || Boolean(raceState?.votingOpen)} style={{ padding: "12px 18px" }}>
            REVEAL PICK
          </button>
        </section>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <h2>4. Claim Community race points</h2>
          <p>After the closed race has been registered in the current Community season, this calls the existing V7 scoring contract. The contract enforces reveal, current-season membership and one scoring result per wallet per race.</p>
          <button type="button" onClick={claimCommunityPoints} disabled={!race || !communitySeason || busy || !walletState?.revealed} style={{ padding: "12px 18px" }}>
            CLAIM COMMUNITY POINTS
          </button>
        </section>
      </div>
    </main>
  );
}
