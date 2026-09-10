# Cinematic frontend redesign — local checkpoint candidate

Branch: `work/v7-brand-frontend`, based on checkpoint
`dad8f1b7496f4ac5c7f8501b4c6ba000e9aa5ce1`, including the local aviator removal.

## Implemented

- Shared header: canonical gold logo, Home/Mint/Racing/Leaderboards/Rewards/
  Legendary links, current-route indication and Connect Wallet. Connection uses
  the existing verified-network helper, never signs or submits a transaction.
  Account/network changes clear the displayed connection. Mobile has a separate
  menu, not compressed desktop links. Keyboard skip link is provided.
- Home: cinematic canonical banner with the embedded slogan, a screen-reader
  heading, Mint and Explore the22 actions. No duplicate visible slogan overlay.
- Editorial serif typography, charcoal surfaces, restrained gold separators,
  generous spacing and ambient CSS gradients. No new artwork, remote fonts,
  animation libraries or dependencies.
- Concept: Collect / Vote / Race / Reward / Build Legacy.
- Hall of Fame: four contenders resolved through the unchanged canonical helper
  and card component; full gallery remains at `/hall-of-fame`.
- Legendary: separate curated preview01/02/09/15 for color/silhouette diversity;
  gray artwork09 replaces the third display position; old artwork03 moves to
  position9. Stable asset labels and SHA-256 manifest are unchanged. Gallery order
  is01/02/09/04/05/06/07/08/03/10/11/12/13/14/15; all15 are still available at `/legendary`, with original identity labels intact.
- Racing: four-step explanation, sponsored on-chain inclusion and owner-trusted
  privacy disclosure. Existing Voting/Race Reveal components are not modified.
- Rewards: neutral charcoal/gold gradient; neither legacy reward artwork is
  referenced. No arbitrary replacement horse. Existing original files remain.
- Existing rarity/scoring/mint/refund/chapter information remains available in
  expandable editorial sections. Numeric values come from the preceding approved
  V7 frontend; no economics changed.
- Mobile: centered banner crop keeps the embedded logo/slogan, two-column artwork
  previews, vertical racing steps, stacked rewards and full-width hero actions.
  Motion is limited to subtle color/border changes and honors reduced motion.

## Files changed for this review

`src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` (existing aviator
removal), new `src/app/luxury.css`, `src/components/BrandHeader.jsx`,
`src/components/LegendaryGallery.jsx`, new `web-test/brand-header.test.cjs`, `web-test/legendary.test.cjs`,
and this report. Original assets, manifests and canonical catalogs are unchanged.

## Verification

- 106 frontend tests passed, including the new header connection/reset/cleanup
  test, existing wallet/network tests, Voting lifecycle and asset integrity.
- Typecheck, production build and explicit testnet build passed.
- Lint:0 errors,5 existing hooks warnings (Allocations, Mint, Refund and Voting).
  The former two image warnings disappeared because both decorative images are
  no longer rendered.
- Local HTTP200: Home, Hall of Fame, Legendary, Mint, Race, Results, Standings,
  Rewards, Refund and Status. Rendered HTML contains no retired reward/hero/banner
  references or Legendary original-file paths.
- 98 protected tracked files match the checkpoint byte-for-byte, including
  Solidity, V7 Master, Sponsored Voting backend, Voting component,22 portraits,
  15 Legendary originals/derivatives, canonical brand originals/derivatives and
  Genesis placeholder. Protocol regressions were not rerun for this presentation
  change; the count above is frontend only.
- Visual browser review remains pending; no screenshots or Core Web Vitals are
  claimed. Prior local browser access failed with ERR_BLOCKED_BY_CLIENT.

## Vercel Preview blocker

The user authorized a separate Preview, not production. This environment currently
has no Vercel app tools, installed Vercel CLI, authenticated CLI session/token or
linked `.vercel/project.json`. A new remote Preview has therefore NOT been created.
No public URL is invented, no old deployment is presented as the new design, and
no push was made to trigger a deployment indirectly. The user subsequently
approved a local checkpoint after the final gallery adjustment.

After authenticated Vercel access and the correct existing project are available,
a CLI deployment of this worktree can target Preview explicitly:
`vercel deploy --target=preview` from the project root. Verify project/account and
Preview-only environment settings first; do not pass `--prod` or promote/alias to
the live domain. Do not upload wallet/decryption private keys. Use the resulting
unique Preview URL for the actual desktop/mobile review.

Reference: https://vercel.com/docs/cli/deploy

Review checklist:320/390/768/1440px, banner text legibility, menu/Connect Wallet,
portrait proportions, gallery dialog keyboard/Escape/focus, no overflow, Racing
and Rewards empty/deployed states, image requests and no legacy backgrounds.
