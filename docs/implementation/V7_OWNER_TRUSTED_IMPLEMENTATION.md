# Owner-trusted voting — implementation review (uncommitted)

Base: `work/v7-final-decisions`, commit `8d78e328a0675239d5e856f945cc8c82c295928c`.
No commit, push, merge or deployment of this implementation. V7 Master is unchanged.

## What is implemented

`HOFTrustedRace` is the new encrypted path. `HOFRaceVoting` remains the historical
commit/reveal implementation for regression coverage; it is not the deployment
choice for the new UX. `HOFTrustedLeaderboards` is the companion Community/HOF
read and prize interface. Existing treasury can use its `getSeasonTop3` interface.
Existing deployed immutable contracts are neither upgraded nor migrated here.

The browser helper `voteOnce` encrypts locally, requests backend admission, and
submits exactly one wallet transaction. There is no wallet reveal/points claim.
Optional existing VP top-ups still require their own optional transaction; they
cannot change or split the first pick. There is no additional voting fee.

The server-only module validates encrypted ballots and signs admissions. The HTTP
service exposes only POST `/vote/admission`, configured for a particular race,
key and signer by its operator. Clients cannot select arbitrary race contracts
for server decryption. Input is bounded, concurrency limited and failures return
a generic error; no plaintext/keys are returned or logged. Mount behind HTTPS
and an operational rate limiter. There is no website source in this branch;
`voteOnce` is a browser-bundle-compatible integration helper, not a deployed UI.

## Encryption and authorization

Use Web Crypto RSA-OAEP with SHA-256 and RSA-3072 to wrap a fresh AES-256 key.
AES-GCM encrypts the 33-byte ballot (one-byte horse 1..22 + random 32-byte salt)
with a fresh 12-byte IV and 128-bit authentication tag. No custom cipher is used.
Envelope: version 0x01 | 384-byte wrapped AES key | 12-byte IV | 49-byte encrypted
ballot including tag. Total 446 bytes. Public key is SPKI, pinned on-chain; key ID
is keccak256(SPKI). Key generation is server-only and production private keys must
be backed up securely, never checked into git. Helpers use Web Crypto; the tests
run on Node 24. Production runtime and browser support must be validated separately.

Domain binding includes chain ID, race address, wallet and encryption key ID.
The commitment adds `HOF_BALLOT_V1`, horse and salt, using canonical ABI encoding.
The domain is also the RSA-OAEP label; AES-GCM additional authenticated data is
that domain plus the commitment. Backend validation checks decryption and exact
commitment before signing. A malicious backend can still authorize bad ciphertext;
Solidity intentionally trusts admission rather than claiming to validate RSA.

EIP-712 admissions bind wallet, commitment, ciphertext hash and deadline to this
race and chain. Only the configured backend signer is accepted. Ownership and VP
are independently checked on-chain at transaction execution, so a stale backend
ownership check cannot authorize voting with transferred NFTs. One-use NFT state
is updated atomically; duplicate token lists revert fully. Admission deadline is
inclusive, but voting always excludes closesAt and later.

The HOF owner, backend signer and Team Reserve address cannot vote or top up.
Roles are pinned for the deployment; the board disables ownership transfer and
renunciation so a new governor cannot silently escape the exclusion. Undisclosed
owner-controlled wallets cannot be identified by this protocol. Role/key rotation
and migration are not implemented in an active race.

Primary API references (primitives, not an audit of this integration):
- https://nodejs.org/api/webcrypto.html
- https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography

## Accepted set and complete settlement

Every accepted vote stores the full ciphertext, wallet, commitment and VP at an
append-only index. A rolling `recordsHash` covers each admission and every VP
addition with operation type and index. The final count, hash and totalVP are
recorded by permissionless `freeze()` at/after closesAt. An explicit freeze may
happen later, but no record can change after the 24-hour deadline.

`settleRace` requires an RPC finality block at or beyond closesAt (default tag:
`finalized`), freezes the race, reads/decrypts every accepted record, and refuses
any malformed ballot. The worker has no partial-results fallback. Its caller
must use the intended chain-finality policy; unsupported finality fails closed.
The contract enforces timestamp closure, not cross-chain finality attestations.

The backend signs the frozen record hash, ballot count, totalVP, all 22 horse VP
totals and a score Merkle root. The contract checks the signer and total VP, then
sorts all 22 horses by descending VP, tie by smaller horse number. There is one
immutable proposal. A bad owner-signed proposal cannot be amended through an
admin override; it can leave the race stuck. The worker resumes the same proposal
and checks its root against the deterministic result it recomputes.

A score leaf is the double keccak hash of canonical ABI(chainId, raceAddress,
index, wallet, points). Pairs are lexically sorted hashes; odd nodes are promoted.
The worker builds the root from all accepted wallets. An empty ballot set uses
keccak256(empty bytes) as its nonzero root and all-zero VP totals; existing V7
lower-number tie ordering still applies, with no invented minimum turnout rule.

Anyone may relay owner-signed results and consecutive score batches of 1..25
records. Contract retrieves wallet from the accepted index, checks the score leaf
and V7 score range, and advances a monotonic cursor. Cannot omit, duplicate,
reorder, fabricate a wallet or finalize before the full accepted count is covered.
A Merkle proof authenticates the owner's score statement; it is NOT a proof that
a score follows from ciphertext. False but structurally consistent owner results
remain possible under the approved trust model.

No private key, salt or wallet-to-horse choice is published. Proposal totals and
prepared scores become publicly inspectable only after the voting window closes.
Public post-close wallet point differences can infer choices; this is explicitly
not anonymous voting. Nothing prevents a trusted owner from leaking information.

## Automatic and atomic leaderboard reads

Preparation writes per-race score entries but `pointsOf` returns zero until
`finalize()`. The final transaction sets a permanent flag and reveal timestamp;
no external calls or payouts occur in it. Both boards immediately include this
race in the same chain state. No wallet iteration occurs during final activation.

Community season reads sum at most 10 finalized race entries; All-Time at most
60 (Chapter I only). Horse reads use the same finality gate and V7 25/18/15/12/10/
8/6/4/2/1/0 formula. Wallet scores are not multiplied by VP. These bounded views
replace the previously proposed versioned snapshot writes. Full leaderboard UI
sorting/pagination can be indexed off-chain from the canonical public scores.
There is no second All-Time addition during season archival.

`registerRace` is owner-only, before opening, enforces consistent configured roles
and Genesis, unique addresses, six seasons of ten races and exactly three-day
opening cadence within each season. Later season first openings are at most
7 days after the previous Race #10 final reveal; delayed archival cannot reset
that anchor. Owner-only `activateChapter2` enforces a minimum 30 days after
Race #60 revealedAt, all 60 races finalized, and single activation. It introduces
no Chapter 2 economics or rollover withdrawals.

## Live tie-break without an unbounded participant transaction

After final races, permissionless `indexParticipants` accumulates prize lookup
indexes in batches of at most 25; this does not gate logical leaderboard updates.
Each season keeps point-bucket wallet counts and XORs, updated for every race
contribution including zero. Season finalization requires all ten final races and
complete participant indexing. Participants may grow across races; no transaction
must traverse that unbounded wallet list.

Winner determination scans token IDs below Genesis.nextTokenId (at most 2222),
skips burned IDs, and processes each currently owning participant once. It counts
holders per score and orders them by their lowest current Token ID. Subtracting
holder counts from bucket counts identifies tied nonholders; all are skipped if
there are two or more. If exactly one nonholder remains at a score, XOR recovers
its address. A sole nonholder retains eligibility behind a tied holder or at a
unique score. This preserves the approved existing rule and reads ownership in
batches with a Genesis ownershipRevision check through finalization. Any actual
ownership change invalidates the provisional scan and requires a fresh epoch.
Work is bounded to 25 token IDs or 25 score buckets per transaction. Transfers
remain enabled, so repeated changes can delay prize determination.

Supply/refund economics and `HOFSeasonRewards` remain unchanged by hardening.
Genesis only adds an ownership-change revision counter. Integration tests use
the treasury to reserve 4000 USDC rollover for an empty podium.

## Current validation and limitations

See `V7_HARDENING_REVIEW.md` for the current complete regression counts and gas
receipts, and `V7_DEPENDENCY_AUDIT.md` for exact dependency findings/remediation.
The old single-transaction 15.8M prize scan and transient-storage implementation
have been superseded by resumable batches. No global or target-chain gas guarantee
is claimed; all measured settlement stages are tested below a 3M local budget.

Owner trust remains explicit and accepted. The owner can decrypt early, misreport
or censor; key loss or an invalid immutable proposal can halt a race. Key custody
and signing are separate responsibilities even if run by the same backend.
No threshold operators, extra cryptographic scheme or admin override is introduced.
The repository provides service/worker modules; production HTTPS, secret manager,
relayer funding, scheduling and monitoring remain operational launch work.

The prize scan preserves current ownership by rejecting any intervening actual
ownership change. This avoids early snapshots and transfer locks but permits
repeated transfers to delay winner determination and consume additional operator
gas. `settleSeason` resumes unchanged scans, restarts stale epochs when rerun, and
never emits a final podium for incomplete work. No real secret or deployment is
part of this change.
