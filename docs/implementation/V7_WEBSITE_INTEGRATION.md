# Owner-trusted website integration — local review

Combined branch: `work/v7-hof-integration`, pending merge review of protocol
`8d78e328a0675239d5e856f945cc8c82c295928c` and canonical frontend
`2037eae140d8a14952c7962a1e37f7572708ebe3`. No commit, push or deployment.

## Scope and reuse

The complete canonical Next16.3.4 / React19.1.1 website is preserved, including
marketing, mint, refund, rewards, metadata and original collection artwork.
The single dataset src/data/hofHorses.json supplies competitor IDs1–22 and
display numbers #0001–#0022. See V7_INTEGRATION_REVIEW.md for the manually
reconciled protocol protections and reproducible dependency lockfile.

## Configuration

Set these public build-time variables for the new contracts, never legacy addresses:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_HOF_RPC_URL` | JSON-RPC endpoint for the selected chain |
| `NEXT_PUBLIC_HOF_CHAIN_ID` | Decimal chain ID, matching RPC and wallet |
| `NEXT_PUBLIC_HOF_TRUSTED_RACE` | Registered `HOFTrustedRace` address |
| `NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS` | `HOFTrustedLeaderboards` address |

Set server-only `HOF_ADMISSION_URL` to the complete private admission service URL,
ending in `/vote/admission`. In production use a protected transport/network,
HTTPS at the browser edge, request timeouts and edge rate limits. Do not put private
keys or the server endpoint in `NEXT_PUBLIC_*` variables. An unconfigured website
shows an unavailable state and offers no transaction. A configured but unregistered
race, wrong chain, RPC error or inconsistent snapshot fails closed.

Run `npm run dev` locally; `npm run build` builds the production Next application.
No service, contract or website is deployed by these commands.

## Effective flow

1. Connect wallet on the configured chain and select a horse. Eligible unused
   NFTs are selected automatically; optional deselection is available.
2. `Vote` encrypts in browser using the existing `ballot.cjs` implementation and
   obtains admission through `/api/vote/admission`. The request has only wallet,
   commitment and ciphertext. The proxy returns only deadline and signature.
3. Exactly one vote transaction is requested. There is no reveal/claim UI and no
   choice or salt stored in browser storage. Optional new-NFT top-up remains a
   separate voluntary transaction on the same previously chosen horse.
4. Backend settlement uses the existing owner-trusted worker. Closing the window
   alone never reveals a final table. Only `finalized == true` unlocks all 22 rows.
5. Season and All-Time are recomputed together from finalized race `pointsOf` and
   `horseRacePoints` reads. This is the same sum as the on-chain getters, tested
   against actual contracts, without waiting for `indexParticipants` or a claim.

Wallet and chain changes invalidate pending UI context. Submission is locked while
a transaction is pending; ownership, deadline and duplicate protection remain
authoritative in the contract. A transaction already broadcast may still confirm
after the user changes wallet; reconnecting reads its recorded status.

## Consistency, privacy and scale

All reads in a displayed snapshot use one block number, with a final block-hash
check. There is no partially filled leaderboard on RPC failure. Refresh polls
every 15 seconds without overlapping loads. Previously finalized results can be
shown while a refresh is running. This is latest-block consistency, not a promise
of chain finality: a later reorg is reconciled at the next refresh.

Community equal scores share a displayed position; the display does not award
prizes. Existing contract tie-breaks still determine winners using live ownership.
Horse ties use lower HOF number. Season 7 is not invented after the six seasons:
the website displays the completed-Chapter message and offers All-Time.

No individual choice is displayed, but public wallet points can imply a choice.
The owner can decrypt early and attest incorrect internally consistent results.
The UI explicitly discloses that trust model. No independent decryption proof is
claimed. Backend code and private key operations are absent from the browser bundle.

Public reads cost no transaction gas to the viewer. The current complete-reader
uses eight concurrent RPC calls at most; it is bounded by 60 races and Genesis
supply per race, but could require many RPC requests over a full chapter. Before
high-volume production use, an owner-operated cache/indexer should serve complete
block-tagged snapshots with validation against canonical contract getters. This
is an operational scaling gate; the present UI may load slowly on large histories.
The optional top-up and Vote are paid by the voter wallet. Backend settlement gas
is paid by the backend's funded transaction signer, never drawn automatically from
the reserved Prize Pool.

## Remaining launch gates

Real wallet/mobile testing, chain-specific RPC capacity/gas/finality checks, secure
key custody, service scheduling/monitoring and independent audit remain required.
The source must be mounted into the full existing website in a separately reviewed
integration; this work does not merge its branch. V7 Master is unchanged.

## Wallet-session hardening

The browser now re-reads `eth_accounts` and `eth_chainId` after encrypted admission
has completed, immediately before requesting the Vote transaction. The same
check runs before optional top-ups. It requests no signature or new account access.
A changed/disconnected account, changed chain or invalidated UI generation stops
the transaction request. Contract checks remain authoritative if the wallet changes
again after the request has reached the wallet provider.

Refresh deduplication is scoped to each wallet generation: an older in-flight RPC
request cannot suppress the new wallet's initial load or clear its loading state.
Three additional web tests cover account/chain mismatch, a change during the
asynchronous check, and real encryption/admission followed by an invalidated
session with zero transaction calls.
