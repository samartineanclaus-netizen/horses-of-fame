# V7 decisions and remaining implementation blockers

## Current MVP decision — Phase 1 security hardening

External budget is $0. Sponsored Voting remains owner-trusted for MVP/testnet:
HOF backend can technically decrypt before close. Threshold is suspended, not
implemented or advertised as active; see `V7_THRESHOLD_FUTURE_UPGRADE.md`.
The five approved testnet blockers are addressed in `V7_PHASE1_SECURITY.md`;
no paid service, dependency upgrade, mainnet change or economic rule is added.
Historical implementation status below is retained for provenance.

## Integration status — September 10

The combined uncommitted work is on `work/v7-hof-integration`. See
`V7_INTEGRATION_REVIEW.md` for merge provenance, preserved protections and tests.
The canonical frontend's competitor IDs1–22 are now tested end-to-end against
the trusted protocol. This resolves competitor identity mapping, not the still
open random placement/allocation of HOF NFTs within a future fair metadata reveal.
The original Master is unchanged. No external deployment has been performed.

The approved minimum 30-day Chapter gap is now enforced by
`HOFTrustedLeaderboards.activateChapter2()`. It requires all 60 races finalized
and uses Race #60's immutable `revealedAt`, with no maximum or auxiliary admin
timestamp. It records one irreversible activation timestamp. Chapter 2 economics,
race registration and earmarked-rollover disbursement remain out of scope.
See `V7_HARDENING_REVIEW.md` and `V7_DEPENDENCY_AUDIT.md` for the latest review.

Status: baseline commit `8d78e328a0675239d5e856f945cc8c82c295928c` is available on GitHub on `work/v7-final-decisions`. Subsequent owner-trusted implementation is local and under review; no new commit or push. Based on `v7-mint-escrow` at `a831b89`.
Owner instructions in the current session explicitly amend only the decisions below.
The original V7 Master is preserved byte-for-byte; read it together with this
addendum. This is not a claim that all decisions are already implemented.

## Resolved decisions

| Decision | Approved behavior | Implementation status |
| --- | --- | --- |
| Community tie-break | Equal points: lowest currently held Genesis Token ID wins; a holder beats a nonholder; tied nonholders are skipped for prizes, continuing down the points ranking. Ownership is read during winner determination. | Implemented and tested. |
| One-action voting | 22 HOF horses compete solely through community VP; 24 hours of secret voting; no external sporting results; voter must not return for reveal or points. | Implemented locally in trusted race + backend; admission decryption approved. Review/audit pending. |
| Scoring | Existing 25/18/15/12/10/8/6/4/2/1 formula, zero for positions 11–22; update Season and All-Time after immutable Race Reveal; no voter claims; no double settlement. | New trusted path implements complete owner-attested Race Reveal and atomic 10/60-race leaderboard reads. Legacy claim code is not presented as compliant. |
| Supply | Separate lifetime caps: 2,000 Public, 111 Community, 111 Team Reserve. Burns do not replenish mint capacity. Metadata reveal is separate from Race Reveal. | Implemented and tested. Legacy native-currency test mint removed because it bypassed these buckets. |
| Season gap | Maximum 7 * 86,400 seconds, anchored to Race #10's final Race Reveal, not administrative season finalization. | Enforced for later Chapter I seasons in the trusted leaderboard, anchored to Race #10 revealedAt. |
| Chapter gap | Minimum 30 * 86,400 seconds after the final Race Reveal of the previous chapter: `chapterStart >= previousChapterEnd + 30 days`. Later starts are allowed; no maximum is introduced. | Enforced for Chapter 2 activation using Race #60 revealedAt; tested at 30 days −1s, exact, +1s, delayed admin bookkeeping and duplicate activation. |
| Community rollover | Missing prize stays in treasury, earmarked for Prize Pool/Community rewards in Chapter 2, separately accounted; no redistribution or discretionary Team/Project transfer. | Implemented and tested, including empty podium and all six seasons. |
| Refund follows NFT | Current holder of a refundable Public Mint NFT can refund after failed-sale deadline, even if not the minter; atomic burn/payment, once only. | Implemented and tested. |

### Scope of the tie rule

The owner stated the exclusion in the context of **equal points**. The code does
not invent a universal holding requirement for unequal scores. Two nonholders
with equal points are excluded, including when a holder also shares that score;
remaining candidates retain their score order and the established holder-first
comparison. A sole nonholder sharing a score with a holder ranks behind that
holder and is not automatically banned from a later prize. A nonholder with a
unique score is not excluded by this tie rule. The owner explicitly confirmed
this scope and the existing implementation.

Points and history of excluded wallets remain intact. Winner addresses are
archived at determination; a later NFT transfer does not change that snapshot.

## Approved owner-trusted model — local implementation under review

The owner has selected owner-managed encryption without threshold operators,
Shutter, drand or zero-knowledge. The owner/backend holds the decryption key and
can decrypt early; the designated owner address is excluded from voting in the
new trusted path. Public disclosure of individual plaintext choices, salts
and private keys is not allowed. Public score changes can still reveal choices.

Independent cryptographic verification of tally/scoring is relinquished in this
model. On-chain records and consecutive output processing can enforce coverage,
VP totals and structural consistency, but cannot prove that hidden choices were
counted honestly. Owner signatures establish authorization, not correctness.
The owner is trusted for tally/scoring as well as confidentiality and availability.

See `V7_SECRET_VOTING_ARCHITECTURE.md` for the approved design. It supersedes
the previous threshold architecture. Existing commit/reveal and claims remain
unchanged for regression. The new trusted race/leaderboards and backend implement
the one-action path; see `V7_OWNER_TRUSTED_IMPLEMENTATION.md`.

## Admission decision approved

The owner explicitly approved private backend decryption at admission to validate
ciphertext, horse range, domain and commitment before accepting a ballot on-chain.
This requires no extra user action, but actually reads votes early. The public
does not receive plaintext or private keys. Malformed ballots must be rejected
before acceptance; no invalid accepted ballot may be silently discarded.

## Remaining technical implementation gates

RSA-OAEP/AES-GCM, EIP-712 admissions/results and consecutive Merkle-authenticated
score batches are implemented. Bounded 10/60-race reads replace versioned snapshots.
Production chain gas validation, audit and deployment integration remain gates.

## Approved reveal failure policy — implemented in trusted path

If decryption/reveal cannot produce the complete owner-attested race result satisfying the enforceable on-chain structural checks,
the race remains unfinalized. Neither Season nor All-Time may update for that
race. Partial results are never final, and no arbitrary administrator override
may invent a result. Recovery is retrying production of the same complete,
owner-attested result; no timeout, forfeiture or fallback winner is authorized. Without ZK, an owner can attest a false but structurally valid result; the contract cannot detect this. This is an explicit consequence of the newly approved trust model.

The required product flow is:
22 HOF Horses -> 24h secret voting -> voting closed -> complete Race Reveal ->
full 22-horse ranking -> automatic wallet scoring -> Season update -> All-Time
update. The voter performs one Vote action, with no revealVote or claimRacePoints.
The owner authorized implementation after approving the owner-trusted design and
private admission validation. The new path enforces complete-record settlement.
Legacy scoring is not an implementation of this failure policy.

## Tokenomics versioning

Keep these approved amendments in this addendum and implementation documentation
until official V7.1 versioning is agreed. Do not change the Master or its pinned
integrity hash. The chapter-gap minimum is an explicit approved change from the
Master's earlier maximum, not an interpretation preserving that maximum.

## Other V7 items still open

- Fair metadata randomization, HOF numbering and allocation ordering remain open;
  deterministic testnet rarity IDs are not a production randomization scheme.
- HOF prize beneficiaries and final mainnet treasury architecture remain open.
- Final mint deadline; Community distribution uses; Team distribution terms;
  audit provider/scope/payment; creator-fee enforcement; legal/eligibility terms.
- Chapter 2 rollover custody transfer/spending mechanism remains unspecified.
  This change only reserves and reports the money; it adds no withdrawal route.
- Trusted-path Community winner determination uses batched point-bucket indexes
  plus a bounded current Genesis ownership scan. Production gas at worst ownership
  distribution remains a launch gate. Legacy full-participant scans are unchanged.

## Website integration — local, September 9

The approved trusted path now has Vote, complete Race Reveal and Season/All-Time
pages plus a server admission proxy. No user reveal or points claim is exposed.
Public readers pin the whole snapshot to one block and exclude unfinalized races;
participant indexing is not a prerequisite for displaying points.
See V7_WEBSITE_INTEGRATION.md. Mounting into the complete canonical website is
now integrated locally. Real wallet/mobile validation, keys, relayers and
target-chain validation remain launch work. No deployment or change to V7 Master
is included.

## Community gas stress — batched implementation

The earlier 15.8M single-transaction prize scan has been replaced. All settlement,
participant and prize batches are capped at 25; cursors and scan epochs support
resumption and reject replay. Each successful ownership-changing mint/transfer/
burn increments Genesis ownershipRevision. A changed revision invalidates any
provisional prize scan, including after its final batch. A restart uses a new
epoch, without stale holder counts or early ownership snapshots.

Race scoring/leaderboards activate only after every accepted vote has a prepared
score. Season prize winners activate only after all indexing, holder and score
batches complete under the still-current ownership revision. Repeated transfers
can delay prize determination; no NFT transfer freeze was added. The per-batch
and cumulative gas measurements, including 2,200 real encrypted votes and cold
distinct-score buckets, are in V7_HARDENING_REVIEW.md. Target-chain benchmarking
remains a launch gate; the former EIP-1153 scan has been removed.

## Optimization blocker — cumulative Community settlement cost

The owner approved the integration and hardening for local commit. The measured
Community season prize preparation/finalization cost remains an explicit
**OPTIMIZATION BLOCKER: 194,384,765 gas across 190 transactions** in the reported
full-supply stress scenario. Per-transaction batching does not resolve cumulative
cost. No redesign is included in this commit; evaluate separately before launch.
See `V7_HARDENING_REVIEW.md` and `V7_SETTLEMENT_GAS.json` for scope and receipts.

## Sponsored Voting reconstruction — approved direction, local checkpoint

The Sponsored Voting implementation has been reconstructed from integration commit
`2f1445163ec39c4b426dd580b3ca1ca58f98108e` on `work/v7-sponsored-voting`.
See `V7_SPONSORED_VOTING.md` for the exact API, adaptive flush strategy, trust
limitations and fresh benchmark methodology. Earlier uncommitted implementation
and benchmark outputs are not reused as verification evidence.

Approved direction: one client encrypted/signed intent, HOF-sponsored inclusion,
ciphertext in calldata/events, compact contract records, default target25 with
smaller immediate/deadline/gas-limited batches, direct paid fallback using the
same admitted signature. Admission refusal remains an accepted trust limitation.
Relayer funding uses a separate limited operational wallet; owner/admin/treasury
keys are not backend gas keys. Admission/eligibility checks, bounded rate limits
and persistent broadcast-attempt budgets protect sponsorship.

Community implementation remains stable; Variant C is not included or activated.
The inherited 100-NFT mint at approximately13.96M gas is a separate optimization /
deployment blocker. V7 Master, canonical horses, portraits and economic rules
remain unchanged. No public deployment or production activation is performed.

## Approved mint safety cap

The owner approved maximum 25 per Public/Community/Team mint call, with explicit
sequential Public UI batches and gas estimation. Implemented on
`work/v7-mint-gas-optimization`; see `V7_MINT_BATCH_CAP.md`. The historical
~13.96M mint(100) call is now rejected. This resolves the normal large-call mint
blocker for new contracts; target-chain validation, arbitrary receiver gas and
non-upgradeable existing deployments remain gates. No V7 economics changed.
