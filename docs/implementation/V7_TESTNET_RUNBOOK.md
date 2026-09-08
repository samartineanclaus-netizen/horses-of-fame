# Horses of Fame — V7 Robinhood Chain Testnet Runbook

This runbook operates the implementation that follows `docs/tokenomics/HOF_TOKENOMICS_V7_MASTER.md`. It does not replace or amend V7.

## 1. Local setup

```bash
npm install
cp .env.v7-deploy.example .env
```

Fill only the required testnet values in `.env`. Never commit `DEPLOYER_PRIVATE_KEY`.

Before any transaction:

```bash
npm run compile:contracts
npm run test:contracts
npm run build
```

## 2. Deploy the V7 Chapter I system

Required explicit parameters include the testnet USDC address, Team Reserve wallet, audit wallet, project wallet, future mint deadline, placeholder URI and Prize Pool destination.

```bash
npm run deploy:v7:testnet
```

The sale contract requires a 6-decimal payment token, matching the V7 30 USDC accounting. The script refuses non-Robinhood-Testnet deployment and does not choose any unresolved V7 parameter. It prints the deployed addresses and the public website environment values.

The Genesis contract locks the Chapter I allocation counts at contract level:

- 2,000 Public Mint
- 111 Community Allocation
- 111 Team Reserve

Public paid minting is isolated behind the sale contract. Non-public allocation mints are capped separately at 111 Community and 111 Team Reserve. Do **not** use this step to invent the exact Community-use split, Team Reserve sale terms, HOF numbering or delayed-reveal/randomization mechanics. Those remain open in V7.

## 3. Configure the website

Copy only public contract addresses into the website environment:

```text
NEXT_PUBLIC_HOF_GENESIS_CONTRACT=
NEXT_PUBLIC_HOF_GENESIS_SALE_CONTRACT=
NEXT_PUBLIC_HOF_USDC_CONTRACT=
NEXT_PUBLIC_HOF_COMMUNITY_SEASON_CONTRACT=
NEXT_PUBLIC_HOF_LEADERBOARD_CONTRACT=
NEXT_PUBLIC_HOF_SEASON_REWARDS_CONTRACT=
NEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT=
```

Never place private keys in `NEXT_PUBLIC_*` variables.

The isolated testnet routes are:

- `/mint` — V7 30 USDC public mint, live sale state and failed-sale on-chain refund flow.
- `/race` — secret pick, wallet NFT/VP discovery, same-pick VP top-up, reveal and current Community point claim flow.
- `/standings` — current-season and All-Time HOF standings, Community All-Time standings, finalized Community podiums and connected-wallet Community points.
- `/rewards` — read-only Chapter I reward accounting, Community payout history and HOF reserved allocation.

Community All-Time is loaded on demand from the persistent Chapter I wallet registry. Equal points use the approved casting tie-break: a tied wallet with no Genesis NFT loses to a tied wallet that still holds one; if both hold NFTs, the lower-numbered held NFT wins. If equal-point wallets all hold zero Genesis NFTs, the page marks that tie as unresolved instead of inventing a fallback.

The rewards page deliberately does **not** expose an HOF payout action. V7 still leaves the final HOF season-end beneficiary/ownership mechanism to finalize.

## 4. Validate and read current system state

After deployment addresses are placed in `.env`, first validate the locked V7 constants and cross-contract references:

```bash
npm run ops:v7:validate-deployment:testnet
```

This is read-only. It verifies the deployed Genesis supply/rarity constants, the separate 111 Community + 111 Team Reserve caps, 2,000 × 30 USDC Public Mint, 6-decimal payment-token accounting, 48k/2k/10k sale split, 10-race/6-season/3-day leaderboard constants, 48k reward accounting and the Genesis/Sale/Community/Rewards contract references. It does not validate or invent any item that V7 still leaves open.

Then read the live operational state:

```bash
npm run ops:v7:status:testnet
```

This command is also read-only. It reports Genesis supply/reveal state, Community/Team allocation counters, public-sale progress/refund state, payment-token decimals, current Community/HOF seasons and Prize Pool accounting.

## 5. Public Mint success and proceeds distribution

The public sale succeeds only at exactly **2,000 Public Mint NFTs sold**. Until then, collected USDC remains inside the sale escrow and is subject to the V7 failed-sale refund condition.

After confirmed sell-out, set:

```text
GENESIS_SALE_ADDRESS=
```

Then run:

```bash
npm run ops:v7:distribute-proceeds:testnet
```

The operation refuses to run before sell-out and reads the immutable destination addresses from the deployed sale contract. It then executes the locked V7 split exactly once:

- **48,000 USDC** → configured Prize Pool destination
- **2,000 USDC** → configured independent-audit destination
- **10,000 USDC** → configured development/project destination

The operation does not decide the unresolved final Prize Pool custody architecture, audit provider or wallet identities; those values must already have been explicitly supplied at deployment.

## 6. Deploy one race

Set:

```text
GENESIS_ADDRESS=
TEAM_RESERVE_WALLET=
RACE_OPENS_AT_UNIX=
```

Then:

```bash
npm run deploy:v7:race:testnet
```

The race contract fixes the V7 24-hour voting window. For races 2–10 of a season, the leaderboard contracts enforce opening exactly three days after the previous race opening.

Copy the printed race address into:

```text
NEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT=
RACE_ADDRESS=
```

## 7. Voting lifecycle

During the 24-hour voting window:

1. Wallet fixes one secret pick.
2. Eligible NFT VP supplied by that wallet backs the same pick.
3. If the wallet acquires another unused eligible Genesis NFT during voting, it may add that NFT's VP to the same pick.
4. A token already used in that race cannot be reused after transfer.
5. Team Reserve Wallet cannot vote.

After the voting window closes, use the current reveal flow. The final reveal/finalization timing rule is still listed in `V7_OPEN_QUESTIONS.md`; do not invent a mainnet rule around it.

## 8. Register a closed race

Set the race and both leaderboard addresses, then run:

```bash
npm run ops:v7:register-race:testnet
```

The operation validates the chain, race closure, current season alignment and registration state before writing to both Community and HOF leaderboards.

## 9. Community race points

The current contract exposes one Community scoring claim per wallet per registered race. The `/race` page exposes that existing function after reveal and race registration.

The long-term settlement model (user claim vs operator/automatic settlement) remains an open implementation question and must be finalized before mainnet.

## 10. Finalize a season

After both leaderboards contain exactly 10 races:

```bash
npm run ops:v7:finalize-season:testnet
```

This archives Season History, updates All-Time points, resets season scores and advances both leaderboards together.

## 11. Pay the Community season rewards

After Community Top 3 is finalized and the rewards contract is funded, set:

```text
SEASON_REWARDS_ADDRESS=
SEASON_NUMBER=1
```

Then run:

```bash
npm run ops:v7:pay-community-season:testnet
```

The operation pays exactly **2,500 / 1,000 / 500 USDC** to the archived Community Top 3, exactly once for that season. The `/rewards` page can be used to verify the on-chain payment history and remaining Community/HOF accounting.

It does not expose or execute the HOF-side payout, because V7 leaves that beneficiary mechanism to finalize.

## 12. Resolve the Chapter I champions

After all six Community seasons are finalized, set:

```text
COMMUNITY_SEASON_ADDRESS=
GENESIS_ADDRESS=
```

Then run the read-only Community resolver:

```bash
npm run ops:v7:community-champion:testnet
```

The resolver follows the already approved V7/owner logic without creating a new rule:

- a unique All-Time points leader is the **CHAPTER I — GENESIS COMMUNITY CHAMPION**;
- if top points are tied, a tied wallet with no Genesis NFT loses to a tied wallet that holds one;
- if multiple tied wallets hold Genesis NFTs, the lower-numbered held NFT wins;
- if every top-point tied wallet holds zero Genesis NFTs, the resolver stops with an unresolved-V7 error and points to `V7_OPEN_QUESTIONS.md`.

For the HOF side, set:

```text
HOF_LEADERBOARD_ADDRESS=
```

Then run:

```bash
npm run ops:v7:hof-champion:testnet
```

This read-only operation returns the **CHAPTER I — GENESIS GRAND CHAMPION** only after all six seasons are complete. Equal HOF All-Time points use the locked V7 lower-competitor-number tie-break.

## 13. Repeat for Chapter I

Chapter I remains:

- 6 seasons
- 10 races per season
- 60 races total
- 3-day race cadence within each season
- 24-hour secret-voting window per race

Anything listed in `V7_OPEN_QUESTIONS.md` stays unimplemented until explicitly decided.
