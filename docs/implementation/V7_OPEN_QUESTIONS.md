# Horses of Fame — V7 implementation questions

This file is **not** a replacement for `docs/tokenomics/HOF_TOKENOMICS_V7_MASTER.md` and does not modify Tokenomics V7. It only records decisions that must not be invented during implementation.

## Resolved by owner clarification

- Same-pick VP top-up: after a wallet fixes its one secret pick, an eligible Genesis NFT acquired during the open voting window may add its unused VP to that same pick. It cannot change or split the pick, and a token already used in that race cannot be reused after transfer.
- Community season tie-break when only one tied wallet still owns a Genesis NFT: the wallet with no NFT loses the tie-break. If both tied wallets own NFTs, the lower-numbered NFT held at the time of the tie-break wins. This rule applies only when points are equal.

## Open implementation questions

1. **Community tie where both tied wallets own zero Genesis NFTs.** V7 says “LOWEST NUMBER WINS,” but neither wallet has an NFT number to compare. No fallback tie-break has been invented.
2. **Secret-vote reveal/finalization timing.** V7 fixes a 24-hour secret-voting window and says results become public after finalization, but it does not define a separate reveal deadline/finalization procedure. The current commit/reveal implementation allows reveal after voting closes. A final rule is needed before mainnet so a race cannot be permanently settled while valid reveals are still possible.
3. **Community points settlement.** The current contract lets a wallet claim its race points after reveal. V7 says each wallet earns one scoring result per race but does not state whether claiming is user-driven, operator-settled, or automatic. A mainnet rule is needed to guarantee standings are complete before season finalization.
4. **111 Community + 111 Team Reserve allocation versus delayed reveal/randomization.** V7 fixes the allocation counts but leaves the final reveal/randomization design open. The exact mint/distribution mechanics must be chosen without compromising the delayed fair reveal model.
5. **Maximum one-week break between seasons — timing anchor.** V7 requires the break between seasons to be no longer than one week, but it does not specify whether that week is measured from Race 10 opening, Race 10 voting close, race finalization, season finalization, or another event. The current code does not invent an anchor.
6. **Chapter-transition one-month maximum — timing anchor.** V7 requires no more than one month between HOF chapters but does not define the exact start/end events for that interval. This is not enforced in Chapter I code until the chapter-transition mechanism is defined.
7. **Community season with fewer than three scoring wallets.** V7 defines Community Top 3 rewards of 2,500 / 1,000 / 500 USDC but does not state how an unfilled 2nd or 3rd place is treated if fewer than three wallets score in a season. Season finalization intentionally has no invented minimum-participant rule; the current rewards contract therefore refuses a payout with an incomplete Top 3 rather than redirecting or reallocating money.
8. **Failed-sale refund after a Public Mint NFT is transferred.** V7 states that purchasers must be able to claim an on-chain refund of eligible mint payment if the 2,000 Public Mint NFTs do not sell by the deadline, but it does not define entitlement after a refundable NFT changes wallets. The current implementation requires the refund caller both to own the Public Mint NFT and to have sufficient original mint payment recorded in that same wallet. No rule has been invented for whether refund rights should instead stay with the original purchaser, follow the NFT, or require another treatment.

## V7 section 16 items still to finalize

- Exact identities/breeds and numbering of the 22 HOF race horses.
- Final mint deadline triggering refund condition.
- Final escrow/refund/treasury smart-contract architecture and non-custodial Prize Pool controls.
- Exact split of 111 Community NFTs among giveaways, collabs, partnerships and other approved uses.
- Operational terms for 111 Team Reserve secondary-sale window before Race 1.
- Independent audit provider, scope and payment mechanics for the $2,000 audit allocation.
- Final delayed-reveal/randomization design.
- Final season-end beneficiary mechanism for HOF race-horse prizes.
- Final creator-fee enforcement available on OpenSea/Robinhood Chain.
- Final legal terms, eligibility/geofencing, historical-personality/IP review and prize mechanics for target jurisdictions.

Implementation work should continue around these questions. None of them should be silently resolved in code.
