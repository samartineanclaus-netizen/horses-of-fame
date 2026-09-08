"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { HOF_CONTRACTS, ROBINHOOD_TESTNET_RPC } from "@/lib/hofClient";

const publicClient = createPublicClient({ transport: http(ROBINHOOD_TESTNET_RPC) });

const RESULTS_ABI = [
  { type: "function", name: "opensAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "closesAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ranking", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[22]" }] },
  { type: "function", name: "horseVP", stateMutability: "view", inputs: [{ name: "horseNumber", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "horseRacePoints", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[22]" }] },
] as const;

type ResultRow = { position: number; horse: number; vp: string; points: number };

export default function ResultsPage() {
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [status, setStatus] = useState("Loading configured V7 race...");
  const [opensAt, setOpensAt] = useState("-");
  const [closesAt, setClosesAt] = useState("-");

  async function load() {
    const race = HOF_CONTRACTS.raceVoting;
    if (!race) {
      setStatus("No active V7 race contract is configured.");
      setRows([]);
      return;
    }

    try {
      const [open, close] = await Promise.all([
        publicClient.readContract({ address: race, abi: RESULTS_ABI, functionName: "opensAt" }),
        publicClient.readContract({ address: race, abi: RESULTS_ABI, functionName: "closesAt" }),
      ]);
      setOpensAt(new Date(Number(open) * 1000).toLocaleString());
      setClosesAt(new Date(Number(close) * 1000).toLocaleString());

      const latest = await publicClient.getBlock();
      if (latest.timestamp < close) {
        setRows([]);
        setStatus("Voting is still open. V7 live totals and ranking remain hidden until the race closes.");
        return;
      }

      const [ranking, racePoints] = await Promise.all([
        publicClient.readContract({ address: race, abi: RESULTS_ABI, functionName: "ranking" }),
        publicClient.readContract({ address: race, abi: RESULTS_ABI, functionName: "horseRacePoints" }),
      ]);

      const vp = await Promise.all(
        ranking.map((horse) =>
          publicClient.readContract({ address: race, abi: RESULTS_ABI, functionName: "horseVP", args: [horse] }),
        ),
      );

      setRows(
        ranking.map((horse, index) => ({
          position: index + 1,
          horse: Number(horse),
          vp: String(vp[index]),
          points: Number(racePoints[Number(horse) - 1]),
        })),
      );
      setStatus("Closed-race ranking loaded from Robinhood Chain Testnet. Equal VP uses the lower HOF number tie-break.");
    } catch (error) {
      console.error(error);
      setRows([]);
      setStatus("Could not read the configured V7 race results.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#050505", color: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#7cff6b" }}>← Horses of Fame</Link>
        <p style={{ marginTop: 48, letterSpacing: 2, color: "#7cff6b" }}>V7 FLAGSHIP RACE</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 76px)", margin: "8px 0 20px" }}>RACE RESULTS</h1>
        <p style={{ fontSize: 19, lineHeight: 1.6 }}>
          During the 24-hour voting window, live VP totals and ranking stay hidden. This page only loads the deterministic 22-horse ranking after the configured race closes.
        </p>

        <section style={{ marginTop: 28, padding: 22, border: "1px solid #333", borderRadius: 12 }}>
          <p><strong>Opens:</strong> {opensAt}</p>
          <p><strong>Closes:</strong> {closesAt}</p>
          <p><strong>Status:</strong> {status}</p>
          <button type="button" onClick={() => void load()} style={{ padding: "12px 18px" }}>REFRESH RESULTS</button>
        </section>

        {rows.length > 0 && (
          <section style={{ marginTop: 24, overflowX: "auto", border: "1px solid #333", borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 12 }}>Position</th>
                  <th style={{ textAlign: "left", padding: 12 }}>HOF Horse</th>
                  <th style={{ textAlign: "right", padding: 12 }}>Revealed VP</th>
                  <th style={{ textAlign: "right", padding: 12 }}>Race PTS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.horse} style={{ borderTop: "1px solid #222" }}>
                    <td style={{ padding: 12 }}>{row.position}</td>
                    <td style={{ padding: 12 }}>#{String(row.horse).padStart(2, "0")}</td>
                    <td style={{ padding: 12, textAlign: "right" }}>{row.vp}</td>
                    <td style={{ padding: 12, textAlign: "right" }}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p style={{ marginTop: 24, color: "#aaa" }}>
          Ranking is Community VP only; no RNG is introduced. Positions 1–10 score 25/18/15/12/10/8/6/4/2/1 and positions 11–22 score 0.
        </p>
      </div>
    </main>
  );
}
