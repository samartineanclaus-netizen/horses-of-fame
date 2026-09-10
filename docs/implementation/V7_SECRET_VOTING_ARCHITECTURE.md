# One-action secret voting: BLOCKER — implementation not yet authorized

This is a technical design, **not an implemented or audited cryptographic system**.
No existing vote secrecy guarantee is weakened by this local draft.

## What the current contracts cannot do

`HOFRaceVoting` stores `keccak256(abi.encode(horse, salt))`. The public EVM cannot
recover a high-entropy salt from this hash. Whoever knows the preimage must
supply it later. A keeper cannot manufacture it. A timer does not change this.
Private Solidity storage, an unpublished ABI, browser-only hiding, or a relay
holding plaintext do not protect choices from observers or that relay.

The current race has no immutable, complete Race Reveal checkpoint: after close,
additional voter reveals can change rankings. `HOFCommunitySeason` can claim
points from a ranking that later changes; the HOF board can likewise record an
intermediate ranking. Removing only `claimRacePoints` would preserve this flaw.

## Recommended design (project design, not a claim of provider compatibility)

1. Browser creates a random salt and a ballot bound to chain ID, race address,
   wallet, chosen HOF number 1–22 and encryption epoch. It encrypts the ballot
   locally to an independently operated threshold key released only after the
   race has closed. The project/relayer never receives plaintext before close.
2. The user's single Vote action submits/signs the encrypted ballot and a proof
   that it encrypts a valid in-range choice matching the bound commitment under
   the approved future key. The protocol must reject malformed/undecryptable
   ballots at admission; checking a preimage only after close is insufficient
   because a malicious ciphertext could otherwise stall the entire race.
3. Publish ciphertext and required verification data on-chain, not merely a
   private database or an unavailable URL. Verify wallet authorization, exact
   domain, one fixed pick, eligible NFT ownership and one-use-per-race VP.
   Preserve approved same-pick top-ups without allowing another choice.
4. After the 24-hour window closes, the threshold network releases verifiable
   decryption material. Permissionless relayers decrypt and submit proofs. They
   do not supply external race results, decide winners or have discretionary
   authority over scores. Consensus VP alone determines the 22-horse ranking;
   equal VP is ordered by lower HOF number, with no outcome RNG.
5. Accept only a proof covering the complete accepted ballot set and frozen VP,
   including its count/root. Prove the decryption, ranking and V7 score vector.
   An operator-signed arbitrary result or unverified Merkle root is not enough.
6. Publish the immutable result and new Season/All-Time state together in one
   verified transition. Mark the race settled before any external effects.
   Participants need no reveal, points claim or second signature. There is no
   valid late reveal capable of changing a published final ranking.
7. Relayers trigger the transaction; EVM contracts do not wake themselves on a
   schedule. Relayer failure must not grant exclusive control: anyone with the
   published proofs/data can execute the same valid transition.

An audited proof system and target-chain verifier must be selected and measured.
A gas-bounded multi-transaction preparation can be permissionless, but intermediate
leaderboards must not be exposed as final. If full snapshot publication uses
roots, authenticated read/proof-serving support is also required in the app.
Existing on-chain scores cannot simply be replaced with an operator's data feed.

## Approved failure behavior

If a complete valid result is unavailable, leave the race unfinalized and leave
both leaderboards unchanged for that race. Retry only complete verifiable result
publication; never finalize a subset of ballots. There is no administrator power
to supply an arbitrary result. A service outage does not authorize plaintext
voting, forfeiture, a timeout winner or a scoring fallback.

This remains an acceptance requirement for the blocked replacement, not a claim
that the legacy commit/reveal and claim contracts already enforce it.

## Timing anchors

The final verified Race Reveal transition records an immutable reveal timestamp.
Race #10's timestamp is the season anchor; the last race of season 6 supplies the
chapter anchor. Administrative archival/payment timestamps never replace them.
The successor season's first voting opening must be no later than anchor +
604,800 seconds and cannot precede the anchor. Late admin execution must not
reset that clock. Chapter timing uses 2,592,000 seconds as
the approved minimum: `chapterStart >= previousChapterEnd + 30 days`.
Starting later is allowed. There is no additional maximum, and no requirement
to start at precisely that second. The previous chapter ends at the final
Race Reveal of its last race in its last season.

The service's key release condition must respect chain closure/finality, not only
an off-chain wall clock that could advance while the chain is stalled. An early
public key release can leak choices even when the contract rejects early reveal
transactions. Clock/finality assumptions need independent validation.

## Cryptographic options and their limits

Shutter documents an application-layer threshold service whose distributed
Keypers release decryption keys after conditions are met. This is a candidate
for evaluation, **not a verified Robinhood Chain integration**. Its API access
layer is centralized; availability and direct verification cannot be assumed.
[Official Shutter design](https://blog.shutter.network/introducing-shutter-api-threshold-encryption-service/).

Drand timelock encryption is another candidate: future-round signatures enable
later decryption. Its own security documentation states that threshold collusion
can decrypt early and network failure can prevent decryption. Those trust and
clock assumptions require acceptance; timelock encryption is not trust-free.
The beacon would unlock ballots, never select race winners.
[Official drand timelock documentation](https://docs.drand.love/docs/timelock-encryption/).

Neither source establishes that our proposed validity/settlement proof exists,
is audited or fits the target chain. Do not add unaudited cryptographic code,
mock verification, a project-owned decryption key, or a plaintext fallback.

## Required acceptance tests before enabling the replacement

- Inspect transaction calldata, logs and storage throughout 24h: no plaintext
  choice/salt or per-horse live totals; no early decryption under stated assumptions.
- Boundaries at opensAt-1, opensAt, closesAt-1 and closesAt; both on-chain rejection
  and actual cryptographic key availability must be tested.
- Reject wrong key epoch, domain/wallet/race replay, invalid ciphertext/proof,
  invalid horse, duplicate NFT, transferred-used NFT and split/top-up choice changes.
- Keep all accepted ballots available and decryptable without any voter returning;
  reject omitted ballots, false VP, wrong ranking, incomplete result and forged proof.
- A decryption outage, missing ballot or partial/invalid result keeps the race
  unfinalized and both leaderboards unchanged; arbitrary admin overrides fail.
- A single successful result publication updates both leaderboards exactly once;
  failed proof/transaction changes neither; race/season/chapter replay fails.
- Preserve points on the original wallet, not the NFT; no season-finalization
  double addition to All-Time; no incomplete scoring before rewards.
- Test the complete 60-race lifecycle at maximum participation and worst-case gas,
  recovery after relayer failure, chain stalls and reorgs; no invented recovery rule.
- Season boundary: anchor+7d allowed; +7d+1 rejected; delayed archival never extends
  it. Chapter boundary: previousChapterEnd+30d-1 rejected; +30d and later
  allowed. No maximum boundary is added.

These are pending acceptance criteria, not passing tests in the present draft.
