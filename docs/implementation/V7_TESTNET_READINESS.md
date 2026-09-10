# V7 Testnet readiness — local preparation, not deployment approval

Base: `94b6d6c11f7fe0d4f4b934c6778cf9ba4e511128`.
Branch: `work/v7-testnet-readiness`. No commit, push or remote transaction.

## Network evidence checked September 10, 2026

- Official connection/config: https://docs.robinhood.com/chain/connecting/
- Testnet chain ID **46630** (mainnet **4663**, rejected by scripts).
- Native gas: ETH. Public RPC https://rpc.testnet.chain.robinhood.com is rate-limited.
- Recommended provider: free-account Alchemy endpoint `https://robinhood-testnet.g.alchemy.com/v2/{API_KEY}`; actual quotas/history must be checked before operating.
- Explorer https://explorer.testnet.chain.robinhood.com/
- Status https://status.robinhoodchain.offchain.io/ reported testnet Operational.
- Faucet https://faucet.testnet.chain.robinhood.com/ — test ETH only; manually request after separate approval. No claim was made. Automated page access previously returned 403.
- Official deployment guide https://docs.robinhood.com/chain/deploy-smart-contracts/ uses MAINNET in examples. Never copy its default network into HOF; explicitly use testnet 46630.
- Circle https://developers.circle.com/stablecoins/usdc-contract-addresses and Robinhood https://docs.robinhood.com/chain/contracts/ did not establish canonical testnet USDC. Matching ticker in explorer is not provenance.
- Direct RPC request from this environment could not complete (network approval cancelled). No live RPC pass claimed.

## Approved payment token

**TEST ONLY / NO VALUE — MockUSDC**, symbol TEST-USDC, decimals=6.
Public price remains **30 * 10^6 units/NFT**; no V7 economics changed.
`HOF_TOKEN_MODE=testnetMockUSDC` is mandatory. Production mode is disabled;
there is no production USDC address. Mock constructor permits only local31337
and testnet46630. All canonical deployment entrypoints reject mainnet and any
other chain. This prevents normal accidental deployment; modified/forked source
or an intentionally mislabelled RPC is outside this guarantee.

Token address is populated only from an actual approved deployment receipt.
No mock address is checked into frontend production config. Public frontend mode
must be testnetMockUSDC AND chain46630 before payment token address is enabled.
A global TEST ONLY / NO VALUE banner identifies the configured MVP.

Mock minting is unrestricted and carries no monetary value. MockUSDC does NOT
model Circle blacklist/pause, upgrade governance, or real reserve behaviour.
A test-only false-return token checks payment/refund rollback; it is never used
in canonical deployment. A successful local mock test is not real-USDC approval.

## Wallet/role matrix

| Role | Authority | Gas | Separation |
|---|---|---|---|
| Deployer = owner | Creates Genesis/board/Rewards/Sale; initial wiring | Yes | Current scripts REQUIRE owner as deployer, even testnet |
| Protocol owner/admin | NFT metadata/allocation; canonical race scheduling; season finalization; Rewards payment; Chapter2 activation | Yes | Immutable board role; no alternate arbitrary race registration |
| Admission signer | Signs valid admissions and complete results; existing backend settlement authorization | Yes when settling; no gas for signatures | Separate from owner, relayer, Team and project |
| HOF relayer | Pays inclusion gas; cannot modify user signature | Yes | Separate operational wallet, limited funds; no admin/treasury key |
| Team Reserve | Receives its111 bucket; transfer gate; excluded voting | Only when sending | Separate from operational roles |
| Project/revenue | Receives project proceeds | Only when sending | Separate from relayer/owner/admission/Team |
| Audit recipient | Receives configured audit proceeds | Only when sending | Use separate address; source does not enforce all audit role distinctions |
| Prize treasury | HOFSeasonRewards contract, not an EOA | Caller pays | Sale hard-wires deployed Rewards; no generic withdrawal |
| RSA decryption key | Reads encrypted ballots for admission/tally | None | Server-only custody, distinct from all EVM signing keys |
| Voter | Signs one vote; mint/refund/direct fallback | Yes for mint/refund/fallback; sponsored vote signature free | Never give voter/admin keys to frontend server |

Do not collapse the five explicitly separated addresses for testnet. Owner and
deployer are intentionally the same in this deployment path. Production role
custody/rotation needs review; immutable identities cannot simply be swapped.

## Environment matrix

| Scope | Values | Notes |
|---|---|---|
| Deployment public | HOF_TOKEN_MODE, HOF_USDC_ADDRESS, HOF_OWNER_ADDRESS, HOF_ADMISSION_SIGNER, HOF_RELAYER_ADDRESS, TEAM_RESERVE_WALLET, PROJECT_WALLET, AUDIT_WALLET | Exact deployed token; separate roles; blank addresses in template |
| Deployment timing/metadata | MINT_DEADLINE_UNIX, GENESIS_PLACEHOLDER_URI | Explicit future deadline and actual intended unrevealed URI |
| RPC/preflight | HOF_RPC_URL, HOF_MIN_DEPLOYER_WEI | Real endpoint; positive operator gas budget threshold, not cost guarantee |
| Deployment secret | DEPLOYER_PRIVATE_KEY | Local secret store/environment only, never committed/logged |
| Race creation | HOF_TRUSTED_LEADERBOARDS, GENESIS_SALE_ADDRESS, RACE_OPENS_AT_UNIX, HOF_RACE_PUBLIC_KEY | RSA3072 SPKI DER hex public key, never private key |
| Frontend mint/refund | NEXT_PUBLIC_HOF_TOKEN_MODE, NEXT_PUBLIC_HOF_CHAIN_ID, NEXT_PUBLIC_HOF_GENESIS_CONTRACT, NEXT_PUBLIC_HOF_GENESIS_SALE_CONTRACT, NEXT_PUBLIC_HOF_USDC_CONTRACT | mock mode +46630 required; addresses empty until receipt |
| Frontend Sponsored | NEXT_PUBLIC_HOF_SIGNED_VOTING=enabled, NEXT_PUBLIC_HOF_RPC_URL, NEXT_PUBLIC_HOF_TRUSTED_RACE, NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS, NEXT_PUBLIC_HOF_RACE_DEPLOYMENT_BLOCK | Do not use legacy ABI/address fields for Sponsored |
| Server ingress | HOF_SIGNED_SERVICE_URL, HOF_SIGNED_INGRESS_TOKEN | Private endpoint and >=32-char secret; never NEXT_PUBLIC |
| Library API injected runtime | race, admissionSigner, privateKey, relayer, treasuryAddress, journal, lockDirectory, fromBlock | Actual constructor arguments, NOT implemented env variables |
| Queue settings | batchSize25, maxGas5M, flushMs3000, urgentMs1000, deadlineWindow60, maxAttempts3 | Existing defaults; smaller adaptive batches supported |
| Historical/disabled | HOF_ADMISSION_URL; old RACE_VOTING/COMMUNITY_SEASON/LEADERBOARD public fields | Retained legacy reads/tests; not canonical deployment inputs |

`.env*`, PEM/key/journal files and `.hof-runtime/` are ignored; only example
files are allowed. A server RPC credential must not be placed in a public browser
URL. Browser RPC needs a public endpoint or a deliberately public restricted key.
No real keys were generated or saved; local tests use ephemeral test identities.

## Canonical deployment order

| Contract/action | Constructor arguments | Owner/dependency | Post-deploy |
|---|---|---|---|
| MockUSDC (approved test-only prerequisite) | none | Unrestricted fake token mint; network guarded | Record receipt/address, verify label+decimals |
| GenesisHorses | placeholderURI | deployer/owner | setTeamWallet(team) |
| HOFTrustedLeaderboards | genesis, owner, admissionSigner, team | immutable board roles | Constructor creates fixed HOFCanonicalRaceFactory |
| HOFCanonicalRaceFactory (internal creation) | board, genesis, owner, admissionSigner, team | factory provenance; only fixed Sponsored implementation | Do not deploy another factory/whitelist arbitrary Race |
| HOFSeasonRewards | token, board | deployer owner | Becomes Prize Pool destination |
| HOFGenesisSale | token, genesis, deadline, rewards, audit, project | deployer owner | genesis.setSaleContract(sale) |
| Allocation/payment | 111 Community and111 Team; Public2000 | max25 per mint transaction | Test mint token funding/approve; sellout before races |
| HOFRelayedRace via factory | genesis, opensAt, team, owner, signer, publicKey | factory fixed creation; season/ordinal provenance | board.registerRace before opening |

There is no separate legacy Season deployment: the canonical board supplies
Season/All-Time and stable Community selection. Race creation and registration
are separate transactions; retain receipts and reconcile failure, never blindly
recreate. Rewards has no HOF beneficiary payout implementation: this is a known
product blocker outside the Community payout dry-run, not silently substituted.

## Local dry-run and verification commands

```
npm run compile:contracts
HOF_LOCAL_TESTNET=1 npx hardhat test test/readiness/local-dry-run.cjs
npx hardhat test test/V7Readiness.test.js
npx hardhat test --config test/readiness/mainnet-rejection.config.cjs test/readiness/mainnet-rejection.cjs
npm run test:frontend
npm run lint
npm run build
npm run typecheck
```

The dedicated dry-run refuses non-Hardhat execution, uses simulated46630 and the
same exported system deploy function + actual canonical race operator script.
A local chainId match is not an Arbitrum execution/gas/finality simulation.
Scenario A: fake funding -> allowance -> four25mints -> transfer -> deadline ->
current-owner refund/burn; duplicates rejected.
Scenario B: Public2000 and independent111+111 allocations -> soldout -> proceeds
-> ten canonical Sponsored races with a genuine signed/admitted vote in each ->
queue sponsorship -> time travel -> full reveal and scoring -> both boards ->
Community2500 payment and1500 rollover. No owner/admin invented participant.
Refund must be separate from the soldout scenario because V7 disallows it there.
Existing regression tests exercise 60-race Chapter2 timing,7-day Season gap,
all22identity mapping, batching, deadlines, fallback and worker failures.

## Sponsored and frontend readiness

**TESTNET MVP: owner-trusted encryption**. Backend can technically decrypt early.
**FUTURE SECURITY UPGRADE: threshold encryption**. Not implemented.

Existing durable journal, per-wallet locks, monotonic states, recovery-before-send,
same-nonce fallback, wallet/race quotas and authenticated ingress remain unchanged.
Unknown/stuck nonce stops new sends; explicit recovery requires on-chain evidence.
No raw ballot/private key logs were added. Local tests exercise these controls.

Browser confirmation requires canonical inclusion receipt, then finalized block.
A signed or submitted packet is not a valid counted vote. No intermediate totals.
Mint and Refund re-read chain; Refund re-verifies immediately before sending.
Canonical22dataset/artwork unchanged. Frontend tests/build are local evidence,
not a real wallet/browser-to-hosted-service E2E claim.

Operational blocker: signed-service exports tested server/queue primitives, but
there is no complete reviewed service bootstrap/supervisor and automated
post-deadline reveal scheduler configured here. settleRelayedRace is tested and
callable; it is not proof that a background scheduler exists. A subsequent
approved task must wire server-side secret injection, private ingress, persistent
local directory, one worker/relayer nonce stream, automatic closure invocation,
restart/log retention and an always-awake host. Do not start production from an
imagined environment-only daemon. Admission refusal remains an accepted trust
limitation, which direct fallback cannot resolve.

## Read-only preflight

`node scripts/preflight-v7-readiness.cjs` reads configuration, artifacts and chain.
No signer/private key is instantiated and no send/estimate transaction is invoked.
It checks46630, explicit mock mode, actual code/label/marker/6decimals, future
mint deadline, separate roles, configured minimum deployer balance, artifact source
contents/bytecode/compiler settings, canonical path and prints Git branch/commit
and dirty state. Generic CLI failures do not leak RPC credentials.
Local populated preflight passes; unconfigured CLI fails closed. Live preflight
is NOT passed: deployed token/public role addresses and working RPC are absent.
Before MockUSDC exists, full preflight correctly fails; its separately reviewed
prerequisite script checks network/roles/mode and refuses an existing token address.

## $0 and first real deployment checklist — NOT authorization

Free options: existing local Node/Hardhat/tooling, public limited RPC, explorer,
faucet test ETH and local test mock balances. No paid service activated. A free
provider quota/history guarantee is not assumed. A user's powered-on computer can
host MVP worker but sleeping/shutdown breaks automatic reveal availability.

1. Approve local changes after this report; preserve checkpoint separately.
2. Resolve service bootstrap/scheduler and network reachability blockers.
3. Prepare distinct test-only role addresses outside repo; approve custody.
4. After separate authorization, manually request test ETH; no real money.
5. Approve test-only token prerequisite deployment; record exact receipt; set address.
6. Compile current tree and run read-only preflight with real public configuration.
7. Verify actual RPC chain, code, token decimals, gas estimates and role balances.
8. Obtain explicit deployment authorization; run canonical system path only.
9. Record addresses/receipts/creation blocks; verify all links/roles read-only.
10. Configure frontend banner, chain46630, Sponsored flag, deployed addresses;
    provision private service/journal/limited relayer and per-race RSA public key.
11. Separately approve allocation/mint/race transactions and contract verification.
12. Run real wallet E2E including real24h close, receipt finality and worker restart.
    No mainnet readiness claim until remaining audits/dependencies/product gaps resolve.

## Known blockers retained from Phase 1

- Mainnet dependency remediation remains pending (historical production audit baseline
  3 high +23 moderate; not re-audited or upgraded in this task).
- Stable Community scan can be invalidated by transfers; its existing liveness/gas
  risks remain, including interaction with the7-day Season gap. No Variant C added.
- Real USDC failure/blacklist risk is not resolved by MockUSDC.
- HOF beneficiary payouts and future Chapter2 rollover release are not implemented
  here. Only existing Community payout/reservation rules are exercised.
- Live EVM/RPC finality/history, callback gas, wallet interaction, hosting and
  automatic reveal availability need actual testnet evidence after approval.

## Final verification evidence

**347 distinct passing tests/scenarios:**273 contract/backend regressions,67
frontend tests,2 canonical dry-run scenarios,1 local mainnet-ID constructor
rejection,4 complete10x2200x4800VP benchmark profiles. Repeated targeted tests
are not double-counted. Compile, lint (0 errors /8 inherited warnings), typecheck,
normal production build and explicit testnet-mode build all pass. Generated HTML
contains the TEST ONLY / NO VALUE banner. Evidence: `readiness-evidence/`.

Preflight: local configured PASS (including insufficient balance rejection);
unconfigured CLI FAIL CLOSED as expected. Live Robinhood preflight NOT RUN to
completion.32 protected files, including Master,22portraits and all economic/
voting contracts and dependency manifests, match base byte-for-byte.

Fresh local regression benchmarks, NOT Robinhood costs or new optimization claims:

| Batch | Gas/vote | Scoped season gas | Scoped season transactions |
|---:|---:|---:|---:|
| 5 | 148,782.09 | 5,047,064,320 | 8,604 |
| 10 | 143,967.58 | 4,941,144,972 | 6,404 |
| 20 | 141,580.44 | 4,888,627,848 | 5,304 |
| 25 | 141,112.38 | 4,878,330,840 | 5,084 |

Scoped totals retain the existing benchmark exclusions, including one-time system
deployment/configuration and unimplemented HOF beneficiary payouts. Small
calldata/randomness differences are normal. Historical Phase1 output files were
preserved byte-for-byte; new results are separate.

Inherited warnings: allocations/history/mint/refund set-state-in-effect (4),
home no-img-element (2), Voting set-state-in-effect and cleanup ref dependency (2).
These are not fixed by this task. No new lint error.

## Changed files (uncommitted)

- `.env.example`
- `.env.v7-deploy.example`
- `.gitignore`
- `contracts/MockUSDC.sol`
- `contracts/mocks/FailingTestUSDC.sol`
- `docs/implementation/V7_TESTNET_READINESS.md`
- `docs/implementation/readiness-evidence/build-mock.log`
- `docs/implementation/readiness-evidence/build.log`
- `docs/implementation/readiness-evidence/compile.log`
- `docs/implementation/readiness-evidence/contracts-final.log`
- `docs/implementation/readiness-evidence/dryrun.log`
- `docs/implementation/readiness-evidence/frontend.log`
- `docs/implementation/readiness-evidence/integrity.json`
- `docs/implementation/readiness-evidence/lint.log`
- `docs/implementation/readiness-evidence/mainnet-rejection.log`
- `docs/implementation/readiness-evidence/preflight.log`
- `docs/implementation/readiness-evidence/sponsored-batch-10.json`
- `docs/implementation/readiness-evidence/sponsored-batch-20.json`
- `docs/implementation/readiness-evidence/sponsored-batch-25.json`
- `docs/implementation/readiness-evidence/sponsored-batch-5.json`
- `docs/implementation/readiness-evidence/targeted.log`
- `docs/implementation/readiness-evidence/typecheck.log`
- `hardhat.config.js`
- `scripts/deploy-testnet-mock-usdc.cjs`
- `scripts/deploy-v7-system.js`
- `scripts/preflight-v7-readiness.cjs`
- `scripts/v7-canonical-config.cjs`
- `src/app/layout.tsx`
- `src/lib/hofClient.ts`
- `test/V7Phase1Security.test.js`
- `test/V7Readiness.test.js`
- `test/readiness/local-dry-run.cjs`
- `test/readiness/mainnet-rejection.cjs`
- `test/readiness/mainnet-rejection.config.cjs`
- `web-test/testnet-token-config.test.cjs`
