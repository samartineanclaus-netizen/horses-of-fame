# Horses of Fame — V7 mint-escrow review draft

Based on `v7-mint-escrow` commit `a831b89` in the local branch
`work/v7-final-decisions`. Local commit is authorized. Push, main merge and mainnet deployment are not authorized.

## Rules and implementation status

Read `docs/tokenomics/HOF_TOKENOMICS_V7_MASTER.md` together with the owner's
explicit decision addendum in `docs/implementation/V7_OPEN_QUESTIONS.md`.
The original Master is preserved; its integrity regression still applies.

Implemented in this draft:

- Separate lifetime Public (2,000), Community (111) and Team Reserve (111) mint
  caps. `ownerMint` to the configured Team wallet uses the Team bucket; other
  recipients use Community. Configure the Team wallet before minting its reserve.
  Paid public mint is only through the configured sale; the legacy ETH test mint
  was removed because it could consume supply outside those buckets.
- Failed-sale refunds follow each Public Mint NFT to its current holder. A valid
  refund burns it and pays 30 USDC atomically. `paidBy` remains historical gross
  mint payments, not refund eligibility. `refundedTo` and `totalRefunded` report
  actual refunds separately. Burned capacity is never reissued.
- Equal-score wallets without NFTs are skipped when tied with another nonholder.
  Holder comparisons use current lowest Token ID; unequal scores keep the prior
  points rules. Skipping a prize does not delete points or history.
- Missing Community prizes remain in the rewards treasury. Read
  `communitySeasonRollover(season)` and `communityRolloverToChapter2()` separately
  from `communityPaid()`. `communityRemaining()` now means the unprocessed Chapter I
  Community allocation, excluding both payouts and booked rollover.
  Duplicate recipients/seasons are rejected. No Team/Project/rollover withdrawal
  function was added. Allocation constants and HOF reservation are unchanged.

Approved documented timing: the next chapter starts **at least 30 days** after
its predecessor's final Race Reveal, with no additional maximum. Rollover remains
earmarked for Prize Pool/Community rewards, with no discretionary Team/Project
transfer. Incomplete/invalid reveal must leave the race unfinalized and both
leaderboards unchanged; this is an acceptance requirement of the blocked design.

Not completed: one-action encrypted voting, immutable Race Reveal, automatic
points publication, and gap enforcement attached to that result. The current
commit/reveal and claim code is legacy, not compliant with the newly requested
one-action UX. Read `docs/implementation/V7_SECRET_VOTING_ARCHITECTURE.md` before
attempting a replacement. No external sporting results or outcome RNG are used.

## Local validation

```sh
npm install
npm run compile
npm test
```

This branch has no Next.js source, build script or website tests. Those exist on
other branches; they were not imported into this review draft. App integration
must later account for changed refund-ledger semantics, rollover reads and removal
of the legacy test-mint ABI. Existing immutable deployments do not change when
these source files are edited. This is not a mainnet-ready release.
