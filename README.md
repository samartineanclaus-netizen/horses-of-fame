# Horses of Fame — Chapter I V7 implementation

## Integration review (not deployed)

`work/v7-hof-integration` combines the canonical frontend with the approved V7
protocol and the previously local owner-trusted implementation. See
`docs/implementation/V7_INTEGRATION_REVIEW.md` and `V7_ADMISSION_API.md` in the
same directory before configuring services. The older deployment scripts below
remain legacy regression/operator references; they do not deploy or wire the new
trusted path. No deployment, main merge, commit or push is authorized by this review.

Next.js 16 App Router website plus Solidity contracts and Robinhood Chain Testnet operations for Horses of Fame Chapter I — Genesis.

## Source of truth

Implementation work on this branch is based on:

`docs/tokenomics/HOF_TOKENOMICS_V7_MASTER.md`

Do not silently add or reinterpret rules that V7 leaves open. Unresolved implementation decisions are tracked separately in:

`docs/implementation/V7_OPEN_QUESTIONS.md`

## Current Chapter I implementation

The repository currently includes:

- Genesis ERC-721 supply and locked rarity/VP structure.
- Regression invariants for 22 HOF + 2,200 voting = 2,222 Genesis and exactly 4,800 nominal VP.
- 2,000 Public Mint allocation plus 111 Community and 111 Team Reserve allocation caps.
- 30 USDC Public Mint sale, failed-sale refunds and sell-out accounting.
- 48,000 / 2,000 / 10,000 USDC proceeds split after successful sell-out.
- Team Reserve wallet voting restriction and restoration of normal VP after transfer.
- One-wallet / one-secret-pick race voting with 24-hour voting windows.
- Same-pick VP top-up for eligible unused NFTs acquired during voting.
- No reuse of a voting NFT in the same race after transfer.
- Deterministic 22-horse ranking and locked 25/18/15/12/10/8/6/4/2/1 scoring.
- Community and HOF season leaderboards, Season History and All-Time standings.
- Six seasons × ten races and three-day race cadence inside each season.
- Community Top 3 reward accounting and payout tooling.
- HOF prize allocation reserved without inventing the still-open beneficiary mechanism.
- Testnet deployment, race registration, season finalization, status, validation and readiness scripts.
- Website routes for mint, refund, race, wallet, standings, rewards, history, allocation and system status flows.
- A `/race/backup` safety route that can export or restore the local secret-pick data only after verifying it against the connected wallet's existing on-chain commitment.

## Local verification

```bash
npm install
npm run compile:contracts
npm run check:deploy-scripts
npm run test:contracts
npm run lint
npm run build
```

Run the website locally with:

```bash
npm run dev
```

## Robinhood Chain Testnet

Copy the deployment template locally and fill only explicit testnet parameters:

```bash
cp .env.v7-deploy.example .env
```

Never commit private keys.

Detailed deployment and operations instructions are in:

`docs/implementation/V7_TESTNET_RUNBOOK.md`

Useful commands include:

```bash
npm run deploy:v7:testnet
npm run ops:v7:validate-deployment:testnet
npm run ops:v7:status:testnet
npm run ops:v7:launch-readiness:testnet
npm run deploy:v7:race:testnet
npm run ops:v7:register-race:testnet
npm run ops:v7:finalize-season:testnet
npm run ops:v7:pay-community-season:testnet
```

## Locked Chapter I figures

- 2,222 Genesis NFTs.
- 22 Hall of Fame race horses at 0 VP.
- 2,200 voting Genesis NFTs.
- 4,800 total Voting Power.
- 2,000 Public Mint NFTs at 30 USDC.
- 111 Community Allocation NFTs.
- 111 Team Reserve NFTs.
- 6 seasons / 60 races.
- 48,000 USDC Chapter I Prize Pool.

Items still marked unresolved in V7 are intentionally not converted into mainnet policy by this repository.
