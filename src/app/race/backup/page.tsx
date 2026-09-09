"use client";

import Link from "next/link";
import { useState } from "react";
import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
} from "viem";
import {
  HOF_CONTRACTS,
  RACE_VOTING_ABI,
  ROBINHOOD_TESTNET_RPC,
  getEthereum,
  requestAccount,
} from "@/lib/hofClient";

type StoredPick = {
  horse: number;
  salt: `0x${string}`;
};

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

function storageKey(race: string, wallet: string) {
  return `hof:v7:race:${race.toLowerCase()}:${wallet.toLowerCase()}`;
}

function parseBackup(raw: string): StoredPick {
  const parsed = JSON.parse(raw) as Partial<StoredPick>;
  if (!Number.isInteger(parsed.horse) || Number(parsed.horse) < 1 || Number(parsed.horse) > 22) {
    throw new Error("Backup horse must be an integer from 1 to 22");
  }
  if (typeof parsed.salt !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(parsed.salt)) {
    throw new Error("Backup salt must be a 32-byte hex value");
  }
  return { horse: Number(parsed.horse), salt: parsed.salt as `0x${string}` };
}

function commitmentFor(pick: StoredPick) {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint8" }, { type: "bytes32" }],
      [pick.horse, pick.salt],
    ),
  );
}

export default function RaceBackupPage() {
  const [account, setAccount] = useState("");
  const [backup, setBackup] = useState("");
  const [status, setStatus] = useState("Ready");
  const race = HOF_CONTRACTS.raceVoting;

  async function connectAndLoad() {
    const ethereum = getEthereum();
    if (!ethereum || !race) {
      setStatus("Wallet or active V7 race contract is not configured.");
      return;
    }
    try {
      const wallet = await requestAccount(ethereum);
      setAccount(wallet);
      const raw = localStorage.getItem(storageKey(race, wallet));
      if (!raw) {
        setBackup("");
        setStatus("No secret-pick backup is stored in this browser for the active race.");
        return;
      }
      const pick = parseBackup(raw);
      setBackup(JSON.stringify(pick));
      setStatus("Local secret-pick backup loaded.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Could not load backup.");
    }
  }

  async function verifyAndRestore() {
    const ethereum = getEthereum();
    if (!ethereum || !race) {
      setStatus("Wallet or active V7 race contract is not configured.");
      return;
    }
    try {
      const wallet = await requestAccount(ethereum);
      setAccount(wallet);
      const pick = parseBackup(backup);
      const expected = commitmentFor(pick);
      const onChain = await publicClient.readContract({
        address: race,
        abi: RACE_VOTING_ABI,
        functionName: "commitmentOf",
        args: [wallet as `0x${string}`],
      });
      const zero = `0x${"0".repeat(64)}`;
      if (onChain === zero) throw new Error("This wallet has no commitment in the active race.");
      if (onChain.toLowerCase() !== expected.toLowerCase()) {
        throw new Error("Backup does not match this wallet's on-chain secret commitment.");
      }
      localStorage.setItem(storageKey(race, wallet), JSON.stringify(pick));
      setBackup(JSON.stringify(pick));
      setStatus("Backup verified against the on-chain commitment and restored locally.");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Backup verification failed.");
    }
  }

  async function copyBackup() {
    if (!backup) {
      setStatus("There is no backup loaded to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(backup);
      setStatus("Backup copied. Store it privately until reveal is complete.");
    } catch {
      setStatus("Clipboard access failed. Copy the backup text manually.");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/race" style={{ color: "#7cff6b" }}>← Back to race</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>V7 SECRET PICK SAFETY</p>
        <h1 style={{ fontSize: "clamp(38px, 7vw, 68px)", margin: "8px 0 20px" }}>BACKUP / RESTORE</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          This page does not change a vote. It only backs up or restores the horse number and salt required to reveal the already-submitted on-chain commitment.
        </p>

        <div style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Wallet:</strong> {account || "Not connected"}</p>
          <p><strong>Race contract:</strong> {race || "Not configured"}</p>
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={connectAndLoad} style={{ padding: "12px 18px" }}>
            CONNECT & LOAD LOCAL BACKUP
          </button>
        </div>

        <section style={{ marginTop: 24, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <label style={{ display: "block" }}>
            Secret-pick backup JSON
            <textarea
              value={backup}
              onChange={(event) => setBackup(event.target.value)}
              rows={7}
              placeholder='{"horse":7,"salt":"0x..."}'
              style={{ display: "block", width: "100%", marginTop: 10, padding: 12, fontFamily: "monospace" }}
            />
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            <button type="button" onClick={copyBackup} style={{ padding: "12px 18px" }}>COPY BACKUP</button>
            <button type="button" onClick={verifyAndRestore} disabled={!race || !backup} style={{ padding: "12px 18px" }}>
              VERIFY ON-CHAIN & RESTORE
            </button>
          </div>
        </section>

        <p style={{ marginTop: 24, color: "#aaa", lineHeight: 1.6 }}>
          Keep this value private. Anyone who sees it can learn the hidden pick before reveal. Restoring is accepted only when the backup recreates the commitment already recorded for the connected wallet.
        </p>
      </div>
    </main>
  );
}
