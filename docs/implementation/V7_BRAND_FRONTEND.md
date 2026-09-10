# Canonical website branding — local review candidate

Base: `work/v7-genesis-placeholder`, `6c3097df29376e5f6646ab936b64185a674efb83`.
Working branch: `work/v7-brand-frontend`. No publication or protocol deployment.

## Assets

The approved square logo and wide banner are preserved byte-for-byte under
`public/brand/originals`. `src/data/brandAssets.json` records their SHA256 values,
source filenames and dimensions. WebP derivatives are lossless, with no crop,
retouching or changes to artwork. Next Image provides responsive delivery.

The global header and Genesis testnet placeholder use `/brand/hof-logo.webp`.
The homepage uses `/brand/hof-banner.webp`. Desktop retains the wide composition;
small screens center-crop the rendered banner to keep its embedded logo/slogan
readable. No duplicate text is overlaid. Source artwork is never cropped on disk.

The 22 canonical HOF portraits, integrity manifest and horse dataset are unchanged.
`reward-left.webp` and `reward-right.webp` remain decorative, pending owner decision.

## Retained legacy / unused assets

`public/assets/hero-hof.png`, `collection-banner.png`, the five old collection
preview images and the former `hof-logo.webp` are retained for history but are no
longer referenced by public frontend components. Existing alternate collection /
Legendary artwork is not deleted or reassigned to the canonical 22.

## Public routes

All pages share a black/gold header. `/hall-of-fame` uses HofGallery and the canonical
dataset. `/race`, `/results` and `/standings` consume the existing canonical Voting
component with its appropriate mode. `/wallet` redirects to `/race`; `/history`
redirects to `/standings`. The dev-only `/review` route remains unavailable in
production by design.

Rewards reads the canonical trusted leaderboards address, validates rewards/USDC
wiring and chain, and reports unawarded Community prizes as rollover. Status reads
the same canonical board rather than legacy Community/HOF contracts. No configured
addresses means no invented state or results. Existing Sponsored Voting, Mint and
Refund behavior is preserved.

## Content

The identity partition (22 HOF + 2,200 voting Genesis) and mint allocation partition
(2,000 Public + 111 Community + 111 Team) are distinct and both total 2,222. HOF has
0 VP; there is no claim that HOF identity is hidden. Team/owner voting restrictions
remain enforced by the protocol. Reward copy distinguishes the sell-out-dependent
allocation, unresolved HOF beneficiary payouts and Community rollover.

Owner-trusted encryption is disclosed: the backend can decrypt early. No claim of
trustless voting is made. No intermediate results or user reveal/claim action is
introduced.

## Public URL prerequisites

`GENESIS_PLACEHOLDER_URI` remains unset. A later approved publication must expose
both the JSON and new image and pass the existing HTTP preflight. Testnet metadata
still says TESTNET / TEST ONLY / NO VALUE and contains no traits, rarity or VP.

Set optional `NEXT_PUBLIC_HOF_SITE_URL` only to the verified HTTPS site origin after
publication. The layout then resolves the new banner for OG/X. With no origin,
image metadata is withheld instead of inventing a localhost/public URL. No social
crawler availability is claimed before publication.

## Verification scope

Frontend interaction/integrity tests, contract/backend regressions, local testnet
readiness and simulated-mainnet rejection run separately. The four expensive
full-season voting gas benchmarks are excluded from this presentation-only task.
Visual browser verification must be completed before claiming the screenshot
checklist done; local source/build checks do not replace rendered screenshots.

## Review results

- **397 completed tests/scenarios passed**: 103 frontend, 290 contract/backend,
  3 local readiness scenarios and 1 simulated-mainnet MockUSDC rejection.
- Solidity compile passed (nothing changed to compile).
- Typecheck passed. Production and explicit testnet production builds passed.
- Lint: zero errors, seven warnings: synchronous state updates from effects in
  Allocations, Mint, Refund and Voting (4); Voting effect cleanup ref dependency
  (1); two retained decorative `<img>` elements on Home (2). Hooks warnings merit
  follow-up and can affect rendering behavior/performance; they are not proof of
  a runtime failure. Voting interaction/lifecycle tests passed. The image warnings
  concern optimization, not distorted or missing artwork.
- Local HTTP smoke check: 200 for Home, Hall of Fame, Mint, Race, Results,
  Standings, Rewards, Refund, Status, Genesis JSON and both new WebP assets.
- Both uploaded brand originals match their archived copies exactly. All 48
  protected tracked files checked (contracts, V7 Master, canonical horse data /
  helpers and portraits) match the base commit. Portrait tests also validate each
  hash and exactly IDs 1–22.
- `git diff --check` passed. No Solidity, economic rules or dependencies changed.

### Outstanding preview / owner decisions

The browser rejected the local preview with `ERR_BLOCKED_BY_CLIENT`. Therefore
**no rendered desktop/mobile screenshots are claimed**, and visual review remains
open for all requested routes. Local HTTP checks and build success are not a
substitute for this review. No attempt to publish or bypass browser restrictions
was made. The public Vercel site has not been changed.

Owner review still required for the two retained decorative rewards artworks and
future separate Legendary collection presentation. The verified public origin
and Genesis URI must be set after a separately approved publication. Blockchain
addresses and backend readiness remain deployment prerequisites, not simulated
production data. HOF beneficiary payout rules remain a documented unresolved
protocol matter; this task does not implement them.

No commit, push, merge or deployment has been performed.

## Files changed (including new files)

- `.env.example`
- `docs/implementation/V7_BRAND_FRONTEND.md`
- `docs/implementation/V7_GENESIS_PLACEHOLDER.md`
- `docs/implementation/V7_TESTNET_READINESS.md`
- `public/brand/hof-banner.webp`
- `public/brand/hof-logo.webp`
- `public/brand/originals/hof-banner.png`
- `public/brand/originals/hof-logo.png`
- `public/genesis/unrevealed.json`
- `src/app/allocations/page.tsx`
- `src/app/brand.css`
- `src/app/history/page.tsx`
- `src/app/layout.tsx`
- `src/app/mint/page.tsx`
- `src/app/page.tsx`
- `src/app/refund/page.tsx`
- `src/app/rewards/page.tsx`
- `src/app/status/page.tsx`
- `src/app/wallet/page.tsx`
- `src/components/BrandHeader.jsx`
- `src/components/HofPage.jsx`
- `src/data/brandAssets.json`
- `src/lib/hofClient.ts`
- `test/V7Phase1Security.test.js`
- `test/readiness/local-dry-run.cjs`
- `web-test/brand-assets.test.cjs`
- `web-test/genesis-placeholder.test.cjs`
