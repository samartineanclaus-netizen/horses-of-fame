# V7 Sponsored Voting — reconstructed checkpoint candidate

> Phase 1 update: active trust remains owner-trusted. Current deployment,
> ingress authentication, journal locks and nonce recovery are documented in
> [V7_PHASE1_SECURITY.md](V7_PHASE1_SECURITY.md). Historical measurements below
> describe the earlier checkpoint, not newly measured Phase 1 performance.
> Mint100 was subsequently capped at 25 per call; it is not an allowed current call.
> Threshold is suspended as a future upgrade with external budget $0.

Base: `work/v7-hof-integration` at `2f1445163ec39c4b426dd580b3ca1ca58f98108e`.
Working branch: `work/v7-sponsored-voting`.
This is a reconstruction after the earlier uncommitted worktree was removed.
Earlier benchmark numbers are historical references only, not evidence for this
implementation. The new measurements are in `benchmarks/sponsored-batch-*.json`.
No Variant C code, score index or ownership callbacks are added. Community uses
unchanged `GenesisHorses` and `HOFTrustedLeaderboards` from the base commit.

## Accepted architecture

Browser: select canonical horse1–22 → existing client encryption → one EIP-712
signature. The intent binds voter, race address (unique race identity), chain ID,
verifying contract, version/domain, nonce, deadline, commitment, ciphertext hash,
ordered token-ID hash, exact VP and optional same-pick top-up flag. Backend cannot
change those fields and retain a valid wallet signature. Contract checks each
packet independently, including EOA/ERC1271 signatures, dedicated admission
signer, current NFT ownership/eligibility, excluded owner/backend/team wallets,
unused NFT bitmap and duplicate wallet pick. An invalid packet reverts the whole
batch atomically. Nonces and token-consumption changes also roll back.

`HOFRelayedRace` stores wallet + uint96 VP in one slot and commitment in another.
Ciphertext is not stored: full446-byte ciphertext appears in transaction calldata
and `EncryptedVote`. The ABI-compatible `ballotAt` tuple returns empty ciphertext;
consumers reconstruct from logs using `signed-backend.cjs`. The public encryption
key remains pinned on-chain. No decryption key, plaintext choice or salt is emitted.
The record hash commits to the ordered accepted records and VP additions.

The operator reconstructs every accepted ballot/top-up from paginated logs,
checks hashes, current compact records, count, VP and canonical block anchor,
then decrypts all records. Missing/changed/duplicated records fail closed.
A complete result uses the existing V7 score table and Merkle-authenticated
consecutive score batches. No partial race contributes Season/All-Time points;
finalization is once-only after every accepted wallet is prepared. Existing
Community reward selection/payout/rollover and chapter/season rules are unchanged.
No voter reveal or point-claim transaction is introduced.

## UI and fallback

`Signed` means wallet authorization only. `Submitted` means queued/broadcast,
not accepted. Only `Included on-chain` is a valid vote; the UI requires a matching
IntentIncluded event, successful receipt, matching receipt block and canonical
block hash. `Vote confirmed` additionally requires RPC finalized coverage.
Backend status strings cannot promote either state. Unsupported finality leaves
an included vote included, never pretends to confirm it. Signed/admitted packets
are saved in browser localStorage for retries/reconnection when storage is available.

The voter may submit the identical packet/admission through `submitSigned` before
close, paying native-token gas. Backend-first and direct-first races consume the
same nonce; at most one is accepted. A losing competing transaction may cost gas.
**Fallback requires a previously issued admission signature. It does not solve
backend refusal to issue admission.** No new trust model or decryption proof is
introduced. The owner is trusted, can decrypt early, and actually decrypts during
admission to reject malformed ballots before on-chain acceptance. Signed records
prove authorization/coverage consistency, not honest owner tallying. Public wallet
scores can reveal/infer individual picks after reveal under the inherited model.

## Worker deadline and gas strategy

Target/max25 intents, never a minimum. Hard batch limit100 NFT uses. Larger
single intents retain the direct `submitSigned` path. Worker default max gas is
5,000,000 including a20% estimate margin, and configurable; estimates exceeding
that budget split into smaller groups until safe. A single packet beyond the
sponsorship budget is rejected for sponsorship and remains available for direct
submission if it has admission. Admission's current simulation budget is also5M;
concentrated holdings require operational review before production. No VP or
business entitlement is silently deleted to fit the budget.

An acknowledged enqueue wakes the running worker immediately, even for one vote.
There is no wait-for25 condition. The worker validates and dispatches one bounded
window before examining the rest of a backlog; fresh packets do not require a
global history scan. A periodic3-second flush recovers pending work;
during the final60 seconds it retries every1 second. Earliest intent deadline
is processed first. Each flush drains available packets in bounded transactions,
re-estimating after eligibility changes. Receipt waiting (bounded to30 seconds by default) serializes the relayer's
nonce stream; RPC timeout retains the transaction hash for reconciliation. At/after race close unaccepted jobs expire. An expired signature or
queue entry is never backdated or counted as a vote. Polling has no power to extend
the on-chain deadline. Network congestion, sequencer/RPC failure, admission delay,
a pending gas-wallet nonce or extremely late votes can still prevent timely
inclusion: this is a best-effort deadline strategy, not an inclusion guarantee.
Dropped/pending transaction replacement is an operational production blocker;
monitor pending nonces and expose the paid fallback before close.

The queue is an append-only fsynced JSONL journal with idempotent intent digests,
restart recovery and torn unacknowledged trailing-record truncation. It requires
one process/writer on reliable persistent disk, not multiple racing replicas.
Ambiguous RPC/broadcast failure can cause paid retries, but not double acceptance.
Do not promise exactly-once delivery over a network.

## Keys, sponsorship and abuse protection

Use a **separate operational relayer wallet with limited native gas funds**.
It must differ from owner/admin, Team Reserve, admission/result signer and treasury.
Queue startup/use rejects configured unsafe identities. Never put owner/admin or
treasury private keys directly in the backend. The admission/result signing identity
is a dedicated delegated operator identity pinned in the race, distinct from the
gas relayer. Its key and decryption key are injected server-side from protected
runtime storage, never NEXT_PUBLIC environment variables or browser imports.
HOF funds this operational wallet separately; no Prize Pool withdrawal is added.
Replenishment limits, alerts and a funding policy are production configuration.

HTTP service applies an IP/socket rate limit before expensive work, a bounded key
map, concurrent request cap, body size limit131072 bytes and read timeout. The
per-wallet quota is charged only after verifying its signature, preventing forged
wallet names from exhausting another wallet's quota. Defaults:30 requests/minute
per socket source,10 authenticated requests/minute per wallet,4 concurrent calls.
Behind the Next proxy, the service sees the proxy socket, so this is also a global
cap for that proxy; production must configure suitable limits and a trusted edge
per-client limiter. Caller-controlled forwarding headers are never trusted.
A persistent default budget of3 broadcast attempts per wallet/race nonce limits
revert/RPC retry gas drain. Re-signing another ciphertext at the same nonce does
not reset it; attempts are journaled before broadcast, including ambiguous failures.
Exhaustion stops sponsorship, not the valid direct fallback. This is an operator
gas policy, not a change to scoring or vote validity.
Sponsorship requires a valid admission and a live contract simulation. A queued
packet is revalidated before gas is spent; token transfers may invalidate it.

## Explicit integration, no deployment

Enable the browser path only with `NEXT_PUBLIC_HOF_SIGNED_VOTING=enabled`, actual
reviewed chain/RPC/race/board addresses, and `NEXT_PUBLIC_HOF_RACE_DEPLOYMENT_BLOCK`.
No fake address or live configuration is supplied. Existing deployments still
use the legacy path when the signed flag is absent. Stable ABI-compatible race
reads support Race Reveal and Season/All-Time without a second canonical dataset.

Next endpoints `/api/vote/prepare` and `/api/vote/submit` proxy only to server-only
`HOF_SIGNED_SERVICE_URL`, use origin/body limits and allowlist response fields.
The first returns admission only; the second returns queue digest/Submitted only.
The runtime constructs SignedVoteQueue and createSignedServer with injected race,
relayer, treasury address, admission signer, decryption key and durable journal,
calls queue.start(), and stops it gracefully. Settlement uses settleRelayedRace
with the full race ABI and deployment block. Connect the race to the operational
relayer for these permissionless settlement transactions too; administrative
registration and treasury-owner actions remain outside this backend. Historical RPC logs and finalized-tag
support are prerequisites. No public operator/deployment is started by this task.

## Benchmark scope and interpretation

Each batch profile5/10/20/25 executes10 fully populated races,2200 real signed and
encrypted ballots/race and exactly4800 VP/race. It mints2222 NFTs, distributes2200
voting NFTs to distinct signing-capable test wallets and uses the real rarity VP.
Choices rotate as `(walletIndex + raceIndex) % 22 + 1`; this measures a fully
populated mixed-choice season, not a guarantee of the maximum cost of every possible
vote distribution. The inherited all-nonzero-score stress case is also rerun.
Backend admission decrypts real ciphertext; immutable context/inventory is cached
only in this fixed fixture. The contract independently checks each accepted vote.
All score batches,22-horse rankings, stable Community indexing/scans and actual
Community payout execute. An independent score-sort/lowest-held-ID reference checks
the podium for this all-holder benchmark. General tie/refund/rollover cases remain
covered by the complete unchanged regression suite.

Reported totals include race deployment/registration, initial approval, mint and
transfers, Vote, freeze/propose/scoring/finalization, Community indexing/scans and
payout. Recurring subtotal excludes mint/distribution/initial approval. One-time
system deployments/configuration, test balance funding, HOF-side unimplemented
prize mechanisms and off-chain hosting/crypto/RPC costs are excluded, explicitly.
No fixed USD cost or Robinhood production fee claim follows from local gas units.

Full-batch measurements do not guarantee full batches in live traffic. At2200
votes across24h, uniform arrivals average39 seconds apart, so immediate flush
will often send smaller batches. Timely voting UX takes priority over savings.

## Separate blockers

- **100 NFT mint ≈13.96M gas**: inherited optimization/deployment blocker; untouched.
- Production audit of new contract/service and real Robinhood receipt/fee validation.
- Deploy/configure actual contracts/backend, persistent storage, finalized/historical
  RPC, delegated signing/decryption keys and separately funded limited relayer.
- Pending transaction replacement/nonce monitoring and trusted-edge rate limits.
- Review gas sponsorship for large concentrated inventories/ERC1271 execution.
- Stable Community's cumulative cost/transfer scan restarts remain unchanged.
- Owner-trusted confidentiality, honest tally and admission availability remain assumptions.

No push, main merge, public testnet or mainnet deployment is authorized here.

## Fresh measurements and verification

All four complete-season profiles passed. These are new Hardhat measurements,
not the lost experiment outputs and not Robinhood receipts.

| Batch | Mean gas/vote | Mean gas/batch | Maximum gas/batch | Vote gas/season | Vote tx |
|---:|---:|---:|---:|---:|---:|
| 5 | 148,803.28 | 744,016.41 | 810,978 | 3,273,672,188 | 4,400 |
| 10 | 143,987.55 | 1,439,875.54 | 1,505,189 | 3,167,726,188 | 2,200 |
| 20 | 141,599.14 | 2,831,982.84 | 2,894,140 | 3,115,181,128 | 1,100 |
| 25 | 141,133.53 | 3,528,338.19 | 3,588,941 | 3,104,937,604 | 880 |

| Batch | Total scoped gas | Total tx | Recurring gas | Recurring tx |
|---:|---:|---:|---:|---:|
| 5 | 5,043,208,003 | 8,536 | 4,525,753,821 | 6,313 |
| 10 | 4,937,341,383 | 6,336 | 4,419,887,201 | 4,113 |
| 20 | 4,884,830,511 | 5,236 | 4,367,376,329 | 3,013 |
| 25 | 4,874,661,411 | 5,016 | 4,357,207,229 | 2,793 |

Batch25 remains the best measured full-batch cap among the four. Immediate/adaptive
production flush may produce smaller batches; no live-season transaction count or
fixed USD cost is promised. The HOF operational wallet pays Vote inclusion; direct
fallback gas is paid by its sender. No historical fallback-gas measurement is
reused as a new receipt here. The largest observed100-NFT mint is13,956,493 gas;
this inherited deployment blocker remains untouched.

**273 unique executed tests/scenarios:**232 Solidity regression/security cases +
4 full-season benchmark cases +37 frontend cases. The full regression run passed
231 cases; the subsequently added exhaustive canonical22-horse scoring case also
passed within the28-case sponsored-contract run. Overlapping targeted reruns are
not counted twice. New sponsored contract cases:28; worker cases:22.

Solidity compile, frontend tests, typecheck, lint and production build pass.
Lint:0 errors,8 inherited warnings (allocations/history/mint/refund set-state in
an effect; two home-page image warnings; Voting set-state-in-effect and cleanup
ref/exhaustive-deps). A narrow lint annotation explains the asynchronous timestamp
sample; it is not a render-time side effect. No dependency upgrade was performed.

`benchmarks/preserved-base-sha256.json` records byte-for-byte comparison of Master,
canonical dataset,22 portraits and the three stable Genesis/race/Community
contracts against the base. Build/typecheck and all regression source remain
reproducible; `benchmarks/verification.txt` preserves the command outputs.

Files in this checkpoint: new HOFRelayedRace and ERC1271 mock; four signed-voting
client/backend/queue/proxy modules; two Next API routes; Voting component; three
contract/worker/benchmark test files and their helper; two frontend test files;
this report, the implementation addendum, fresh benchmark data and verification
records. No Variant C files, mint changes or economic rule changes are included.
