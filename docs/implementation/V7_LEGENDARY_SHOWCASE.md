# Legendary Collection — local review candidate

Branch: `work/v7-brand-frontend`. Builds on the uncommitted branding changes.
No commit, push, merge or deployment is authorized or performed.

## Scope and identity

The fifteen supplied images are artwork previews, separate from the canonical
22 Hall of Fame race horses. Labels `Legendary Artwork 01`–`15` are internal gallery
references only. No NFT Token IDs, character names, biographies, rarity values,
VP or per-token metadata are assigned. These records are never imported by Voting,
Race Reveal, standings or the canonical horse catalog.

Originals are copied byte-for-byte into `public/assets/legendary/originals/`.
`src/data/legendaryOriginalIntegrity.json` stores original upload filenames,
SHA256, sizes and dimensions. Originals total 47,589,986 bytes. Web derivatives
under `public/assets/legendary/web/` are lossless WebP with no retouching/cropping;
they total 25,894,542 bytes. These are disk sizes, not initial page downloads.

The display-only `src/data/legendaryArtwork.json` contains neutral descriptive
alt text, asset keys, labels, image paths and dimensions. No actual historical
identity is inferred from clothing or appearance.

## Interface

Home adds a four-artwork preview after its hero/presentation, followed by
`Explore Legendary Collection` linking to `/legendary`. The shared header adds
Legendary navigation. The dedicated page displays all fifteen in a responsive
4/3/2/1-column grid, separate from Hall of Fame.

Cards are native buttons with accessible names. Click/tap opens a native modal
dialog; browser-native keyboard activation, Escape dismissal and focus containment
apply. A visible Close button and explicit focus return are provided. Artwork is
shown with preserved aspect ratio. No carousel dependency is introduced.

## Performance measurements

Next Image uses quality90, responsive sizes and lazy loading. Home renders only
four gallery images, not fifteen hidden images. Original paths are never used by
the UI. The larger dialog image is mounted only when opened.

Local testnet production HTTP measurements (not live Vercel/Core Web Vitals):

| Measurement | Bytes |
|---|---:|
| Home HTML | 53,674 |
| Legendary HTML | 33,636 |
| Legendary referenced JS, summed gzip including framework/shared chunks | 181,669 |
| Four preview images at384px, quality90, WebP | 166,302 |
| Four preview images at640px, quality90, WebP | 409,214 |

Actual browser image selection depends on viewport, device pixel ratio and scroll
proximity. The JS figure is a current total, not the incremental component size;
no pre-change JS benchmark was captured. Compared with the earlier local Home
smoke response (46,999 bytes), current HTML is 6,675 bytes larger; this rough
comparison also includes Next build output variation. No full-resolution original
is embedded as base64 or imported into the JavaScript bundle.

HTTP200 confirmed for Home, Legendary, Race, Results, Standings and all eight
measured optimized image requests. Rendered HTML on Race/Results/Standings contains
no Legendary image paths.

## Verification and limits

- Frontend: 105 passing, including original integrity, exact canonical HOF IDs,
  Voting interactions, four/fifteen artwork rendering, dialog close/focus return
  and derivative lazy loading. jsdom uses a test-only adapter for native dialog;
  real keyboard focus trapping/touch/layout still needs browser review.
- Typecheck, production build and explicit testnet build: passed.
- Lint: 0 errors, 7 existing warnings, no new warnings.
- Contract/backend regressions: 290 passing, including2200-voter stress coverage.
  The four full-season economic benchmark runs are excluded from this artwork task.
  Total completed in this task: **395 tests** (105 frontend +290 contract/backend).
- All 15 originals match uploads byte-for-byte. Brand original hashes match their
  existing manifest. All48 protected source/base files match the Genesis-placeholder
  base, including contracts, V7 Master, canonical horse dataset and22 portraits.
- Browser preview remains blocked (`ERR_BLOCKED_BY_CLIENT` from the preceding
  branding review). No rendered desktop/mobile screenshots or visual completeness
  are claimed. A separately authorized Vercel Preview is the planned review step
  after the branch has been saved remotely; the current public site is untouched.

## Files added / changed in this task

- `public/assets/legendary/originals/`: 15 unmodified uploaded originals.
- `public/assets/legendary/web/`: 15 lossless web derivatives.
- `src/data/legendaryOriginalIntegrity.json`: internal provenance/integrity manifest.
- `src/data/legendaryArtwork.json`: display catalog, neutral alt text.
- `src/components/LegendaryGallery.jsx`: preview/gallery and accessible enlargement.
- `src/app/legendary/page.tsx`: separate public collection route and metadata.
- `src/app/page.tsx`: four-artwork showcase and CTA.
- `src/components/BrandHeader.jsx`: collection navigation.
- `src/app/brand.css`: gallery, responsive breakpoints, modal and focus styles.
- `web-test/legendary.test.cjs`: integrity, isolation and interaction coverage.
- `docs/implementation/V7_LEGENDARY_SHOWCASE.md`: this report.

Existing branding work remains uncommitted alongside these changes. No old
collection previews were reintroduced; rewards decorative images and the new
Genesis testnet placeholder are unchanged by this task. No dependencies added.

## Checkpoint reconciliation: 397 → 395 → 399

The reports counted different executed suites. No tests were deleted, consolidated
or renamed to change the total:

| Suite | Branding report | Legendary report | Checkpoint rerun |
|---|---:|---:|---:|
| Frontend | 103 | 105 | 105 |
| Contract/backend regressions | 290 | 290 | 290 |
| Local readiness dry-run | 3 | Not rerun | 3 |
| Simulated-mainnet rejection | 1 | Not rerun | 1 |
| Total executed | 397 | 395 | 399 |

The net decrease of two was **two added frontend tests minus four scenarios not
rerun**. The four omitted scenarios were:

1. `canonical deployment and failed-sale path: 4x25, transfer, refund, burn`
2. `sold-out canonical system -> sponsored voting -> 10 full race reveals -> Season/All-Time -> Community payout`
3. `automatic service E2E: canonical deploy/mint, browser signature, HTTP admission/sponsorship,24h close and both boards`
4. `cannot deploy test mock on simulated mainnet4663`

They remain in `test/readiness/local-dry-run.cjs` and
`test/readiness/mainnet-rejection.cjs`. They run separately because their local
chain configurations differ. All four passed again at this checkpoint. Frontend
and contract/backend regressions were also rerun, without edits to test cases.
The same four expensive full-season economic benchmarks remain excluded from
all three counts. This is an execution-scope difference, not a detected regression.

Before committing, integrity was rechecked against supplied originals and the
base commit:15/15 Legendary hashes,22/22 HOF portraits, both brand originals,
V7 Master and Solidity passed. Local HTTP smoke checks again returned200 for
Home, Legendary, Race, Results and Standings; no original Legendary paths were
rendered, and no Legendary images appeared in the race/leaderboard routes.
Production/testnet builds, typecheck and lint from the immediately preceding
unchanged-code verification remain valid (0 lint errors,7 existing warnings).
