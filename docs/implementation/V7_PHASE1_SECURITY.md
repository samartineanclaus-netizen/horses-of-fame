# V7 Phase 1 — testnet security remediation

Branch: `work/v7-security-hardening`. Base: `c726cd21eddf1516f4076793289a2b598d2d1db0`.
Scope: five approved TESTNET blockers only. No dependency upgrades, deployments,
threshold implementation, Variant C, Tokenomics changes, or paid service dependency.
This document supersedes the old deployment/worker instructions for this branch.

## Accepted trust and zero external budget

MVP voting remains **owner-trusted**, not trustless. The configured HOF backend
holds the RSA decryption key and technically can decrypt before the 24-hour close.
The owner/admission/team restrictions, signed intents, sponsored batches and
paid direct fallback are unchanged. Tally correctness and admission availability
remain accepted trust assumptions; canonical provenance does not prove an honest
tally. The backend cannot forge a voter's EIP-712 signature.

No external operator or paid audit is required to run the local suite. Hardhat,
Node, the existing dependencies, local disk and a local worker are sufficient.
Actual Robinhood deployment remains a separate approved action requiring real
configuration and freely obtained test tokens/RPC access. Availability/quotas of
free remote resources have not been established by these local tests. This is
not mainnet readiness or an externally audited release.

## Finding → remediation

| Audit finding | Change |
|---|---|
| SEC01 legacy deployment | Old deployment/operations entries fail before signing. Canonical deployment constructs Genesis, trusted board plus immutable factory, Rewards and Sale. |
| SEC02 arbitrary race registration | Board accepts only addresses created by its own fixed-code factory, for the current chapter/season/ordinal. No whitelist setter or implementation replacement. |
| SEC04 enqueue race | Re-read state after asynchronous validation; monotonic revision/attempt checks; terminal transitions are idempotent. |
| SEC05 duplicate workers | Exclusive local journal lock plus chain/relayer lock; duplicate processes fail closed. |
| SEC07 ambiguous broadcast/restart | Persist nonce, calldata hash, gas limit and starting block before broadcast. Reconcile receipts and mined replacements before further sending. Unknown status blocks sending. |
| SEC06 admission abuse | Private authenticated proxy channel; quotas only after wallet signature verification, scoped to chain/race/wallet; ignore forwarded IP headers. |
| SEC15 refund network | Only 4902 triggers add-chain; then switch and re-read chain; verify again after account access and immediately before Refund send. |
| SEC08 operational configuration | Required public configuration, separate operational roles, USDC code/6-decimal checks, future timestamps and local worker constraints. Live custody/config verification remains a deployment prerequisite. |

## Canonical deployment, without executing deployment

`npm run deploy:v7:testnet` requires every field in `systemConfig()` in
`scripts/v7-canonical-config.cjs`. It checks chain 46630, configured owner signer,
USDC code/decimals and the deadline before any transaction. Prize Pool destination
is the newly created Rewards contract, never an arbitrary project destination.

`npm run deploy:v7:race:testnet` requires a valid RSA3072 SPKI public key, existing
board/sale addresses, role configuration and opening timestamp. It verifies
Genesis/sale links, sell-out, cadence and season gap, then uses the board's factory
and registers the returned address before opening. Creation and registration are
separate transactions: if registration fails, retain the creation receipt and
investigate; do not blindly create another race. An unregistered race cannot
contribute Community scores. No Chapter 2 economic mechanism is added.

The factory only constructs `HOFRelayedRace`. It cannot authorize an external
address. Each board has its own immutable factory and checks chapter=1, current
season and race ordinal. Duplicate registration is rejected. The owner remains
allowed to schedule genuine canonical races within existing rules.

Historical regression fixtures use `LegacyTrustedBoardHarness` under
`contracts/mocks` solely to retain tests of old race/scoring and synthetic gas
fixtures. It explicitly bypasses provenance only in those tests; it is never used
by deployment scripts. Sponsored tests, complete-season benchmarks and new
provenance tests use the actual hardened board/factory. An arbitrary deployment
of the test harness does not grant provenance in a genuine board.

Legacy deployment/operations commands are intentionally disabled, including old
status/validation commands whose ABI would give misleading results. Use the
current contract interfaces and `signed-backend.cjs` for local exercises. No
legacy user reveal/claim flow is restored.

Frontend configuration uses `NEXT_PUBLIC_HOF_TRUSTED_RACE`,
`NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS`, `NEXT_PUBLIC_HOF_SIGNED_VOTING=enabled`,
`NEXT_PUBLIC_HOF_CHAIN_ID`, `NEXT_PUBLIC_HOF_RPC_URL`, plus the existing Genesis,
Sale and USDC public addresses. Obtain addresses only from actual approved
creation receipts. The deployment does not configure or launch a backend.

## Local worker lifecycle and custody

Use one operating host with local durable disk. All processes using the same
operational relayer must share the same `lockDirectory`; do not use independent
containers/disks or network filesystems. No distributed-lock guarantee is claimed.
For MVP, one process owns one race journal and its dedicated relayer nonce stream.
Never switch journals or reuse a relayer for unrelated transactions while work
is pending. Persist the journal and its binding/lock metadata together.

The runtime injects the race, admission signer, RSA private key, dedicated funded
relayer, treasury address, journal path and ingress token. Keep these keys in local
permission-restricted files or process memory outside Git; never put them in
`NEXT_PUBLIC_*`, responses or logs. HOF admin/treasury keys are not runtime relayer
keys. The service does not generate or contain real credentials.

1. Construct queue and server; call `await queue.checkRelayer()` before listening.
2. Set the same newly generated server-only `HOF_SIGNED_INGRESS_TOKEN` on Next's
   server and the service (at least 32 characters; use a CSPRNG, not a password).
3. Bind the service to loopback/private ingress. For a local free MVP, Next and
   worker can run on the same machine. Never expose the worker directly publicly.
   Across hosts require TLS and firewall restrictions, not an unencrypted token.
4. Call `queue.start()`; immediate wake-up never waits for 25 votes. Default cap
   remains 25 / 100 NFT uses; gas estimation can split further. Urgent polling
   applies within the last 60 seconds. Signed/Submitted is not valid inclusion.
5. On shutdown, stop the HTTP listener and `queue.stop()`, wait for in-flight
   enqueue/flush to complete, then `queue.close()` to release locks.
6. Dead-process locks can be recovered only in the same host and PID namespace.
   A different/missing PID namespace fails closed and requires manual recovery;
   an unseen process in another container is not assumed dead. Live-process locks and
   mismatched journal deployment bindings fail closed. Never delete a live lock.

Private ingress authentication, a 128KiB body limit, request timeout and bounded
concurrency protect service resources. Signature-authenticated, currently NFT-holding wallet/race quotas
replace the shared proxy-IP quota. Current nonce is checked before allocating a quota entry. Anonymous invalid signatures or nonholding wallets do not consume
these quotas; no application can promise immunity to volumetric network floods.
Use the local firewall and a free reverse proxy's connection/body/time limits for
any later public endpoint. Forwarded IP headers are not trusted by this service.

## Durable transitions and recovery

Internal lifecycle: Submitted → Broadcasting → Pending → Included on-chain →
Vote confirmed. Unknown broadcasts become RecoveryRequired. Eligibility failures
or a mined transaction without inclusion are Rejected; unsent late jobs expire.
The browser still independently verifies inclusion; internal queue state is not
an authority for confirmation.

Each update is fsynced with a monotonic revision. A late enqueue cannot erase a
hash or reduce retry attempts. Before RPC broadcast, all group members persist
nonce, exact calldata hash, destination, gas and starting block. A partially completed
journal write before broadcast fails closed; restart must not guess whether a
send occurred. A torn final unacknowledged line is truncated, not accepted.

On restart/flush, reconcile unresolved transactions first. Receipt block hashes
are checked. Lost responses/mined replacements are found by operational sender
and nonce, scanning at most 100 blocks per recovery pass. No receipt or unknown
nonce means **no automatic retransmission**, including after RPC timeouts. This
may sacrifice timeliness; the voter's direct fallback remains independent.

For a known pending transaction only, a local operator may explicitly call
`replacePending(id)`: it checks chain transaction identity, nonce, destination,
value, calldata, deadline and retry budget, then uses the same payload/nonce with
25% fee bump. It is not an HTTP endpoint or automatic retry. Unknown/dropped hashes
are not replaced blindly. A mined cancellation/replacement without ballot inclusion
is recorded as Rejected, with direct fallback available before deadline. No
post-deadline cancellation transaction is automatically sent by this code.

Legacy journals with hashes but no durable nonce metadata require manual
reconciliation before use; no silent migration can establish facts that were not
recorded. Preserve old files. Never "recover" by resetting attempts or deleting
pending hashes. All API errors are generic and omit plaintext/key material.

## Deferred mainnet findings

Dependency remediation remains Phase 2 (audit baseline production: 3 high + 23
moderate; no claim that vulnerabilities were fixed). Community ownership revision
scan griefing and the seven-day season deadlock, conditional USDC payout blocking,
full operational queue retention/schema hardening, CI hardening and scalable
leaderboard reads remain open. Real Robinhood gas/finality/USDC validation and
external security review remain required before considering mainnet.

Supply, 30 USDC price, mint25, refund/burn, Team restrictions, stable Community,
rollover and Chapter 2 timing retain existing rules. Master, canonical dataset and
22 original portraits must be byte-identical to base. Threshold is deferred in
`V7_THRESHOLD_FUTURE_UPGRADE.md` and is not part of the active architecture.
