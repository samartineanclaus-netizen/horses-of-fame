# V7 protocol + canonical HOF integration — approval required

Historical integration baseline. The current gas, Chapter 2 enforcement, tests
and dependency inventory supersede the findings below; see
`V7_HARDENING_REVIEW.md` and `V7_DEPENDENCY_AUDIT.md`. Merge ancestry/conflict
provenance below remains unchanged. No commit has been made.

## Branch, ancestry and provenance

Branch: work/v7-hof-integration. No commit, push, main merge or deployment.

- Frontend parent / current HEAD: 2037eae140d8a14952c7962a1e37f7572708ebe3.
- Protocol pending MERGE_HEAD: 8d78e328a0675239d5e856f945cc8c82c295928c.
- Common ancestor: c4e5546e39c67833a45c0ef9b3019b9ea0e0d1ca (V7 Master).
- Divergence: protocol has 69 unique commits; frontend has 123 unique commits.
- Neither branch is an ancestor of the other. A no-commit, non-fast-forward merge
  was started from the frontend. The eventual approved merge commit can retain
  both parent histories; no commit has been made yet.
- The owner-trusted contracts/backend were NOT in protocol commit 8d78e32. They
  were copied explicitly from the existing uncommitted owner-trusted worktree.
  That source worktree and both original branch refs were left unchanged.
- Retained exact canonical dataset and all 22 original portraits from frontend.
  V7 Master retains its pinned Git blob hash ae37e100ae9248bc08d9810317de34e692cca78b.

## Conflicts: 20 files, reviewed individually

| File | Resolution and functionality preserved |
| --- | --- |
| README.md | Complete website documentation retained; integration/API entry added. Protocol decisions remain in implementation docs. |
| contracts/GenesisHorses.sol | Keep frontend non-public counters, enumeration, metadata, Team sell-out gate; add protocol lifetime publicMinted cap. Refund burns bypass only the outbound Team-transfer gate, not ownership or sale/refund validation. |
| contracts/HOFCommunitySeason.sol | Combine approved skip-tied-nonholders behavior with frontend persistent Chapter wallet registry. No universal NFT-holding requirement added. |
| contracts/HOFGenesisSale.sol | Keep 6-decimal USDC validation and soldOutAt timestamp; combine historical paidBy with current-owner burn/refund and separate refundedTo/totalRefunded. |
| contracts/HOFSeasonRewards.sol | Protocol rollover additions preserve all existing payout constants/interface; no discretionary withdrawals. |
| docs/implementation/V7_OPEN_QUESTIONS.md | Approved decisions/addendum plus integration status; preserve outstanding metadata/allocation/beneficiary/Chapter 2 questions. |
| eslint.config.mjs | Retain full frontend configuration; protocol branch had removed frontend tooling. |
| hardhat.config.js | Retain frontend dotenv/network configuration and Cancun/optimizer settings shared with protocol. No network executed. |
| next-env.d.ts | Retain/generated Next type references. |
| package.json | Retain all frontend/operator/contract scripts, add network-helpers used by protocol tests. |
| src/app/layout.tsx | Retain canonical website layout/styles. |
| src/app/page.tsx | Retain complete canonical homepage. |
| test/HOFVoting.test.js | Retain legacy regression suite; not reconnected to new user UX. |
| test/V7CommunityCastingTieBreak.test.js | Retain frontend's equivalent supply-compliant fixtures and assertions; approved new tie cases are added by protocol tests. |
| test/V7CommunitySeasonHistory.test.js | Retain the superset including persistent registry regression. |
| test/V7RaceVoting.test.js | Retain Team distribution-after-sell-out fixture. |
| test/V7Refund.test.js | Update obsolete original-payer accounting assertions to approved historical paidBy/refundedTo/totalRefunded semantics. |
| test/V7SaleProceeds.test.js | Retain the superset including soldOutAt assertions. |
| test/V7TeamWalletVoting.test.js | Retain sell-out gate fixture and restored post-transfer VP assertions. |
| tsconfig.json | Retain complete frontend TypeScript configuration. |

Automatic protocol-side deletions of existing artwork, CSS, metadata route,
legacy scripts/workflows and legacy HOFVoting source were restored individually
as preserved assets/regression functionality. No tracked frontend file is deleted.
Legacy operator scripts remain explicitly legacy; they are not a trusted-path
deployment workflow.

Two further regression reconciliations:
- V7CommunityUnresolvedTie now checks no winning nonholder comparison instead of
  the superseded unresolved-tie revert.
- Trusted gas fixture now funds/mints through the real USDC sale and reaches
  sell-out before Team transfers. The first full suite had 172 passes/1 failure
  in this fixture; production transfer protection was preserved, not weakened.

## Final architecture

Browser → same-origin Next admission proxy → owner admission backend → blockchain.

The browser selects canonical number 1–22, encrypts once with the existing approved
RSA-OAEP/AES-GCM helper and submits one authorized vote transaction. No user
revealVote or claimRacePoints is reintroduced. Backend roles/keys are configured
server-side; no real secret or fallback contract address is present.

HOFTrustedRace closes at opensAt+86400, records accepted ciphertext/commitments
and used NFT VP, freezes the set and accepts an owner-signed complete 22 tally and
score-root. Wallet score preparation uses consecutive batches<=100. Partial
preparation remains inactive; finalization requires every accepted ballot, is
immutable and cannot be repeated. The backend aborts if any accepted ballot fails
decryption, and resumes only the existing matching result.

The frontend reader and HOFTrustedLeaderboards both sum finalized race scores
only. Season reads are bounded to 10 races, All-Time to 60. Finalization activates
both logical leaderboards without wallet claims or prize-indexing delay. A viewer
can verify the finalized flag, accepted/processed counts, immutable root/proofs,
pointsOf(wallet), horseRacePoints and Season/All-Time getter sums.

API schemas, errors, configuration, trust and operating boundaries:
V7_ADMISSION_API.md.

## Verification results (fresh independent installation)

| Check | Result |
| --- | --- |
| Solidity compile | PASS (0.8.25, Cancun; 49 files recompiled) |
| All contract tests | PASS: 173 |
| Canonical integration tests within contract suite | PASS: 2 (ABI compatibility; all 22 IDs through real browser crypto→HTTP proxy→HTTP service→local EVM→both boards) |
| Frontend tests including Voting interaction | PASS: 32 |
| Typecheck | PASS |
| Lint | PASS: 0 errors, 8 advisory warnings |
| Production Next build | PASS |
| V7 Master integrity | PASS, unchanged |
| Canonical IDs/assets | PASS: exact 1–22, original hashes unchanged |
| Conflict markers / unmerged entries | None after resolution |
| Dependency portability | Lockfile regenerated: 0 external checkout paths, 0 linked packages; independent installation succeeds |
| Browser bundle boundary | Backend-specific decryption/HTTP-service markers absent from .next/static |

All deployments used by tests were ephemeral local Hardhat fixtures. No testnet
or mainnet deployment occurred. Real-wallet/browser/network end-to-end testing
is not claimed by the automated component and local integration tests.

Duplicate vote, invalid token reuse, owner/backend/Team exclusions, exact opening
and closing boundaries, incomplete reveal, repeated proposal/finalization,
duplicate score cursor, resumed worker and finalized-only scoring tests pass.

## Warnings and security/gas findings

1. The existing 8 lint warnings remain: mount-time state effects in allocations,
   history, mint and refund; two decorative img performance advisories; Voting
   snapshot-reset effect and intentional numeric request-generation ref cleanup.
   No accessibility-rule warning. Details remain in docs/frontend/FRONTEND_REVIEW.md.
2. Solidity emits the generic EIP-1153 transient-storage composability warning.
   The winner scan clears its transient marks at call completion; reverts undo
   them. Target chain support is not verified.
3. Distinct-holder stress: 2,200 participating holders, full 2,222 supply:
   **15,823,581 gas**, below the local 16M test budget but with little margin.
   This is not a certified chain cap or global worst-case upper bound. Large
   single-wallet NFT submission also iterates selected NFTs and needs separate
   target-chain gas validation; batching settlement does not make that loop free.
4. Production dependency audit reported **26 affected package entries: 3 high,
   23 moderate, 0 critical**. High entries:axios, lodash, ws (transitive).
   The report includes a ws remediation path requiring a major wagmi upgrade.
   No blind force-fix/major upgrade was performed; actual reachable exploit paths
   need review before deployment. Install also reports deprecated transitive
   wallet/SDK/tooling packages and a peer override.
5. Owner trust is explicit: owner/backend can decrypt early and can sign a false
   but structurally valid tally/score assignment. Commitments and Merkle coverage
   do NOT independently prove honest hidden-choice scoring.
6. Individual choices are not explicitly published, but per-wallet score changes
   and public ballot metadata can enable inference. This is not anonymity.
7. Loss of race decryption key or unavailable admission/settlement service can
   leave a race incomplete permanently. No arbitrary override was introduced.
8. Full-history frontend reads cap concurrency at 8 but can read 60×2,222 ballot
   records and their points. RPC load/latency and indexed caching remain launch
   work; no per-wallet transaction is required for these reads.

## Complete locally versus pending external/future work

Complete locally: canonical 22 mapping; integrated browser encryption/admission;
one-action initial voting; clear scheduled/open/submitted/closed/finalized/error
UI; complete settlement; logical Season/All-Time; approved supply, tie-break,
refund+burn, rollover; <=7-day season anchor using Race10.revealedAt; retained
sell-out/USDC protections and legacy regressions.

Still requires configuration/operation: final reviewed deployed addresses,
appropriate RPC/finality, HTTPS, secret storage/backups, admission service,
settlement scheduler/relayer funding, abuse protection, real-wallet/mobile QA,
chain opcode/gas validation and independent security review.

**Chapter 2 is not implemented by these branch snapshots.** The approved minimum
30 exact days remains in the addendum, with no maximum:
chapterStart >= previousChapterRace60.revealedAt + 30 days.
A future Chapter activation mechanism must enforce it. This integration does not
claim on-chain enforcement of an absent Chapter 2 activation path or invent its
economics. Earmarked rollover is retained safely; its future disbursement,
fair metadata randomization/allocation and HOF prize beneficiary mechanism remain
explicit unresolved gates. This is not a release/deployment approval request.

## All changed/new files relative to frontend parent

- .env.example
- .github/workflows/v7-sale-tests.yml
- .gitignore
- README.md
- contracts/GenesisHorses.sol
- contracts/HOFCommunitySeason.sol
- contracts/HOFGenesisSale.sol
- contracts/HOFSeasonRewards.sol
- contracts/HOFTrustedLeaderboards.sol
- contracts/HOFTrustedRace.sol
- contracts/mocks/CallbackUSDC.sol
- contracts/mocks/TrustedRaceGasFixture.sol
- docs/frontend/FRONTEND_REVIEW.md
- docs/implementation/V7_ADMISSION_API.md
- docs/implementation/V7_CHANGE_REVIEW.md
- docs/implementation/V7_INTEGRATION_REVIEW.md
- docs/implementation/V7_OPEN_QUESTIONS.md
- docs/implementation/V7_OWNER_TRUSTED_IMPLEMENTATION.md
- docs/implementation/V7_SECRET_VOTING_ARCHITECTURE.md
- docs/implementation/V7_WEBSITE_INTEGRATION.md
- lib/owner-voting/backend.cjs
- lib/owner-voting/service.cjs
- package-lock.json
- package.json
- test/V7CanonicalIntegration.test.js
- test/V7CommunityUnresolvedTie.test.js
- test/V7FinalRefund.test.js
- test/V7FinalRollover.test.js
- test/V7FinalSupply.test.js
- test/V7FinalTieBreak.test.js
- test/V7OwnerTrustedVoting.test.js
- test/V7Refund.test.js
- test/V7TrustedGasStress.test.js

No commit until the owner approves this report. Original protocol/frontend refs,
source worktree and Tokenomics Master remain unchanged.
