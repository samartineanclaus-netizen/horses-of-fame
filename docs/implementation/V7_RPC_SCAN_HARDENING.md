# Canonical Race scan lower bound

Backend-only change. Solidity, signatures/EIP-712, 24-hour deadline, scoring,
rewards and existing deployments are unchanged. Owner-trusted encryption remains.
The service stays disabled (`HOF_ENABLE_SERVICE=NO`); configuration is not an
instruction to start it or create a race.

## Configuration

For one existing race, supply both public values:

```dotenv
HOF_ENABLE_SERVICE=NO
HOF_RACE_ADDRESS=<actual canonical race address>
HOF_RACE_DEPLOYMENT_BLOCK=<actual RaceCreated block>
```

For multiple races, use `HOF_RACE_DEPLOYMENT_BLOCKS` as a JSON object mapping each
actual race address to its positive integer creation block. Retain all registered
race entries, including finalized races. Both formats may coexist only when they
agree. No defaults, guessed addresses or system deployment anchor are valid.
The existing frontend variable `NEXT_PUBLIC_HOF_RACE_DEPLOYMENT_BLOCK` remains
separate: set it to the same verified creation block for the displayed race.

The actual canonical receipt from factory.createRace contains RaceCreated and
its blockNumber. Capture these when race creation is separately authorized.
No existing race address or creation block has been supplied for this deployment;
leave the fields empty until actual values exist. A system with no registered
races can validate; any registered race missing its entry fails before scanning.

## Evidence and durability

For every canonical race, the service verifies the claimed block is within the
current chain head, then queries the immutable factory for RaceCreated for that
address in **only that block**. It checks the successful transaction receipt,
block hash, matching receipt log, Board registration and factory provenance
(chapter, season, ordinal). It never needs historical eth_getCode. This relies on
the configured RPC serving authentic canonical chain evidence, just as the rest
of the current service does; it is not a light-client proof.

The single-writer service lock protects a persistent `<race>.scan.json` binding:
chain, Board, factory, race address, creation block, block hash and transaction
hash. Creation uses exclusive write and file fsync. A torn/corrupted file fails
closed, never silently rewrites. Each recovery rechecks chain evidence and the
exact persisted binding. Moving the lower bound later cannot omit a valid vote:
a later block will lack the authentic creation event. Reorg/missing evidence or
changed bindings halt processing and require investigation, never reset to zero.

Vote reconstruction, ResultProposed verification and sponsored queue inclusion
recovery share this bound. The queue's own `.binding` also includes fromBlock.
Old queue bindings without this field intentionally fail; do not delete pending
journals to bypass this safeguard. Any migration requires explicit reconciliation.
Pagination stays inclusive in chunks of at most 2,000 blocks. The low-level
reconstruction/queue tooling also accepts an explicit block or an actual direct
constructor deployment receipt; a connected contract with neither fails closed.
The production service always requires configuration plus factory verification.

## Request-count benchmark

Synthetic provider benchmark uses the actual reconstruction loop, with creation
block 117170000 and observation head 117174000. These are test inputs, not claims
about a live Race. Interval length: 4,001 blocks. No remote requests or gas used.

| Operation | Previous from zero | New from creation |
|---|---:|---:|
| One log scan | 58,588 | 3 |
| Ballot + proposal scans | 117,176 | 6 |

Creation evidence adds one single-block factory log query **per canonical check**,
plus bounded receipt/block/provenance reads. The table excludes these reads and
per-ballot validation calls, and does not claim total HTTP counts, latency, gas
savings or a 24-hour block count. Service polling/restarts repeat evidence checks.
Finality support (`finalized`), event/receipt access, RPC rate limits and backend
connectivity must still be verified on the selected provider before live E2E.

## Tests

Coverage includes inclusive first queried block and later ballots, no log queries
below creation during automatic settlement, persistence/restart, repeated checks,
missing/invalid/future bounds, mismatched race mappings, immutable journal binding,
corruption rejection, multiple-race configuration and measured pagination counts.
Canonical creation happens before voting opens; the first-vote-block test checks
the reconstruction primitive's inclusive boundary without claiming a canonical
vote can occur before opensAt.

## Verification result

- Extended contracts/backend regression: 310 PASS, including 11 scan-bound tests.
- Final targeted scan suite: 13 PASS (adds two cases: changed creation block hash
  and queue retry binding; the other 11 overlap the regression run).
- Frontend: 107 PASS; canonical local dry-run: 3 PASS; simulated mainnet mock
  rejection: 1 PASS. Total distinct passing tests/scenarios: 423.
- Solidity compile and deployment-script checks: PASS; no Solidity changes.
- The four expensive full-season gas benchmark variants were not rerun. Their
  fixture now supplies its actual creation receipt block; this change has no
  on-chain gas effect. Existing 2,200-voter service/settlement stress tests passed.

GO for local scan hardening. Live E2E remains NO-GO until actual race creation
address/block are available, Public Mint sell-out is satisfied, and approved
backend configuration/keys/connectivity and provider log/finality access are
verified. No worker or Robinhood transaction was started during this work;
all deployment/mint/race transactions in regression tests use local Hardhat only.
