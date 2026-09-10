# Genesis placeholder — TESTNET ONLY

Approved static metadata: `public/genesis/unrevealed.json`. The original
`public/brand/hof-logo.webp` is unchanged. No rarity, VP, horse ID or attributes
are published by this JSON. This is delayed NFT metadata reveal, separate from
Race Reveal. It does not make on-chain rarity/VP private.

Host both files on the actual public testnet website. No public domain is chosen
or claimed live by this change. Set `GENESIS_PLACEHOLDER_URI` to the full HTTPS
URL ending `/genesis/unrevealed.json`, not a folder or image URL.
The JSON intentionally uses the approved root-relative `/brand/hof-logo.webp`;
the preflight resolves it against the metadata origin. Verify the intended wallet
viewer supports relative image URIs before its testnet demo; some NFT indexers
require absolute image URLs. Do not invent a domain to work around this.

Canonical preflight, `deploySystem` and the MockUSDC deployment entrypoint require HTTP 200, valid exact canonical
JSON and an accessible WebP image before any system deployment write. Redirects,
HTTP errors, timeout, template URLs, extra attributes and non-testnet chain IDs
fail closed. The metadata validator only permits chain 46630; canonical network
validation already rejects mainnet. No skip switch is provided for operators.
Local tests mock HTTP explicitly; those mocks are not production configuration.

Legacy `deploy/set-test-metadata.js`, related historical scripts and
`public/metadata/1.json` are retained for history only. None is imported or executed
by the canonical deployment or preflight. Do not run these legacy scripts.

Testnet mint window is 604800 seconds (7 days). Immediately before starting the
canonical deployment, the entrypoint reads the latest blockchain timestamp and
computes `MINT_DEADLINE_UNIX = timestamp + 604800`. It does not reuse an old env
deadline. For the read-only preflight, calculate the same fresh value explicitly.
The reference is the pre-deployment chain timestamp, not a guarantee of the later
Sale transaction's mined timestamp: deployment comprises multiple transactions.
Re-run preflight if deployment is delayed. This changes no contract or V7 economics.

Operational prerequisite: publish and verify the site assets separately with
approval before attempting blockchain deployment. This task does neither.

## Checkpoint validation

- Contract/backend regressions: 290 passing (`hardhat test --no-compile test/*.js
  --grep '^(?!.*V7 sponsored full-season benchmark)'`). Includes both 2200-voter
  stress tests. The four full-season economic benchmarks were excluded; an
  initial benchmark run was stopped and is not counted as a completed result.
- Frontend: 99 passing, including 26 placeholder tests.
- Local readiness dry run on simulated 46630: 3 passing.
- MockUSDC rejection on simulated mainnet4663: 1 passing.
- Total completed tests/scenarios: 393.
- Forced Solidity compile: 60 files. Typecheck, normal production build and
  explicit testnet-mode build passed. Lint: 0 errors, 8 existing warnings.
- Initial restored compiler artifacts were stale; forced recompilation resolved
  the preflight rejection. Chain-specific readiness tests ran separately with
  their required local network configuration.
- Contracts, V7 Master, frontend source/dataset, logo and portraits unchanged
  against base cbe1b7555d1bebf327fb74c11e5df16f66a0637b.
- Public HTTP verification is still pending: no domain has been configured or
  deployed. HTTP tests use fixtures and do not claim a public endpoint exists.
