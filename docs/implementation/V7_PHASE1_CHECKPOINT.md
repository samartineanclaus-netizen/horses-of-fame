# V7 Phase 1 local checkpoint verification

Base: `c726cd21eddf1516f4076793289a2b598d2d1db0`.
Branch: `work/v7-security-hardening`.

**333 distinct passing tests/scenarios:** 267 contract/backend regression cases,
4 complete-season benchmark cases, 62 frontend cases. Repeated targeted runs are
not counted twice. Every full-season profile executes 10 x 2200 votes, 4800 VP/race.
Tests include a new 60-canonical-race Chapter 2 lifecycle and all five blocker areas.

Compile, typecheck and production build: PASS. Lint: 0 errors / 8 inherited warnings.
No dependency upgrade, paid service, live deployment, push or main merge.
Owner-trusted confidentiality/admission/tally remain explicit accepted assumptions.

Tests were partitioned to allow long profiles to run independently. The initial
sequential run completed profiles 5/10; an overlapping unfinished profile was
interrupted, not counted as a passing test. Profiles 20/25 passed independently;
all final non-benchmark tests passed in a separate complete run. Only completed
profiles appear below. Factory deployment and current provenance checks are used.
These are local Hardhat measurements, not Robinhood receipts or a fixed USD cost.

| Batch | Mean Vote gas | Maximum Vote transaction gas | Vote tx/season | Scoped total gas | Scoped total tx |
|---:|---:|---:|---:|---:|---:|
| 5 | 148,782.03 | 810,837 | 4,400 | 5,047,159,308 | 8,604 |
| 10 | 143,966.53 | 1,505,027 | 2,200 | 4,941,131,900 | 6,404 |
| 20 | 141,580.55 | 2,893,840 | 1,100 | 4,888,630,448 | 5,304 |
| 25 | 141,112.43 | 3,588,428 | 880 | 4,878,331,760 | 5,084 |

The scoped totals retain the benchmark's existing exclusions (one-time system
creation/configuration, off-chain operation, and unimplemented HOF beneficiary
payouts). Key randomness and independent chain histories can change calldata gas
slightly. This is a security regression, not an optimization claim. Initial system
creation now also creates the immutable factory. Runtime sizes: board 12,390 B;
factory 16,784 B; Sponsored Race 13,320 B. Board init code: 30,162 B.

## Remediation and remaining gates

See [Phase 1 architecture and runbook](V7_PHASE1_SECURITY.md) for the exact
finding mapping and deployment/recovery instructions. The five requested source
blockers are remediated and locally tested. External testnet still requires
approved real addresses, actual USDC verification, configured private ingress,
local key custody, a separately funded test relayer, persistent local disk and
usable historical/finalized RPC. No deployment or live end-to-end test is claimed.

MAINNET remains blocked/deferred by dependency findings (unchanged audit baseline:
3 production high + 23 moderate), Community transfer-griefing/season liveness,
conditional USDC payout blocking, operational hardening and external review.
Threshold remains a future documented upgrade, not an MVP dependency.

## Warnings

- allocations page: set-state-in-effect.
- history page: set-state-in-effect.
- mint page: set-state-in-effect.
- refund page: set-state-in-effect (inherited; line moved by the new import).
- home page: two no-img-element warnings.
- Voting: set-state-in-effect.
- Voting: exhaustive-deps cleanup ref warning.

These are existing React rendering/performance and image-optimization warnings,
not new compiler errors. Voting interaction/lifecycle tests pass. They are not
claimed to be eliminated. npm also emits an environment-level http-proxy config
warning; no repository dependency/config upgrade was performed to suppress it.

## Integrity

Master, canonical dataset/resolver, all 22 portraits, Genesis, Sale, Sponsored
Race, Rewards and package manifests were compared byte-for-byte to base (31 files).
Hashes: `benchmarks/phase1-preserved.json`. Community prize/scoring logic remains
unchanged; board changes add only factory provenance and immutable factory setup.
Raw verification output: `benchmarks/phase1-verification.txt`. Historical mint
benchmark files are preserved, and new gas reports use the `phase1-` prefix.

## Files included

- `.env.v7-deploy.example`
- `contracts/HOFCanonicalRaceFactory.sol`
- `contracts/HOFTrustedLeaderboards.sol`
- `contracts/mocks/LegacyTrustedBoardHarness.sol`
- `deploy/deploy-genesis.js`
- `deploy/deploy-hof-voting.js`
- `docs/implementation/V7_OPEN_QUESTIONS.md`
- `docs/implementation/V7_PHASE1_CHECKPOINT.md`
- `docs/implementation/V7_PHASE1_SECURITY.md`
- `docs/implementation/V7_SPONSORED_VOTING.md`
- `docs/implementation/V7_THRESHOLD_FUTURE_UPGRADE.md`
- `docs/implementation/benchmarks/phase1-preserved.json`
- `docs/implementation/benchmarks/phase1-sponsored-batch-10.json`
- `docs/implementation/benchmarks/phase1-sponsored-batch-20.json`
- `docs/implementation/benchmarks/phase1-sponsored-batch-25.json`
- `docs/implementation/benchmarks/phase1-sponsored-batch-5.json`
- `docs/implementation/benchmarks/phase1-verification.txt`
- `lib/owner-voting/journal-lock.cjs`
- `lib/owner-voting/signed-proxy.cjs`
- `lib/owner-voting/signed-service.cjs`
- `scripts/community-champion-v7.js`
- `scripts/deploy-v7-race.js`
- `scripts/deploy-v7-system.js`
- `scripts/distribute-v7-proceeds.js`
- `scripts/export-v7-chapter-state.js`
- `scripts/finalize-v7-season.js`
- `scripts/hof-champion-v7.js`
- `scripts/launch-readiness-v7.js`
- `scripts/pay-v7-community-season.js`
- `scripts/preflight-v7-race.js`
- `scripts/race-status-v7.js`
- `scripts/register-v7-race.js`
- `scripts/status-v7-system.js`
- `scripts/v7-canonical-config.cjs`
- `scripts/validate-v7-deployment.js`
- `src/app/refund/page.tsx`
- `src/lib/hofClient.ts`
- `test/V7CanonicalIntegration.test.js`
- `test/V7Chapter2Activation.test.js`
- `test/V7OwnerTrustedVoting.test.js`
- `test/V7Phase1Security.test.js`
- `test/V7SponsoredSeasonBenchmark.test.js`
- `test/V7SponsoredWorker.test.js`
- `test/V7TrustedGasStress.test.js`
- `test/helpers/sponsored.cjs`
- `web-test/refund-network.test.cjs`
- `web-test/signed-proxy-security.test.cjs`
