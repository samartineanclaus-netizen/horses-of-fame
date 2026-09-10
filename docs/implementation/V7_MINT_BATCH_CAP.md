# V7 mint batch cap — local checkpoint

Base: `d91d6921e2d1c6f61bf8f9999750d2d560ff5eed`.
Branch: `work/v7-mint-gas-optimization`.

## Approved change

`MAX_MINT_PER_TX = 25` is enforced by `HOFGenesisSale.mint`,
`GenesisHorses.saleMint`, and `GenesisHorses.ownerMint`. The cap is on each mint
call's quantity; applications must not aggregate multiple calls into a larger
wallet multicall and assume the same gas bound. No ERC721A, bitmap, enumeration,
ownershipRevision, or economic redesign is included.

Public supply 2,000; Community 111; Team 111; total lifetime supply 2,222;
Public price 30 USDC; Token IDs, metadata reveal, Team transfer gate, refund
ownership/burn and all voting/Community rules are unchanged. Constants add no
storage slots. All pre-existing supply checks remain active.

Community and Team allocations each use 25 + 25 + 25 + 25 + 11, with the same
recipient and bucket classification on every call. An operator must verify
`teamWallet` and the recipient before each allocation. The existing allocations
page is read-only; no new administrator wallet UI or deployment was added.

## Public purchase sequence

The website explicitly submits a USDC approval when required, then separate
mint transactions of at most 25. Example: 100 NFT = approval for 3,000 USDC +
four mint transactions. Confirmed batches cannot be rolled back by a later
failure. There is no off-chain supply reservation.

Before each batch, the browser verifies account/network, reads supply, deadline,
USDC balance and allowance at one block, and estimates the actual call's gas.
It uses a 20% gas-limit margin, rounded up, and stops if the padded estimate
exceeds the 5M operational budget. This budget is not an economic rule or a
universal guarantee for contract recipients. State can change after preflight;
on-chain validation is authoritative and reverts atomically.

If supply, time, balance or allowance becomes insufficient, the sequence stops
and displays confirmed NFT count and the unpurchased remainder. It never silently
changes the requested order or submits the next transaction before a receipt.

A local browser journal is scoped to chain, sale and buyer. It records an intent
before requesting broadcast and persists the returned transaction hash. Retrying
first reconciles that hash; a timeout does not cause resubmission. If broadcasting
may have succeeded but no hash was returned, retries are blocked pending manual
wallet activity/nonce reconciliation. Explicit wallet rejection or a known
pre-broadcast failure can be retried. No automatic nonce replacement is provided.

A successful mint receipt must contain the configured Sale's matching `Minted`
event for buyer, quantity and paid amount. A successful cancellation/replacement
without that event cannot increase the UI's purchased count. Approval completion
is followed by actual allowance checks. Pending status is never counted as minted.

The journal is local convenience, not chain authority or cross-device recovery.
Do not delete it while transactions are unresolved. Independent browser tabs or
devices should not operate the same purchase concurrently; operational recovery
must reconcile wallet transactions if browser state is lost.

## Local gas measurements

Solidity 0.8.25, optimizer 200, existing local Hardhat EVM and MockUSDC; EOA
recipients, finite USDC allowance. Approval excluded from Public mint gas.

| Path, quantity 25 | First batch gas | Subsequent batch gas |
| --- | ---: | ---: |
| Public | 3,621,422 | 3,541,522 |
| Community | 3,000,966 | 2,955,266 |
| Team | 3,000,979 | 2,955,279 |

These are measured scenarios, not gas upper bounds for arbitrary callbacks or
Robinhood production USDC. Original mint(100): 13,956,493 in the historical
allocation-first scenario; 13,967,993 for a fresh collection and buyer.
The new contract rejects that quantity. This is an operational batching fix,
not a claim of lower cumulative mint gas.

## Regression and evidence

Existing fixture calls above 25 are split through a test-only helper, without
changing recipient, quantity, Token IDs, assertions or voting batch sizes.
The Sponsored Voting benchmark still runs all four cases (5/10/20/25), each with
10 races x 2,200 voters and 4,800 VP per race. Its initial mint now uses 90
transactions (80 Public, 5 Community, 5 Team), previously 22. New outputs use
`benchmarks/mint-cap-sponsored-batch-*.json`; historical outputs remain intact.
Gas changes in voting reports are not advertised as a Voting optimization:
contract addresses, nonces and signature/ciphertext bytes vary between runs.

New tests cover 25/26, 4x25 Public, isolated allocations, competing sell-out,
deadline crossing, USDC/allowance failure, callback rollback and reentrancy,
current-owner refunds, burns, Team transfer lock, reveal, per-path gas, frontend
progress, partial failure, pending recovery and cancellation receipts.

## Remaining launch gates

- Target-chain measurements with actual approved USDC and supported wallets.
- Audit and explicit authorization for any deployment. Existing contracts are
  not upgradeable and their configured sale address cannot be replaced.
- Manual recovery for ambiguous broadcasts, browser storage loss and cross-device
  activity; no blind retry or automatic transaction replacement.
- Smart-contract callback gas and aggregate wallet multicalls require their own
  estimation. The cap limits NFT quantity per call, not arbitrary external code.
- Existing Community cumulative settlement cost/transfer-griefing and Sponsored
  Voting backend/admission/relayer operational gates remain unchanged.

No V7 Master, canonical horse dataset, portrait, Sponsored Voting implementation
or Community contract is changed by this checkpoint. No public network action.

## Completed verification

299 passing checks: 232 existing contract/worker tests, 11 new mint contract
tests, four complete Sponsored Voting season benchmarks and 52 frontend tests.
Compile, typecheck and production build passed. Lint: zero errors, eight
pre-existing warnings (set-state-in-effect in allocations/history/mint/refund
and Voting, two homepage no-img-element warnings, Voting cleanup ref warning).
Raw output: `benchmarks/mint-cap-verification.txt`. Preservation SHA-256 checks
for 29 files, including Master, canonical dataset and all 22 portraits, are in
`benchmarks/mint-cap-preserved.json`.

The full-season benchmarks all passed (29 minutes total):

| Voting batch | Season gas | Season transactions | Initial mint transactions |
| --- | ---: | ---: | ---: |
| 5 | 5,049,082,586 | 8,604 | 90 |
| 10 | 4,943,218,198 | 6,404 | 90 |
| 20 | 4,890,589,462 | 5,304 | 90 |
| 25 | 4,880,294,770 | 5,084 | 90 |

Season totals follow the existing benchmark scope; they are not USD estimates
or a claim of lower total protocol cost. No Sponsored Voting source changed.
