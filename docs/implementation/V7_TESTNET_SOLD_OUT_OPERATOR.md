# TESTNET Public sold-out operator — prepared, NOT authorized to execute

Base: 055f18839c716c922e3b5691e49b17b9ebfff546.
No Solidity, economics, signatures, scoring, artwork or deployed contracts changed.
Only Robinhood Testnet46630 and the three exact approved deployed addresses are
accepted. No deployments, allocations, refund, metadata reveal, Race creation,
worker start or proceeds distribution are part of this operator.

## Modes and public configuration

`node scripts/testnet-public-sold-out.cjs --dry-run` is default and never loads
private keys. Missing argument also means dry-run. Unknown arguments fail closed.
`--fund` and `--mint` are distinct future phases, disabled without the respective
explicit `HOF_TESTNET_SOLD_OUT_CONFIRM` value. DO NOT execute these phases yet.
Copy `.env.v7-sold-out.example` outside the repository; set a dedicated, explicit
HOF_TEST_BUYER_ADDRESS, different from Owner, Admission, Relayer, Team, Audit,
Project and Rewards. Funder defaults to the approved deployer/owner.

On Mac, after the prepared code is reviewed and available locally:

```sh
# Load only your reviewed local config. No private key is needed for this command.
set -a
source /absolute/path/to/reviewed-sold-out-config.env
set +a
npm run compile:contracts
node scripts/testnet-public-sold-out.cjs --dry-run
```

The config must supply HOF_TEST_BUYER_ADDRESS and may set HOF_RPC_URL. For later
execution it also supplies an absolute persistent HOF_TESTNET_SOLD_OUT_JOURNAL,
HOF_TEST_BUYER_KEY_FILE and HOF_TEST_FUNDER_KEY_FILE. Key files must be0600 and
outside the repository; only the phase-specific key is loaded on actual send.
Never put raw keys in env or arguments. Keep HOF_ENABLE_SERVICE=NO.

Future authorization strings (not commands to run now):
- Funding only: AUTHORIZE_TESTNET_FUND with --fund.
- Approve/mint only: AUTHORIZE_TESTNET_MINT with --mint.

Use one journal and one process for this dedicated buyer/funder. Do not issue
manual transactions or run other scripts with these accounts concurrently.
The journal's exclusive lock prevents two processes sharing it from writing.
Use persistent disk; do not copy pending journals into independently running
processes or delete a journal to make an error disappear.

## Planning and estimates

The current chain state determines remaining=2000-sold. Sold>2000 is rejected;
sold=2000 is success/no-op, even after the deadline. Remaining batch sizes are
at most25; price is30,000,000 units. Exact required token balance is remaining
multiplied by that price; funding only mints the shortfall. Existing allowance
is reused; if insufficient, approve exactly the remaining total (no unlimited
approval). Funding is never performed as part of --mint.

Dry-run reads actual ETH/token balances, allowance, gas price and contract wiring.
It estimates funding shortfall, approval if needed, first/current representative/
last batch against CURRENT state. It uses no state overrides. Without sufficient
current token balance or allowance, eth_estimateGas for mint can revert. This is
reported UNAVAILABLE/NO-GO, never replaced by invented live numbers. Rerun dry-run
after separately approved funding/approval when necessary. Current-state later
batch estimates cannot reproduce future storage; the local benchmark below
provides distinct measured receipts, not a guarantee for live gas.

The script adds25% to estimated gas limit and rejects a limit above half the
current block gas limit. The total gas budget projects the largest current mint
quote across all remaining batches, plus approve, and reports buyer/funder
sufficiency separately. Every transaction is re-estimated and balances/state are
rechecked before send. The fee cap uses maxFeePerGas if available, otherwise
gasPrice. Actual send uses that cap as legacy gasPrice. Fee changes and additional
L1/data charges mean the projection is not a universal balance guarantee; leave
extra test ETH and stop if any estimate or balance check fails. No fixed USD cost.

## Local evidence

Hardhat-only measured receipts from a zero state, all80 batches to one EOA:

| Transaction | Gas used |
|---|---:|
| MockUSDC funding60,000 | 68,414 |
| Approval60,000 | 46,343 |
| First mint25 | 3,621,422 |
| Second mint25 | 3,541,522 |
| Final mint25, sold-out | 3,555,183 |
| Maximum mint25 | 3,621,422 |
| All80 mints | 283,415,321 |

Total includes82 transactions if funding and approval are both needed. Existing
balance/allowance reduce that count; other buyers can reduce remaining supply.
These are local receipts, not measurements from Robinhood.

The read-only engine dry-run was also exercised with an in-memory zero-state
adapter:80 batches,60,000,000,000 required units, zero sends. Its synthetic quote
values are NOT gas measurements. The actual deployed-address CLI cannot produce
a meaningful live buyer report until the buyer address and reachable RPC exist.

## Receipt handling and recovery

Before each broadcast, persist kind, amount, sender, nonce and soldBefore, with
status broadcast-unknown. Once a hash is returned, persist it as pending. Wait
for a successful receipt, verify its canonical block hash, transaction sender,
nonce, destination and calldata, then reread sold and persist soldAfter.
For mint, parse Genesis Transfer events, check unique received IDs/current owner
and VP. IDs1–22 must remain0VP; at least one token in the batch must have positive
VP. Starting at1 with25 therefore checks all1–25, including23–25. This does not
alter ID allocation. Transfers during verification can intentionally cause STOP.

On restart, reconcile all nonconfirmed entries before any new write:
- Known hash, successful canonical receipt: verify and mark confirmed; reread sold.
- Missing receipt, failed receipt or RPC error: STOP. No automatic replacement.
- No hash after an attempted broadcast: STOP; inspect sender/nonce on chain.
- Confirmed funding: never issue another funding mint from the same journal.
- Allowance already sufficient: skip approve; continue from current sold.

Manual recovery: stop all users of these keys; preserve/backup the journal;
inspect the recorded sender+nonce and receipt using read-only RPC/explorer. If a
missing hash is recovered, reconcile it only after verifying exact transaction
intent. This version has NO automatic repair/clear-pending command; ambiguous
cases require a reviewed reconciliation procedure. Do not blindly retry or
change nonce. A failure after earlier batches leaves those earlier NFTs valid.
An expired window is STOP; never redeploy or alter the deadline to continue.

## Live status

No buyer address supplied for this task. No live sold, ETH balance, token
shortfall or fee estimate is claimed. Do not reuse the earlier initial-state
PASS as a current sold count. Run the Mac dry-run to obtain exact current numbers.
NO-GO for real execution until those results, funding and gas budgets are reviewed
and the individual write phases are explicitly approved.

Final verification:26 new operator tests/scenarios PASS. Relevant regression run
(Sale, token, proceeds, mint caps, allocation, refunds, Sponsored Voting and scan
hardening) passed97 tests including24 operator cases; the final operator suite
adds two cases. Total distinct:99 PASS. Compile, existing deployment-script checks
and syntax checks of both new JavaScript modules passed. Work's read-only RPC
probe timed out after15s with no response. No live transaction was sent and no
operator write phase was invoked. No checkpoint commit was made in this task.
