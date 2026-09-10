# Future security upgrade — threshold voting (NOT IMPLEMENTED)

Status: suspended by product decision, external budget $0. MVP/testnet retains
owner-trusted Sponsored Voting; HOF's backend technically can decrypt early.
Nothing here approves deployment, paid operators, paid audit, or implementation.

Future product target: secret for 24h, then public Race Reveal. Permanent ballot
privacy and homomorphic/private-after-reveal voting are out of V7 scope. Public
V7 wallet scores can infer the choice for top-ten positions; this is accepted
after reveal, not a promise of permanent privacy.

Candidate design retained for comparison:

- Threshold ElGamal G1 BN254, 3 of 5 genuinely independent operators, HOF holding
  no share. Three colluding operators can decrypt early: explicit trust assumption.
- Distinct key per race, distributed key generation with verifiable shares and
  transcript, no dealer/master key at HOF. Concrete DKG library/protocol must be
  selected with cryptographic review; no custom DKG implementation is approved.
- Fixed public key, committee and transcript hash read by the browser from the
  canonical race before voting opens. HOF cannot substitute a unilateral key or
  replace a running race's committee. Real independent operators are not secured.
- Browser ciphertext A=rG, B=hG+rY with h in 1..22 and fresh secret randomness.
  Disjunctive Chaum–Pedersen proof validates the allowed choice without decrypting.
  Domain/key/race/wallet bind the proof; versioned EIP-712 intent binds ciphertext
  hash, proof hash, nonce, deadline, token IDs, VP and same-pick top-up. Contract
  independently checks eligibility/VP and the proof. Reject degenerate/invalid
  points, encodings and randomness-zero ciphertexts.
- Full ciphertext/proof reconstructible in calldata/events, compact commitments
  only in contract storage. No per-voter reveal or claim action.
- Operators observe finalized/confirmed VotingClosed and frozen ballot commitment
  independently. No release based merely on a backend clock or request.
- After verified close, operators may publish race-specific secret shares, checked
  against public DKG share commitments. Three distinct valid shares recover only
  that race's key publicly. Keys must never be reused across races.
- Complete bounded decryption/tally/scoring processing binds to every accepted
  record and exact VP. No partial FINAL, duplicate processing or mutable result.
- Two offline operators are tolerated. Below three recoverable shares, race remains
  unfinalized; recovery uses independent operator backups, never a HOF master key.
  Permanent loss needs a separately approved failure policy, not invented economics.
- Sponsored one-signature UX, adaptive target25 and direct fallback remain. A
  straightforward 22-option proof is about 1408 bytes plus 128-byte ciphertext.
  Rough non-benchmark estimate: 0.7–0.9M gas/vote; batch25 could exceed the local
  16M cap, requiring smaller batches. These are NOT measured Robinhood costs.
- Independent hosting/custody, key ceremonies, monitoring and cryptographic audit
  create unresolved operational costs. No provider/pricing is committed.
- External cryptographic audit must cover DKG, parameter strength, OR proof /
  Fiat–Shamir, bindings, randomness, release verification, cross-race isolation,
  finality and end-to-end result completeness. Frontend supply-chain integrity
  remains necessary because malicious browser code could exfiltrate plaintext.

References: https://docs.shutter.network/docs/protocol ;
https://eips.ethereum.org/EIPS/eip-196 ; https://eips.ethereum.org/EIPS/eip-1108 .
These describe building blocks, not an audit or endorsement of a HOF integration.
