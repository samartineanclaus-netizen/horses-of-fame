# Race Reveal service verification

Base `d8ffe5c4771d3c836737abd6d3a378f7cd140b33`, local branch
`work/v7-race-reveal-service`. No remote deployment or transaction was performed.
The operational architecture and recovery runbook are in
[the service design](../V7_RACE_REVEAL_SERVICE.md).

## Final checks

| Check | Result |
|---|---:|
| Existing + new regular contract/backend tests | 290 pass |
| Frontend/adapters/interaction/runtime tests | 73 pass |
| Canonical local dry-run scenarios | 3 pass |
| MockUSDC rejection on local mainnet chain ID | 1 pass |
| Full-season Sponsored benchmarks (5/10/20/25) | 4 pass |
| Total distinct tests/scenarios | **371 pass** |
| Solidity compile | pass; contracts unchanged |
| Typecheck | pass |
| Lint | 0 errors,8 inherited warnings |
| Production build | pass |
| Explicit MockUSDC/46630/Sponsored build | pass |
|32 protected files against readiness SHA256 manifest | unchanged |

Saved terminal logs normalize trailing whitespace/CR progress output only.
Repeated targeted tests are not counted twice. All economic/voting Solidity,
Master, canonical dataset,22portraits and dependency manifests are unchanged.

Full regression commands:

- `npx hardhat test` with every top-level test file except the four-profile
  `V7SponsoredSeasonBenchmark.test.js` (run separately, all four profiles).
- `npx hardhat test test/V7SponsoredSeasonBenchmark.test.js --grep 'batch N$'`
  for each N in5/10/20/25; each independently executes10x2200voters/4800VP.
- `HOF_LOCAL_TESTNET=1 npx hardhat test test/readiness/local-dry-run.cjs`.
- `npx hardhat test --config test/readiness/mainnet-rejection.config.cjs test/readiness/mainnet-rejection.cjs`.
- `npm run compile:contracts`, `npm run test:frontend`, `npm run typecheck`,
  `npm run lint`, `npm run build`.
- `NEXT_PUBLIC_HOF_TOKEN_MODE=testnetMockUSDC NEXT_PUBLIC_HOF_CHAIN_ID=46630 NEXT_PUBLIC_HOF_SIGNED_VOTING=enabled npm run build`.

## End-to-end and recovery evidence

The new local E2E runs the actual canonical deployment/race scripts and runtime
bootstrap over a local JSON-RPC HTTP transport. It reads ephemeral fixture key
files with0600permissions and validates labelled MockUSDC and separate roles.
It mints, obtains one browser-format signature, calls authenticated HTTP admission/
submission, waits for sponsored chain inclusion, advances24hours and lets the
scheduler freeze/decrypt/propose/prepare/finalize. Both boards become25points for
the voter without a user claim or reveal call. No remote chain or real key is used.

New backend tests cover queued and included restart before/after deadline,
automatic polling, partial near-deadline batch flush, expired unincluded packets,
decryption interruption and reconstruction, corrupted accepted ciphertext,
missing ciphertext logs, mid-scoring restart, duplicate workers across journals,
zero voters, bad keys/changed result plans, modified proposal totals with an
unchanged root, known pending/replacement, lost broadcast response/nonce recovery,
RPC timeout and authenticated ingress. Existing Phase1 retry/admission/fallback,
wrong-chain, reentrancy, mint/refund, Chapter and Community tests also pass.

Initial parallel verification exposed test-process lock namespace collisions and
a wall-clock-dependent opening fixture. New service tests use isolated lock roots
while duplicate-worker tests still share a root and prove exclusion. The existing
Sponsored Voting boundary test now explicitly pins deployment and pre-opening
block timestamps; all original assertions are retained. Runtime lock protections
and Sponsored Voting contract behavior were not relaxed. A separate recovery test
prompted explicit verification of proposal calldata totals as well as its root.
The final full suite was rerun after these corrections.

## Service stress measurement

**2200voters,4800VP, one fully populated canonical race:**

- restart after the first25wallet scores;
- verify both boards remain inactive before complete finalization;
- independently check all2200wallet scores and complete22horse order;
- **91settlement transactions**: freeze, propose,88score batches,finalize;
- **58,131,390gas total**, **705,328gas maximum measured transaction**;
- every estimated transaction with20%headroom stays below configured5Mcap.

This subtotal excludes voting, mint, distribution, system deployment and Community
prize work. It is a local measurement, not a Robinhood fee/USD claim or an
optimization claim. Stable Community settlement has not been redesigned.

Fresh complete-season regression profiles preserve existing benchmark scope and
exclusions; the new service scheduler is separately measured above:

| Vote batch | Gas/vote | Scoped season gas | Scoped season tx |
|---:|---:|---:|---:|
|5|148,780.90|5,047,038,280|8,604|
|10|143,966.35|4,941,118,056|6,404|
|20|141,579.44|4,888,605,660|5,304|
|25|141,111.19|4,878,304,548|5,084|

Historical benchmark reports were restored unchanged; fresh reports are separate
files in this evidence directory. They contain full category breakdowns and scope.

## Inherited lint warnings

1. `src/app/allocations/page.tsx:102` — set-state-in-effect.
2. `src/app/history/page.tsx:104` — set-state-in-effect.
3. `src/app/mint/page.tsx:86` — set-state-in-effect.
4. `src/app/page.tsx:181` — next/no-img-element.
5. `src/app/page.tsx:182` — next/no-img-element.
6. `src/app/refund/page.tsx:62` — set-state-in-effect.
7. `src/components/Voting.jsx:55` — set-state-in-effect.
8. `src/components/Voting.jsx:55` — exhaustive-deps cleanup ref advisory.

These remain the existing render/effect and image-performance advisories, including
Voting's refresh effects. There are no new lint errors/warnings. DOM interaction,
cleanup, privacy, canonical identity and real phase tests pass. npm also reports
an environment-level unknown `http-proxy` setting; no dependency upgrade was made.

## Remaining Robinhood Testnet prerequisites

- Separate authorization for deployment, test gas/faucet and all live transactions.
- Actual deployed canonical addresses and runtime role wiring; MockUSDC only.
- Provision custody/backup of dedicated admission, relayer and per-race RSA keys.
- Fund separate limited gas wallets with test gas only, after authorization.
- Persistent single-host/PID-namespace journal/locks, private ingress, supervision,
  infrastructure rate limits, monitoring and an always-awake machine.
- Live RPC history/finality/receipt/nonce behavior and real24hour wallet E2E still
  need evidence. No live RPC availability or gas-price guarantee is claimed.
- Unknown/dropped/reverted/cancelled transactions may need explicit operator
  recovery. There is no blind retry or multi-host distributed locking.
- Owner-trusted early decryption is an accepted limitation; threshold is future.
- Existing mainnet dependency/audit, stable Community liveness/gas, real-USDC,
  HOF-beneficiary and future Chapter2 rollover-release gaps remain outside scope.

## Complete changed-file list

- `.env.v7-service.example`
- `.gitignore`
- `docs/implementation/V7_RACE_REVEAL_SERVICE.md`
- `docs/implementation/V7_TESTNET_READINESS.md`
- `docs/implementation/V7_TESTNET_RUNBOOK.md`
- `docs/implementation/race-service-evidence/build-mock.log`
- `docs/implementation/race-service-evidence/build.log`
- `docs/implementation/race-service-evidence/compile.log`
- `docs/implementation/race-service-evidence/contracts-final.log`
- `docs/implementation/race-service-evidence/dryrun.log`
- `docs/implementation/race-service-evidence/frontend.log`
- `docs/implementation/race-service-evidence/integrity.json`
- `docs/implementation/race-service-evidence/lint.log`
- `docs/implementation/race-service-evidence/mainnet-rejection.log`
- `docs/implementation/race-service-evidence/sponsored-batch-10.json`
- `docs/implementation/race-service-evidence/sponsored-batch-20.json`
- `docs/implementation/race-service-evidence/sponsored-batch-25.json`
- `docs/implementation/race-service-evidence/sponsored-batch-5.json`
- `docs/implementation/race-service-evidence/summary.json`
- `docs/implementation/race-service-evidence/typecheck.log`
- `docs/implementation/race-service-evidence/verification.md`
- `lib/owner-voting/race-reveal-service.cjs`
- `lib/owner-voting/reveal-transactions.cjs`
- `lib/owner-voting/website.cjs`
- `scripts/run-race-reveal-service.cjs`
- `src/components/Voting.jsx`
- `test/V7RaceRevealService.test.js`
- `test/V7RaceRevealServiceStress.test.js`
- `test/V7SponsoredVoting.test.js`
- `test/readiness/local-dry-run.cjs`
- `web-test/reveal-runtime.test.cjs`
- `web-test/sponsored-voting.test.cjs`
- `web-test/trusted-adapter.test.cjs`
- `web-test/voting-interaction.test.cjs`
