# Automatic Race Reveal service — testnet MVP

Base: `d8ffe5c4771d3c836737abd6d3a378f7cd140b33`.
Branch: `work/v7-race-reveal-service`. No protocol/Tokenomics change.

**TESTNET MVP: owner-trusted encryption.** The existing RSA3072/AES encrypted
ballot format and dedicated admission signer are unchanged. The operator can
technically decrypt before closure and attests the result. This is not trustless
computation. Admission refusal still prevents a voter from obtaining a usable
fallback signature. **FUTURE SECURITY UPGRADE: threshold encryption**, deferred;
no threshold operators, paid services or new cryptography are introduced.

## Implemented path

`run-race-reveal-service.cjs` starts one Node process, explicit testnet opt-in only.
It verifies chain46630, labelled TEST ONLY / NO VALUE MockUSDC with6decimals,
Sale/Genesis wiring, board/factory wiring and five distinct owner, admission,
team, project and relayer addresses. Actual compiled artifacts supply the ABIs.
The admission/settlement signer is NOT the owner/admin or treasury. It also needs
limited test gas for settlement. The separate relayer sponsors voting gas.

The service discovers addresses from the registered canonical board, validates
factory provenance for Chapter1/Season1–6/Race1–10 and checks immutable race roles.
It never registers races or deploys contracts. Operators create/register canonical
races through the existing approved path. Chapter2 race execution is not invented.

While voting is open, the existing authenticated admission server and durable
SignedVoteQueue run unchanged: individual signature/eligibility checks, wallet/race
quotas, target25, smaller batches, gas estimation and urgent pre-deadline flush.
Only accepted chain ballots count. Queue-only packets expire without inclusion.
No deadline guarantee is possible during outage, censorship or RPC failure.
A voter retaining admission can use the existing direct same-nonce fallback.

After the chain deadline:

1. Reconcile any pending voting journal transaction before reusing its nonce lane.
2. Require a `finalized` block whose timestamp reaches `closesAt`.
3. Submit `freeze()` and wait for its canonical finalized receipt.
4. Reconstruct all accepted records from ordered events, checking contiguous indices,
   ciphertext hashes, rolling records hash, VP sum, count, stored wallet/commitment
   and block consistency. Decrypt and verify EVERY ballot commitment.
5. Compute22totals and the complete ranking. Equal horse VP uses the existing lower
   horse-number rule. Existing V7 SCORE is `[25,18,15,12,10,8,6,4,2,1]`, then0.
   This imports the existing implementation; it does not add another scoring formula.
6. Persist a result-plan hash bound to frozen records, totals and score root. Submit
   the existing signed `proposeResult`. A different recomputation fails closed. Before preparing scores, the service
   also verifies the canonical finalized proposal receipt and its exact aggregate
   totals/root in transaction calldata. A foreign proposal with the same root and
   different totals is refused; nested proposal calls are not a supported recovery path.
7. Resume `prepareScores` from the on-chain processed cursor in batches of at most25.
   Each send uses static simulation, gas estimate plus20%, capped at5M.
8. Only after all accepted wallets are processed, submit `finalize` and reconcile.
   Contract getters activate race points, Season and All-Time atomically through
   the existing logical aggregation. No user reveal or claim transaction exists.

A missing/malformed ciphertext, bad key, missing log, root mismatch or failed proof
blocks the ENTIRE result. Nothing is omitted to make a partial race look final.
The complete result is held in RAM only as a performance cache; a restart recomputes
it from chain and keys and checks the persisted hash. No plaintext picks or secrets
are logged. The settlement journal contains post-close transaction calldata
(aggregate totals, points and proofs), not private keys or individual horse picks.

## Durable transactions and recovery

`RevealTransactions` adds a separate journal for the admission/settlement wallet.
An exclusive service lock plus chain/wallet nonce lock prevent concurrent workers.
Each intent is fsynced BEFORE broadcast, then its returned hash is fsynced. Atomic
rename and parent-directory fsync preserve snapshots. It binds board/chain/sender.

Polling only wakes reconciliation. Restart before closure reloads the voting
journal; restart during decryption recomputes everything; restart during scoring
uses the chain cursor. No result or cursor is trusted solely from RAM/journal.
Already-finalized races are skipped without further result/scoring sends.

Known pending transaction: wait for a canonical finalized receipt. Unknown broadcast
response: if its nonce is mined, inspect canonical blocks from broadcast height for
that sender/nonce, at most100blocks per tick. Verify destination, exact calldata,
value, status and finality. Do not resend while nonce or receipt is unresolved.
An RPC timeout preserves the journal and halts sends; later polling retries READS.

Explicit local `service.transactions.replacePending()` can replace a known pending
transaction using the identical nonce, target, data, value and gas limit with25%
fee bump; at most3broadcast attempts. It is never invoked automatically or exposed
as an HTTP endpoint. Stop scheduler polling before an operator invokes it; wallet
lock remains held. A mined revert, cancellation/mismatch, unavailable original
transaction or unresolved nonce requires operator investigation. The service does
not automatically clear/skip it. Preserve journals and collect read-only nonce/
receipt evidence; do not delete a pending record simply to force progress.

**Supported topology: one host, one PID namespace, persistent local disk.** All
processes using either wallet must share the default `/tmp/hof-relayer-locks`.
Independent disks/hosts/replicas are NOT supported. Foreign namespace locks fail
closed; remove a stale lock only after verifying its worker is stopped and wallet
transactions have been reconciled. Do not share these wallets with other tools.
For failover, stop the old host first, move intact journals and provision keys
securely, reconcile the chain, then start the replacement host. Local locks do not
provide distributed consensus. Disk loss/rollback needs manual reconstruction.

## Frontend states

Public reads at a consistent block determine the UI:

| Chain state | UI |
|---|---|
| Before opensAt | Voting has not opened |
| opensAt <= timestamp < closesAt | Voting Open |
| Deadline reached, not frozen | Voting Closed |
| Frozen, not finalized (including score preparation) | Preparing Race Reveal |
| Finalized complete race | Race Revealed |
| Complete consistent board read after finalization | Leaderboards Updated |

No partial standings or interim votes are returned as a final race. The existing
15-second frontend refresh can delay display of a completed transaction. Existing
prior-race scores can still be shown while a new race is preparing. Results use the
unchanged canonical22horse dataset. No mock results are added to production.

## Configure/run only after separate testnet authorization

Use `.env.v7-service.example` as the SERVER template. Defaults do not start work.
Keep the real environment file and all signing/decryption files outside the public
repository/web root. Require private file permissions0600 and directory0700; use
an OS user dedicated to HOF. Never use NEXT_PUBLIC for these values.

- `HOF_ADMISSION_KEY_FILE`: existing dedicated board backend signing key.
- `HOF_RELAYER_KEY_FILE`: separate limited-funded voting relayer key.
- `HOF_DECRYPTION_KEY_DIRECTORY`: RSA PKCS8 PEM files named
  `<keccak256(SPKI public key), without 0x>.pem`. Public key must match each race.
  Keep secure backups for every unfinished race; key loss makes it unfinalizable.
- `HOF_SERVICE_DIRECTORY`: durable local journals; retain and back them up safely.
- `HOF_SERVICE_MODE=testnetMockUSDC`, deployed board/sale/project config and RPC.
- `HOF_SIGNED_INGRESS_TOKEN`: externally provisioned random secret, >=32characters,
  shared only with the Next server proxy.
- Next server `HOF_SIGNED_SERVICE_URL=http://127.0.0.1:9000` on the same host;
  otherwise use a separately configured private authenticated network connection.

After separate approval, load protected environment into the process, set
`HOF_ENABLE_SERVICE=YES`, and run `node scripts/run-race-reveal-service.cjs`.
It binds127.0.0.1 only; no open public admission port. A host supervisor should
restart on failure and keep the machine awake. SIGINT/SIGTERM waits for active work
and closes listeners/locks without discarding transaction state. Never start it as
a build step or a serverless request handler. No supervisor or remote process has
been activated by this task. Use TLS and request/body/concurrency controls at the
public Next/infrastructure boundary; application quotas do not replace those.

`service.status` gives generic local lifecycle/recovery status without raw errors.
No sensitive debug logging should be enabled. Monitor host uptime, disk durability,
RPC finality/history availability, wallet gas and blocked journals operationally.

## Scope and remaining risks

- $0 tooling/local computer is sufficient for local tests; free hosting has no uptime
  guarantee. Public RPC historical logs and finalized-tag behavior need live checks.
- Event reconstruction uses paginated history and one stored-ballot check per voter;
  2200voters and up to60races impose RPC load. No paid indexer dependency is added.
- Settlement runs serially. RPC/decryption/recovery delays can delay subsequent work;
  existing three-day cadence provides no guarantee against a prolonged outage.
- Stable Community prize scan, payouts and Season/Chapter administration remain
  their existing separate operator tasks. This service does not auto-select winners
  or trigger economic/admin operations. Logical Season/All-Time scoring is automatic.
- No changes to contracts, mint cap, supply, refund, rollover, Master, portraits,
  scoring economics, dependency versions or Phase1 controls.
- MockUSDC remains test-only and does not simulate real USDC blacklist/pause.
- Existing dependency/external-audit, Community liveness, HOF-beneficiary and future
  Chapter2 rollover-release issues remain. This is not mainnet readiness evidence.

Validation evidence and exact counts are recorded in `race-service-evidence/`.
