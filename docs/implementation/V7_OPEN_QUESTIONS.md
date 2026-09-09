# V7 decisions and remaining implementation blockers

Status: approved for local commit only; push is not authorized. Based on `v7-mint-escrow` at `a831b89`.
Owner instructions in the current session explicitly amend only the decisions below.
The original V7 Master is preserved byte-for-byte; read it together with this
addendum. This is not a claim that all decisions are already implemented.

## Resolved decisions

| Decision | Approved behavior | Implementation status |
| --- | --- | --- |
| Community tie-break | Equal points: lowest currently held Genesis Token ID wins; a holder beats a nonholder; tied nonholders are skipped for prizes, continuing down the points ranking. Ownership is read during winner determination. | Implemented and tested. |
| One-action voting | 22 HOF horses compete solely through community VP; 24 hours of secret voting; no external sporting results; voter must not return for reveal or points. | Cryptographic architecture documented; implementation blocked as explained below. |
| Scoring | Existing 25/18/15/12/10/8/6/4/2/1 formula, zero for positions 11–22; update Season and All-Time after immutable Race Reveal; no voter claims; no double settlement. | Requires verified, complete Race Reveal and settlement architecture. Legacy claim code is not presented as compliant. |
| Supply | Separate lifetime caps: 2,000 Public, 111 Community, 111 Team Reserve. Burns do not replenish mint capacity. Metadata reveal is separate from Race Reveal. | Implemented and tested. Legacy native-currency test mint removed because it bypassed these buckets. |
| Season gap | Maximum 7 * 86,400 seconds, anchored to Race #10's final Race Reveal, not administrative season finalization. | Policy resolved; production enforcement awaits immutable Race Reveal integration. |
| Chapter gap | Minimum 30 * 86,400 seconds after the final Race Reveal of the previous chapter: `chapterStart >= previousChapterEnd + 30 days`. Later starts are allowed; no maximum is introduced. | Approved amendment superseding the Master's earlier maximum; enforcement awaits chapter/Race Reveal integration. |
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

## Blocker: confidential voting without voter reveal

A Solidity contract cannot recover the preimage of the current commitment hash.
Making the salt/pick public at Vote, or giving an operator plaintext in advance,
would weaken secrecy. No such change has been made. The owner's explicit stop
condition for this cryptographic limitation is active for the voting replacement.
See `V7_SECRET_VOTING_ARCHITECTURE.md` for the recommended verifiable threshold
solution, its trust assumptions, and the implementation acceptance tests.

The existing race still permits individual reveals without a final immutable
result, and Community scores still require claims. These are known launch
blockers. Do not deploy this draft as a completed implementation of decisions
2/3/5/6. Recording an administrator-supplied timestamp or settling currently
revealed votes as final would hide, rather than solve, the blocker.

## Decisions still needing owner input

1. Approve a threshold-encryption trust model/provider and its liveness model;
   no single operator may decrypt early. The proposed architecture also requires
   an audited ciphertext-validity proof and an on-chain verifiable decryption
   path on the target chain. Provider approval alone does not validate code.
2. Select the implementation for how the complete leaderboard becomes immediately visible at Race
   Reveal at maximum participation: atomic proof-based publication is recommended;
   several partially applied score batches would not satisfy atomic visibility.

## Approved reveal failure policy — BLOCKER until implementation

If decryption/reveal cannot produce the complete and verifiable race result,
the race remains unfinalized. Neither Season nor All-Time may update for that
race. Partial results are never final, and no arbitrary administrator override
may invent a result. Recovery is retrying production of the same complete,
verifiable result; no timeout, forfeiture or fallback winner is authorized.

The required product flow is:
22 HOF Horses -> 24h secret voting -> voting closed -> complete Race Reveal ->
full 22-horse ranking -> automatic wallet scoring -> Season update -> All-Time
update. The voter performs one Vote action, with no revealVote or claimRacePoints.
No new cryptography is authorized yet. Existing legacy scoring is not an
implementation of this failure policy and remains a launch blocker.

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
- Community winner determination still runs on-chain over the participant set.
  Large-scale gas limits must be addressed before launch without changing the
  current-ownership tie rule. The new nonholder grouping is a linear pass, not
  an all-pairs comparison, but existing holder Token ID scans remain.
