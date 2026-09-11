# Canonical Robinhood Testnet post-deployment validation

Run `npm run ops:v7:validate-deployment:testnet`. This now invokes
`scripts/validate-v7-canonical-deployment.cjs`, with a provider only, without
Hardhat, a signer, private keys, or any transaction submission. The old
`validate-v7-deployment.js` remains explicitly disabled for historical reference.
Do not deploy HOFCommunitySeason or HOFSeasonLeaderboard to satisfy old tooling.

The six deployment addresses and owner/admission/relayer defaults are the public
addresses supplied by the operator. Team and Audit defaults use the previously
approved public roles. The Prize Pool target is HOFSeasonRewards, not an EOA.
`communitySeason()` on Rewards must resolve to HOFTrustedLeaderboards; the getter
name does not imply deployment of the legacy season contract.

## Mac (read-only)

From the current checkout, with dependencies already installed:

```sh
npm run compile:contracts
npm run check:deploy-scripts
export HOF_RPC_URL='https://rpc.testnet.chain.robinhood.com'
export HOF_TOKEN_MODE='testnetMockUSDC'
# Fill from the approved deployment record, never a guessed address or timestamp:
export PROJECT_WALLET='<ACTUAL_APPROVED_PROJECT_ADDRESS>'
export HOF_DEPLOYMENT_ANCHOR_BLOCK='<BLOCK_USED_TO_CALCULATE_MINT_DEADLINE>'
npm run ops:v7:validate-deployment:testnet
```

The two angle-bracket values are required operator inputs and will fail closed
until replaced. No private key is required. Do not start deployment or service
workers while running this initial-state validation. Configured public frontend
addresses are cross-checked, and legacy frontend season/leaderboard/voting fields
must be empty. Unloaded files or external hosting/service environment settings
cannot be inspected by this process; validate those separately.

`HOF_DEPLOYMENT_ANCHOR_BLOCK` is the latest block captured by the canonical deploy
script before system deployment, not the Sale receipt block or today's block.
The validator requires `deadline = anchor.timestamp + 604800`, checks that Sale
did not yet exist at that anchor, and requires the window still to be open.
Historical `eth_getCode` support is needed. An unavailable historical block is
NO-GO, not an assumed successful check. An expired window is reported without
changing it. If the original anchor was not recorded, recover and verify it from
deployment history before declaring GO.

All contract reads are pinned to one block, whose hash is checked again at the
end. Runtime code must match current compiled artifacts, except compiler-listed
immutable slots; expected immutable values are checked through contract getters.
Artifacts are checked against current Solidity sources and compiler settings.
HOFCanonicalRaceFactory embeds creation code for HOFRelayedRace (no proxy or
`implementation()` getter). Its canonical runtime, roles, board association,
CREATE provenance from the board, initial creation nonce and empty provenance
are checked. No Race is created by validation.

Initial state requires zero lifetime mints, no burn history, no races, no season
settlement, no payouts/rollover, unrevealed metadata, unpaused mint, and correct
supply, price and rewards constants. After legitimate mint/race activity this
initial-state validator intentionally returns NO-GO. Do not reset or redeploy
contracts merely to obtain a green initial-state report.

Owner, admission and relayer balances are read; positive balance alone is not a
gas-budget guarantee. Admission service health, secret storage, relayer wallet
configuration, decryption key availability and automatic Race Reveal must be
validated separately. Owner-trusted encryption remains the accepted testnet model.

## Work environment result

RPC probe returned HTTP 502 / connection refused. Running the new operational
command returned NO-GO. No live contract mismatch or live success can therefore
be asserted. Run the Mac command above to obtain the actual on-chain report.

## Local regression evidence

- Solidity compile: 60 files, PASS.
- Deployment-script syntax checks: PASS.
- Contracts/backend regression: 299 PASS (includes 9 new validator cases and
  2,200-voter stress coverage). Command: `npx hardhat test --no-compile test/*.js
  --grep '^(?!.*V7 sponsored full-season benchmark)'`. The four long economic
  full-season benchmark variants were not rerun for this operational change.
- Frontend: 107 PASS.
- Canonical local readiness dry-run: 3 PASS.
- Simulated mainnet MockUSDC rejection: 1 PASS.
- Total: 410 distinct passing tests/scenarios, without double-counting the
  separate targeted validator run.
- Local dry-run HTTP fixture was corrected to resolve the image URL from current
  canonical metadata; it previously only intercepted the old relative logo URL.
  No asset, metadata, Solidity or protocol changes.

All live RPC checks remain unverified in Work. No commit or remote operation was
performed as part of this report.
