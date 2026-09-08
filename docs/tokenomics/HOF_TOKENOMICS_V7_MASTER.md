# HORSES OF FAME — Tokenomics & Racing Model V7

**MASTER — 8 September 2026**

V7 preserves the V6 racing, scoring, season and Voting Power rules except where explicitly revised below.

## 1. Core model

Horses of Fame is an 8,888-NFT ecosystem structured across four chapters of 2,222 NFTs each. Chapter 1 is the Genesis Collection and contains exactly **2,222 Genesis NFTs: 22 Hall of Fame Genesis race horses with 0 Voting Power + 2,200 voting Genesis NFTs** representing historical/public figures.

In V7, the 22 Hall of Fame horses are based on **22 different horse breeds**, rather than celebrity identities. The 2,200 voting Genesis NFTs determine race results through Voting Power.

- Genesis / Chapter 1 supply: **2,222**
- Hall of Fame race horses: **22, 0 VP**
- Voting Genesis NFTs: **2,200**
- Public Mint: **2,000 NFTs**
- Community Allocation: **111 NFTs**
- Team Reserve: **111 NFTs**
- Public mint price: **$30**
- Primary mint: Horses of Fame website / project-controlled mint contract on Robinhood Chain
- Secondary market: OpenSea targeted for secondary trading
- Race / activation fees: **$0**
- Paid betting / tickets: **none in V1**

## 2. Genesis Collection & Four-Chapter Ecosystem

The HOF ecosystem has a fixed total supply of 8,888 NFTs, released across four chapters of 2,222 NFTs each. Only Chapter 1 carries Genesis status. Chapters 2–4 are non-Genesis collections. Genesis status and applicable holder privileges transfer with the NFT.

Chapter 1 contains 22 Hall of Fame Genesis race horses with 0 VP and 2,200 voting Genesis NFTs. The Hall of Fame horses compete; the 2,200 eligible voting NFTs vote for them. **This 22 + 2,200 architecture is unchanged from V6.**

## 3. Chapter 1 supply allocation

| Allocation | NFTs | Approx. share | Voting treatment |
|---|---:|---:|---|
| Public Mint | 2,000 | 90.01% | Voting NFTs: normal VP by rarity; HOF NFTs: 0 VP |
| Community Allocation | 111 | 5.00% | Voting NFTs: normal VP by rarity after distribution; HOF NFTs: 0 VP |
| Team Reserve | 111 | 5.00% | Wallet cannot vote; after transfer, voting NFTs regain normal VP; HOF NFTs remain 0 VP |
| **TOTAL** | **2,222** | **100%** | — |

The 111 Community Allocation NFTs may be used for giveaways, collaborations, partnerships, promotional campaigns, contributor rewards and other community-building distributions. The exact split among these uses is not fixed in V7.

The 111 Team Reserve NFTs retain their original token type, rarity and Voting Power rules. The restriction applies to the **designated Team Reserve Wallet**, not permanently to token IDs. A voting NFT held there cannot vote. After transfer or sale to an independent holder, it becomes fully voting-eligible with the standard VP of its rarity. Any Hall of Fame NFT remains 0 VP.

## 4. Primary sale, escrow, refund & revenue allocation

The public sale consists of **2,000 NFTs × $30 = $60,000 maximum primary-sale revenue**. The 222 allocated NFTs (111 Community + 111 Team Reserve) are not part of the paid public mint.

| Bucket | Amount | Share of $60,000 |
|---|---:|---:|
| Prize Pool | **$48,000** | **80.00%** |
| Independent smart-contract security audit | **$2,000** | **3.33%** |
| Founder / Project Allocation | **$10,000** | **16.67%** |
| **TOTAL** | **$60,000** | **100%** |

The **$10,000 Founder / Project Allocation is the founder/project allocation and is payable to the designated founder/project wallet after a successful public sell-out.** It is not restricted solely to programmer or software-development expenses.

Primary-sale funds are intended to be handled through an on-chain escrow/treasury architecture rather than a founder-controlled prize wallet. Until the public mint satisfies the success condition, collected mint funds remain subject to the refund mechanism.

**Success condition:** all 2,000 Public Mint NFTs must sell by the final mint deadline. If the deadline expires without full public sell-out, purchasers must be able to claim an **on-chain refund** of their eligible mint payment. The exact deadline is a launch parameter to be fixed before mainnet.

The V7 implementation target uses a configurable ERC-20 payment token (intended to be the final verified USDC/stablecoin deployment on Robinhood Chain). The payment-token address is a deployment parameter and must not be assumed or hard-coded before final mainnet verification.

After successful public sell-out, $48,000 is committed to the six-season prize program, up to $2,000 is allocated for an independent smart-contract security audit, and $10,000 is allocated to the Founder / Project wallet.

## 5. Prize Pool custody

The **$48,000 Prize Pool must not be held in a wallet whose private key is controlled by the founder**. The target architecture is a non-custodial or otherwise independently controlled treasury/rewards mechanism with transparent on-chain payout rules. The founder must not have discretionary unilateral access to withdraw the Prize Pool.

## 6. Flagship HOF race

- 22 Hall of Fame competitors, each representing a different horse breed.
- The 22 HOF race horses remain **hidden among the 2,222 Genesis NFTs until reveal**.
- Genesis holders vote for one of the 22 race horses.
- **1 wallet = 1 secret pick per race.**
- All eligible Genesis NFTs in a wallet combine their VP behind one race horse. VP cannot be split.
- Voting window: exactly **24 hours**.
- Submitted pick is final.
- Votes and live VP totals remain hidden until voting closes.
- Ranking is determined by total VP received.
- Tie: lower HOF competitor number ranks higher.
- **No RNG determines race result. Community vote determines the complete ranking.**

## 7. Points & season

Exactly **10 races per season**, one race every 3 days. Each race has a 24-hour secret-voting window.

Scoring for positions 1–10: **25 / 18 / 15 / 12 / 10 / 8 / 6 / 4 / 2 / 1**. Positions 11–22 receive 0.

Two leaderboards run in parallel: Community/Holder Leaderboard and Hall of Fame Horse Leaderboard. Each wallet earns only one scoring result per race regardless of NFT quantity. NFT quantity and rarity affect VP, not the number of Community scoring entries.

Community points remain with the wallet that earned them and do not transfer with NFTs. Separate wallets maintain separate scores.

Tie-break principle: **LOWEST NUMBER WINS. No random draw.**

## 8. Season rewards

Community Top 3 at season end: **2,500 / 1,000 / 500 USDC**.

HOF side Top 3: second **2,500 / 1,000 / 500 USDC** prize set under the final beneficiary/ownership mechanism implemented for the 22 race competitors.

Each season distributes **$8,000 USDC**. Chapter 1: **6 seasons × 10 races = 60 races = $48,000 total season-end rewards**.

## 9. Launch, reveal & Team Reserve sale cadence

**Public Mint (2,000) → Sold Out → Team Reserve secondary distribution (111) → First Race.**

- Public Mint: 2,000 NFTs at $30 through HOF website.
- 111 Community NFTs distributed separately from paid mint.
- 111 Team Reserve NFTs held in designated Team Reserve Wallet and cannot vote while held there.
- **After the 2,000 Public Mint NFTs sell out and before the first race, the 111 Team Reserve NFTs are placed into secondary-market distribution/sale.**
- Once transferred, voting NFTs have their normal rarity-based VP; HOF NFTs remain 0 VP.
- Delayed reveal remains target model with fair randomization/distribution after successful sell-out.
- First race targeted within 10 days after sell-out, subject to audit, Team Reserve distribution window and final technical checks.
- Break between seasons: no longer than 1 week.
- Transition between HOF chapters: no longer than 1 month.

## 10. Secondary-market economy

OpenSea is targeted as the secondary marketplace. Genesis NFTs are freely transferable after reveal with no mandatory reactivation, lock or staking requirement. Project continues to target a **5% creator fee** on secondary sales, subject to final enforceable marketplace/contract implementation.

## 11. Rarity Voting Power — LOCKED

| Rarity | Voting Power | Role |
|---|---:|---|
| Common | 1 VP | Votes |
| Uncommon | 2 VP | Votes |
| Rare | 3 VP | Votes |
| Epic | 4 VP | Votes |
| Legendary | 5 VP | Votes |
| Hall of Fame | 0 VP | Competes in flagship race |

**THE RARER YOUR HORSE, THE STRONGER YOUR VOTE.**

## 12. Locked rarity distribution & VP balance — UNCHANGED FROM V6

Exactly **2,200 Genesis NFTs carry Voting Power**. The 22 Hall of Fame Genesis race horses carry 0 VP and are excluded from voting-rarity distribution.

| Tier | Supply | VP/NFT | Total VP | Share |
|---|---:|---:|---:|---:|
| Common | **970** | 1 | 970 | 20.21% |
| Uncommon | **480** | 2 | 960 | 20.00% |
| Rare | **320** | 3 | 960 | 20.00% |
| Epic | **240** | 4 | 960 | 20.00% |
| Legendary | **190** | 5 | 950 | 19.79% |
| **TOTAL** | **2,200** | — | **4,800 VP** | **100%** |

**No rarity recalibration is required.**

## 13. Wallet voting, transfers & race integrity

- One wallet = one secret pick per race.
- All eligible Genesis NFTs combine VP behind one HOF race horse.
- One Genesis NFT can contribute VP only once in the same race.
- Transfer after use cannot permit reuse until next race.
- NFT acquired during voting may contribute only if not already used that race.
- Once wallet finalizes its pick, committed pick and VP are final.
- **Designated Team Reserve Wallet is voting-ineligible. This is wallet-level, not permanent token-level loss of VP.**
- Live totals and wallet choices remain hidden during voting; results become public after finalization.

## 14. Season resets, history & Chapter I titles

- 10 races = one season.
- Chapter I = 6 seasons / 60 races.
- After Race 10, final standings validated and $8,000 season rewards paid.
- Season scores reset while completed results remain in Season History.
- Separate All-Time Community and HOF standings accumulate across all six seasons.
- All-Time standings carry prestige only; no additional Chapter I cash reward.
- HOF All-Time #1: **CHAPTER I — GENESIS GRAND CHAMPION**.
- Community All-Time #1: **CHAPTER I — GENESIS COMMUNITY CHAMPION**.

## 15. V7 locked principles

1. 8,888 total HOF ecosystem NFTs across four chapters; Chapter 1 = 2,222 Genesis.
2. Chapter 1 remains **22 HOF at 0 VP + 2,200 voting Genesis NFTs**.
3. V6 rarity distribution and **4,800 total VP remain unchanged**.
4. Allocation: **2,000 Public + 111 Community + 111 Team Reserve**.
5. Public mint: **$30**, maximum primary revenue **$60,000**.
6. Revenue at sell-out: **$48,000 Prize Pool + $2,000 independent audit + $10,000 Founder / Project Allocation**.
7. Primary mint on HOF website; OpenSea targeted for secondary.
8. On-chain refund if 2,000 Public Mint NFTs do not fully sell by final deadline.
9. Prize Pool not under unilateral founder-key control.
10. 22 HOF horses represent 22 different breeds, remain hidden among the 2,222 Genesis NFTs until reveal, and have 0 VP.
11. Voting Genesis characters follow internal rule: historical/public figures deceased for at least 100 years.
12. Team Reserve Wallet cannot vote; sold/transferred voting NFTs immediately regain normal eligibility.
13. Team Reserve secondary distribution occurs after Public Mint sell-out and before Race 1.
14. No activation fee, race-entry fee, paid spectator tickets or per-race betting in V1.
15. 1 wallet = 1 secret pick; eligible VP combines behind that pick.
16. Community VP determines complete ranking; no RNG.
17. F1 scoring remains 25/18/15/12/10/8/6/4/2/1.
18. Six seasons × 10 races = 60 races; $8,000/season = **$48,000 Prize Pool**.
19. No $HOF fungible token in V1.

## 16. Items still to finalize

- Exact identities/breeds and numbering of the 22 HOF race horses.
- Final mint deadline value triggering refund condition (implemented as a deployment parameter).
- Final verified mainnet payment-token/USDC contract address.
- Final non-custodial Prize Pool treasury controls and address.
- Exact split of 111 Community NFTs among giveaways, collabs, partnerships and other approved uses.
- Operational terms for 111 Team Reserve secondary-sale window before Race 1.
- Independent audit provider, scope and payment mechanics for $2,000 audit allocation.
- Final delayed-reveal/randomization design.
- Final season-end beneficiary mechanism for HOF race-horse prizes under breed-based model.
- Final creator-fee enforcement available on OpenSea/Robinhood Chain.
- Final legal terms, eligibility/geofencing, historical-personality/IP review and prize mechanics for target jurisdictions.

## 17. Product loop

**OWN → CONNECT WALLET → ONE SECRET PICK → COMMUNITY RACE → EARN POINTS → CLIMB THE SEASON → WIN**

**22 BREEDS RACE. 2,200 GENESIS NFTs POWER THE VOTE.**
