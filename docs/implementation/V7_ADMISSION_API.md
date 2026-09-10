# Owner-trusted admission and settlement API

No service or contract is deployed by this integration. All addresses must come
from a reviewed deployment; there are no fallback or demonstration addresses.

## Browser → Next server → admission service → blockchain

The browser calls `POST /api/vote/admission` on its own website origin, with
`Content-Type: application/json`. The Next route forwards only these fields to
the server-only `HOF_ADMISSION_URL`, whose route is `POST /vote/admission`:

| Field | Required format |
| --- | --- |
| wallet | 20-byte hex EVM address |
| commitment | 32-byte hex commitment binding chain, race, wallet, key, horse and random salt |
| ciphertext | 446 bytes as hex, v1 prefix 0x01; browser RSA-OAEP/AES-GCM encrypted ballot |

No horse number, plaintext choice, salt, decryption key or signing key is sent in
this HTTP JSON. The proxy accepts exactly these three fields and at most4096 bytes.
The service is configured with one race, signer and private CryptoKey by its
operator, never by the caller. `createAdmissionServer` is exported from
`lib/owner-voting/service.cjs`; it does not start on import.

The trusted backend decrypts privately at admission, validates the commitment,
domain and horse1–22, then checks the voting window and excluded wallets. It
returns only `deadline` (Unix seconds, decimal string at the browser proxy) and
`signature` (65-byte EIP-712 signature). The browser signs/sends one `vote`
transaction carrying ciphertext, commitment, authorization and eligible NFT IDs.
The contract checks current ownership, unused token VP, immutable roles, deadline,
authorization and duplicate voting again. Admission alone is not an accepted vote.

This model trusts the owner: the backend actually can read votes before closing.
It is not trustless and does not independently prove correct decryption/tally.

## Errors and retries

- Proxy:503 if not configured,403 for mismatching Origin,415 for content type,
  413 for oversized body,400 for invalid ballot/admission rejection,429 if upstream
  rate-limits,502 for upstream failure or malformed response.
- Service:404 for other routes/methods,413 for oversized body,503 at concurrency
  limit,400 for admission failure. It returns generic errors, not private diagnostics.
- Responses use `Cache-Control: no-store`. No plaintext or key logging is allowed.
- A rejected/failed admission sends no transaction. The user may retry while open.
  Chain state is authoritative; concurrent identical admissions cannot bypass
  one-vote-per-wallet or one-use-per-NFT enforcement.
- Reverse proxy must enforce HTTPS, request timeouts and rate limits. Do not rely
  on Origin as authentication. Production abuse protection and secret storage
  are operator configuration, not mocked by the website.

## Configuration and secrets

Public frontend configuration: `NEXT_PUBLIC_HOF_RPC_URL`,
`NEXT_PUBLIC_HOF_CHAIN_ID`, `NEXT_PUBLIC_HOF_TRUSTED_RACE`,
`NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS`. Server-only proxy configuration:
`HOF_ADMISSION_URL`. Empty configuration disables submission.

Supply the backend's signing account and race-specific decryption CryptoKey from
a protected server-side secret manager or equivalent operator-controlled store.
There is deliberately no committed private key and no NEXT_PUBLIC private-key
variable. Persist/back up race keys securely before opening: losing a key can
permanently prevent complete Race Reveal. Loading production keys and operating
the service/worker require configuration outside this repository.

## Complete settlement and public verification

After the configured RPC finality tag confirms closure, the worker calls
`settleRace` in `backend.cjs`. It freezes the on-chain accepted set, reads and
decrypts every accepted record, includes same-pick VP additions, builds all22
totals/ranking and the unchanged V7 score vector, and signs the result commitment.
Any undecipherable accepted ballot aborts the worker; it cannot silently omit it.

On-chain `proposeResult` binds frozen records hash, accepted count, totalVP, all22
totals and a wallet-score Merkle root. Consecutive `prepareScores` batches contain
at most 25 wallet entries (worker default 25). `finalize` succeeds only after
all accepted records have a valid committed score proof; it is irreversible.
Resume uses processedCount/root checks. Re-running a finalized worker is a no-op;
another on-chain finalization or changed result is rejected.

Users can read `finalized`, `frozenRecordsHash`, `acceptedBallotCount`,
`processedCount`, `scoresRoot`, `pointsOf(wallet)`, `ranking`, `horseVP` and
`horseRacePoints`. A finalized race activates Season and All-Time getters
immediately without claims. The frontend sums those same finalized scores at one
block and verifies its block hash; it does not wait for prize-participant indexing.
Anyone can check coverage/proofs and sum published scores, but correctness of the
hidden choices/tally remains owner-trusted. Public wallet scores may reveal or
narrow a voter's choice; ciphertext does not prevent that inference.

Community prize indexing is independently limited to 25 wallets per transaction.
It reads only each ballot wallet, not its ciphertext. `settleSeason(board)` is the
server-side resumable operator helper; its batch size is 1–25. It indexes all ten
final races, starts or resumes a prize scan, processes holder/score buckets, then
calls owner-only `finalizeSeason`. Only the configured owner can perform that
last step; other accounts can relay the permissionless preparation steps.

Prize holder scans process at most 25 token IDs per transaction; nonholder
selection processes at most 25 of the 251 possible V7 score buckets. Epoch and
cursor checks prevent replay. Genesis `ownershipRevision` must remain unchanged
through finalization; a mint, transfer or burn invalidates provisional work.
Rerun the worker to start a new epoch. No transfer lock or stale ownership snapshot
is introduced. Repeated transfers can delay this prize phase and increase operator
costs; live race scores remain final and correct. The treasury cannot obtain a
season podium until the entire valid scan is finalized.

`activateChapter2()` is owner-only and irreversible. It requires all 60 Chapter 1
races finalized and `block.timestamp >= races[59].revealedAt() + 30 days`.
`chapter2StartedAt` records activation; delayed season bookkeeping cannot change
the anchor. This gate defines no Chapter 2 supply, prizes or spending permissions.

Rewards retain the existing `getSeasonTop3` interface and earmarked Chapter 2
rollover. Full-history reads remain bounded to 60 races; production RPC
indexing/caching and chain gas/finality checks remain launch gates. Prize scans
no longer use transient storage. See V7_HARDENING_REVIEW.md for measured batch gas.
