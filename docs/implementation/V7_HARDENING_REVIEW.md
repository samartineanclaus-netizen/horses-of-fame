# V7 hardening review — awaiting approval, no commit

Branch: `work/v7-hof-integration`. HEAD remains
`2037eae140d8a14952c7962a1e37f7572708ebe3`; pending merge parent remains
`8d78e328a0675239d5e856f945cc8c82c295928c`. Both original branch refs and the
previous worktrees are unchanged. No commit, push, main merge or deployment.
This report supersedes the gas/Chapter 2 status in V7_INTEGRATION_REVIEW.md;
its ancestry and manually resolved merge-conflict history remain applicable.

## Implemented settlement changes

The old 15,823,581 gas measurement was **Community season prize determination**,
not atomic Race Reveal. It scanned every Genesis NFT in one transaction.

- Every race score, participant-index, prize-holder and prize-score batch now has
  an on-chain maximum of **25**. The operator helpers enforce the same maximum.
- Race scores use the immutable accepted ballot index, Merkle-authenticated
  points and a consecutive cursor. Replay, reordering, missing ballots and
  oversized batches are rejected. `finalize` still requires all accepted ballots.
- Race ranking, pointsOf, Season and All-Time contributions remain inactive until
  full race finalization. Preparation cannot make a partial race final. No voter
  reveal or points claim was introduced; V7 scoring remains unchanged.
- Indexing reads only `ballotWalletAt`, avoiding ciphertext copies. Each race has
  its own monotonic indexing cursor; exhausted indexing cannot award points twice.
- Prize determination is now `beginPrizeScan` → `processPrizeHolders` batches →
  `processPrizeScores` batches → owner-only `finalizeSeason`. Public podium reads
  and treasury prize payment remain blocked until all required work completes.
- Scan epochs and explicit expected cursors prevent duplicate/stale work. A valid
  scan cannot be arbitrarily reset by a competing caller. Storage is reused per
  wallet/score bucket, with epoch stamps rather than unbounded clearing loops.
- `GenesisHorses.ownershipRevision` increments on actual ownership-changing mint,
  transfer and burn. Every scan step and finalization requires the captured
  revision still to match. Changed ownership requires a fresh scan epoch, so the
  winner tie-break is evaluated against ownership valid at final determination.
  Approvals, failed transfers and self-transfers do not alter actual ownership.
- `settleSeason` is an operator helper that resumes on-chain cursors, or starts a
  fresh epoch on a later invocation after ownership changes. It does not hide
  errors or substitute a partial podium. Only the owner can finalize the season.
- The transient-storage prize scan has been removed. Supply caps, refund/burn,
  winner eligibility and rollover economics have not changed.

Logical race scoring and season prize determination are distinct. A completely
finalized race contributes to both live leaderboards immediately; its season's
prize podium remains pending until the season preparation is complete. No
partial race or provisional prize podium is labelled final.

## Gas results — per batch versus cumulative

Environment: local Hardhat EVM, Solidity 0.8.25, Cancun, optimizer runs 200.
Every measured normal settlement transaction is asserted below **3,000,000 gas**;
this is a local test budget, not an assertion about Robinhood's block gas limit.
The cap of 25 is contract-enforced; operators can choose smaller batches.

Main realistic stress scenario:
- Full 2,222 Genesis minted through isolated allocation buckets and real USDC
  public sale; Team transfers only after sell-out.
- 2,200 distinct current holders each submit a real encrypted vote through the
  client/admission/signature/contract path. All 4,800 rarity VP are accounted for.
- All vote for horse #22, forcing all 2,200 score writes to be nonzero and Merkle
  proofs to reach the full-supply depth. Partial and duplicate finalizations fail.
- The other nine season races use clearly marked local finalized zero-turnout
  fixtures to isolate prize gas. They are not production voting mocks.
- Complete indexing and all 2,222 token IDs are scanned, with no storage injection.

| Stage | Transactions | Gas per transaction, min–max | Total gas for stage |
| --- | --- | --- | --- |
| freeze | 1 | 95,744–95,744 | 95,744 |
| propose | 1 | 278,280–278,280 | 278,280 |
| score batch | 88 | 831,685–946,164 | 81,470,368 |
| race finalization | 1 | 73,131–73,131 | 73,131 |
| index batch | 88 | 1,367,211–1,440,411 | 121,058,868 |
| begin prize scan | 1 | 265,069–265,069 | 265,069 |
| holder batch | 89 | 482,981–814,760 | 70,856,529 |
| score bucket batch | 11 | 73,503–203,746 | 1,959,268 |
| season finalization | 1 | 245,031–245,031 | 245,031 |

**Race settlement total: 81,917,523 gas over 91 transactions.**
**Season prize preparation/finalization total: 194,384,765 gas over 190 transactions.**
**Combined measured total: 276,302,288 gas over 281 transactions.**
Totals exclude setup/deployment/mint/transfer/vote transactions, intentionally
rejected test calls and an exhausted-cursor no-op. No USD/cent estimate is made.
The prize total includes participant indexing; it must not be compared directly
to the old scan-only 15.8M measurement. Persistent batched scans have higher total
cost, but no measured transaction approaches the old 16M local budget.

Additional storage-expensive scenario: 25 wallets have **25 different reachable
V7 season scores**, built from valid race scores over ten local fixture races.
A single holder batch touches 25 cold score buckets: **2,625,322 gas**.
Maximum index batch in that scenario: **1,461,413 gas**. It checks the actual
computed podium as well as the gas limit. This catches a more expensive storage
layout than the all-tied full-supply scenario. It is a component gas fixture;
the 2,200-voter scenario above separately exercises real encrypted settlement.

The exact per-transaction receipts and aggregate values are preserved in
`V7_SETTLEMENT_GAS.json`. Minor calldata gas variation from randomized encryption
and signatures is normal across reruns. These scenarios are not a mathematical
proof of every possible score/ownership layout or a target-chain benchmark.

## Chapter 2 on-chain enforcement

`HOFTrustedLeaderboards.activateChapter2()` is owner-only. It requires exactly
60 registered Chapter 1 races, all finalized, and:

```solidity
block.timestamp >= races[59].revealedAt() + 30 days
```

It records `chapter2StartedAt` and emits `Chapter2Activated(anchor, startedAt)`.
Activation is irreversible and repeat calls revert. There is no maximum delay,
no configurable bypass, no auxiliary-admin timestamp and no early-start override.

Tests deliberately delay Race #60 reveal two days beyond voting closure, then
check 30 days −1 second (reject), exact 30 days (accept), +1 second (accept),
unauthorized activation, unfinished Chapter 1 and duplicate activation. They
also activate before auxiliary Season 6 bookkeeping, and after delaying that
bookkeeping by 20 days, confirming it cannot move the anchor.

This is an activation gate and recorded state only. It invents no Chapter 2 mint,
race configuration, prize economics or rollover withdrawal authority. Future
Chapter 2 functionality must consume this gate rather than create a second
activation path. The present contracts do not contain another Chapter 2 path.

## Regression results

| Check | Result |
| --- | --- |
| Solidity compile --force | PASS: 51 files, Solidity 0.8.25 |
| Entire contract suite | PASS: **182 tests** |
| Canonical integration | PASS: 2 tests included in the 182; exact IDs 1–22 through real crypto/API/EVM/readers |
| Frontend tests including Voting interaction | PASS: **32 tests** |
| Total contract + frontend tests | **214 passing**, no failures/skips |
| Typecheck | PASS |
| Lint | PASS: 0 errors, 8 existing warnings |
| Production Next build | PASS |
| V7 Master integrity | PASS; Master untouched |
| Canonical dataset/portrait byte hashes | Unchanged, also no diff against frontend parent |
| Whitespace/conflict checks | PASS; no unmerged index entries |
| Dependency manifests/lockfile in this hardening task | Unchanged |

The eight existing lint warnings: mount-state effects on allocations/history/
mint/refund; two decorative image optimization warnings on the homepage; Voting
snapshot reset and request-generation-ref cleanup. No new warning was added.
The old transient-storage compiler warning is gone. npm reports an environment
http-proxy configuration warning; it does not prevent the checks from passing.
No real-wallet/network QA or external deployment is claimed.

New regression coverage includes oversized batches, cursor/epoch replay,
incomplete scan, owner-only Chapter activation, scan restart/resume, ownership transfer
after the final batch, mint/burn invalidation, untouched revision on failed
transfers/approvals, retained nonholder tie semantics and all Chapter boundaries.
Existing duplicate vote/finalization/settlement, 24h boundaries, owner exclusions,
refund reentrancy/double refund, supply, rollover and Master integrity tests pass.

## Owner trust, audit and remaining risks

The approved trust assumption is unchanged: HOF Owner/backend is trusted for
confidentiality, decryption, tally/scoring and availability. It can decrypt early
(and privately does so at admission), while owner/backend/Team are excluded from
voting. Commitments and coverage proofs do not prove honest hidden-choice scoring.
No threshold operators or additional cryptographic architecture was introduced.

The fresh production dependency audit still has **3 high and 23 moderate package
entries**, not 26 distinct CVEs. All are production-graph entries, not dev-only;
many belong to currently unused connector packages. The exact package/version/
provenance/impact/fix inventory is `V7_DEPENDENCY_AUDIT.md`; raw advisories and
ranges are in `V7_DEPENDENCY_AUDIT.json`. High entries are axios 1.16.0,
lodash 4.17.21 and nested ws 8.18.0. No dependency update, force fix or major upgrade
was applied. Remediation is proposed separately for approval.

**Availability tradeoff:** because ownership must be current and transfers remain
allowed, repeated actual transfers can invalidate scans indefinitely. The worker
must retry and pay for fresh batches. This cannot create a false winner, but it
can delay prize finalization and jeopardize the existing seven-day next-season
registration window. No transfer freeze, deadline relaxation, stale snapshot or
owner override has been introduced to conceal this tradeoff. Operationally this
requires review before launch; gas safety does not guarantee liveness.

Genesis and the board must be deployed as compatible reviewed versions: an old
Genesis without ownershipRevision cannot support this batching contract. No
existing deployed address was silently reused or upgraded. Keys, HTTPS service,
scheduler, relayer funding, RPC/indexed caching, real chain gas/opcode support,
real-wallet/mobile QA and independent security review remain launch work.

## Additional files changed since the previous integration review

| File | Change |
| --- | --- |
| contracts/GenesisHorses.sol | Ownership revision on actual ownership changes; economics unchanged. |
| contracts/HOFTrustedRace.sol | MAX_BATCH 25; wallet-only ballot getter. |
| contracts/HOFTrustedLeaderboards.sol | Capped indexing/prize phases, revision/epoch/cursors, Chapter 2 activation gate. |
| contracts/mocks/TrustedRaceGasFixture.sol | Wallet getter and varied-score gas-only fixture. |
| lib/owner-voting/backend.cjs | Enforced batch cap and resumable season operator helper. |
| test/V7OwnerTrustedVoting.test.js | Adapt batch/season calls; restart, replay and live-ownership regressions. |
| test/V7TrustedGasStress.test.js | Real 2,200-voter/full-supply settlement and cold-score-bucket gas scenarios. |
| test/V7Chapter2Activation.test.js | New gate, authorization, timestamp/late-admin and duplicate tests. |
| test/helpers/trusted-settlement.cjs | Test helper for bounded prize preparation. |
| docs/implementation/V7_ADMISSION_API.md | Operator/API workflow, batch cap, activation and liveness limits. |
| docs/implementation/V7_OPEN_QUESTIONS.md | Mark Chapter gate resolved; current batching/trust and open operational gates. |
| docs/implementation/V7_OWNER_TRUSTED_IMPLEMENTATION.md | Replace obsolete single-scan implementation/gas description. |
| docs/implementation/V7_INTEGRATION_REVIEW.md | Mark historical gas/Chapter findings superseded; retain ancestry/conflict provenance. |
| docs/implementation/V7_DEPENDENCY_AUDIT.md | Exact 26-entry audit and separate remediation proposal. |
| docs/implementation/V7_DEPENDENCY_AUDIT.json | Raw production audit evidence. |
| docs/implementation/V7_SETTLEMENT_GAS.json | Per-transaction gas evidence and aggregate totals. |
| docs/implementation/V7_HARDENING_REVIEW.md | This approval report. |

No commit until the owner approves the concrete reviewed result.
