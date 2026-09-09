# HOF frontend review — awaiting approval

## Status and branch

- Branch: `work/hof-canonical-frontend`.
- Base: `origin/v7-system-integration`, commit `0b2b826f50dd23cf6c08623f625291ba9df408dc`; this contains the complete existing website.
- Framework preserved: Next.js 16.3.4 App Router, React 19.1.1, TypeScript.
- Local commit authorized after the checks below; no push, merge, deployment or smart-contract changes. V7 Master untouched.
- This is an implementation review, **not production or interactive end-to-end sign-off**.

## Effective architecture

`src/data/hofHorses.json` is the one display dataset. IDs and numeric numbers are 1–22; the helper formats display numbers as #0001–#0022. Every HOF display uses the numeric lookup, never asset upload order.

The homepage gallery, dedicated Hall of Fame, Voting cards, final Race Reveal rows, horse leaderboard and archival horse labels share that dataset. The old five-entry HOF preview array, old HOF hero and old collection banner are no longer presented as the canonical 22. Existing Legendary and other collection assets remain in place.

Next Image serves quality-90 derivatives with responsive sizes and contain fit. Originals under public/images/hof remain byte-for-byte unchanged (22 SHA-256 checks). These were the supplied individual files; no ZIP was available in this workspace.

### Corrected source associations

| Supplied filename | Actual portrait / canonical destination |
| --- | --- |
| 0021_MEMPHIS.png | #0008 SOBERANO → 0008.png |
| 0008_SOBERANO.png | #0013 VALIANT → 0013.png |
| 0013_VALIANT.png | #0015 EMPIRE → 0015.png |
| 0015_EMPIRE.png | #0016 PATRIOT → 0016.png |
| 0016_PATRIOT.png | #0021 MEMPHIS → 0021.png |

The audit manifest records these associations. Names and breeds remain exactly the approved official list.

### Voting / results

- One initial user vote transaction; eligible unused NFTs are selected automatically, with optional deselection. Existing same-choice VP top-up is preserved.
- No voter reveal or points-claim UI. Backup route redirects to Voting.
- Client reuses existing owner-trusted encryption helper; only ciphertext and commitment go to the admission endpoint.
- Countdown uses on-chain opens/closes timestamps plus monotonic elapsed time; close is exclusive and zero blocks Vote. Unknown schedule displays --:--:--, never a fabricated timer.
- No interim totals/ranking are read or displayed. Finalized result requires all 22 unique IDs and complete VP/points arrays.
- Season and All-Time values are derived from finalized protocol scores, not a new scoring formula. Snapshot failures withhold the complete snapshot.
- Equal Community scores display shared ranks; the UI does not invent prize tie-break outcomes.
- Legacy wallet/history contract views are explicitly labeled, linked to new pages, and are not used as the new voting/leaderboard source.

## Remaining blockchain integration — BLOCKER

No trusted-contract deployment addresses or admission backend were provided for this frontend branch. It therefore deliberately disables wallet connection/submission and displays awaiting-configuration states. No ABI or address was invented.

The adapter and client helpers were reused from the existing local owner-trusted worktree, **not from a finalized deployment on this branch**. Their source contract snapshots were:

- HOFTrustedRace.sol SHA-256: df42f3d20080a6096d4fea92b8b9ca759c40daddde6a211a9dcff7605789bb36
- HOFTrustedLeaderboards.sol SHA-256: 15fcdbb3b50504dc95a89e5ba9bfd8829018f7198ef5e241ed9400de6b295d9e

Before enabling transactions:

1. Finalize/review the owner-trusted contract interfaces; regenerate/verify adapter ABI fragments against their actual artifacts. Those Solidity files are not included or changed here.
2. Configure actual NEXT_PUBLIC_HOF_RPC_URL, NEXT_PUBLIC_HOF_CHAIN_ID, NEXT_PUBLIC_HOF_TRUSTED_RACE and NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS. Register the race with the correct board.
3. Configure server-only HOF_ADMISSION_URL and operate the already-designed admission/decryption/complete-settlement backend. Private keys must never enter NEXT_PUBLIC variables or browser bundles.
4. Serve the real website over HTTPS for Web Crypto and test a real wallet, admission, transaction, all-ballot finalization and both boards on an approved test environment.
5. Re-run real-browser/wallet end-to-end QA after the preview JavaScript blocker below is resolved. Automated DOM interaction checks now pass.

Trust/gas: the owner can decrypt early and is trusted for outcome correctness. Structural on-chain records are not a cryptographic proof of honest decryption/scoring. Public per-wallet points can allow vote inference. Reads do not charge wallet gas; the user pays the vote transaction, the owner pays settlement. The read adapter limits RPC concurrency to 8 but reconstructs whole finalized history; up to 60×2,222 ballots is expensive in RPC bandwidth/latency. A reviewed indexed/paginated adapter is a remaining production scalability improvement. No gas cost estimate or mainnet readiness is claimed.

## Verification

| Check | Result |
| --- | --- |
| npm run lint | PASS: 0 errors, 8 warnings |
| npm run typecheck | PASS; strict TS integration, imported JS/JSX is not fully checkJs-typed |
| npm run test:frontend | PASS: 32/32 tests (including the interaction parent and its 9 subtests) |
| npm run build | PASS: Next production compilation/prerendering |
| git diff --check | PASS |
| Contracts / Tokenomics changes | None |
| Canonical dataset / source asset hash checks | 22 unique ordered IDs and all22 original hashes pass |
| Desktop Hall of Fame | 22 cards, #0001–#0022 order, all22 images loaded, no horizontal overflow |
| Desktop Voting | 22 canonical horse buttons; missing-config controls disabled; no interim results |
| Mobile layouts | Real pages in 390px iframes, no horizontal document overflow; Voting all22 images loaded |
| Race Reveal preview | Honest awaiting-complete-result state; no demo ranking |
| Automated Voting DOM interaction | PASS: actual React component mounted in JSDOM/StrictMode, real DOM clicks |
| Browser / real wallet E2E | BLOCKED / not exercised, see below |
| Live final22 result / live board update | Not exercised without actual protocol configuration |

### The eight lint warnings

| File / location | Rule | Impact and disposition |
| --- | --- | --- |
| src/app/allocations/page.tsx:102 | react-hooks/set-state-in-effect | Mount-time loader can synchronously set missing-configuration state. Extra render advisory; effect has stable empty dependencies. Non-blocking, unrelated to Voting. |
| src/app/history/page.tsx:104 | react-hooks/set-state-in-effect | Same mount-time loading pattern in the legacy archive. Extra render, not a dependency loop. Non-blocking. |
| src/app/mint/page.tsx:90 | react-hooks/set-state-in-effect | Initial sale-state loader. May add a render; no transaction is triggered by this effect. Non-blocking. |
| src/app/refund/page.tsx:61 | react-hooks/set-state-in-effect | Initial read-only sale-status refresh. May add a render; does not execute a refund. Non-blocking. |
| src/app/page.tsx:181 | @next/next/no-img-element | Left decorative reward image lacks Next image optimization. Potential bandwidth/LCP cost, not Voting correctness. Empty alt inside aria-hidden is intentional. Non-blocking. |
| src/app/page.tsx:182 | @next/next/no-img-element | Same for the right decorative reward image. Non-blocking; not an accessibility error. |
| src/components/Voting.jsx:42 | react-hooks/set-state-in-effect | Clears a stale snapshot and starts external reads on wallet/mode change. May cause an extra render. refresh depends on wallet/mode, not snapshot, so this is not a render feedback loop. Actual StrictMode interactions pass. Non-blocking. |
| src/components/Voting.jsx:42 | react-hooks/exhaustive-deps | Cleanup increments epoch.current intentionally: it is a numeric request-generation counter, not a DOM ref. Old async responses are checked against that counter; cleanup cancels the polling interval. StrictMode unmount/account-change checks pass. Non-blocking. |

Six warnings concern React hooks (two in Voting); two concern image performance. None is an accessibility-rule warning. This is not a zero-warning lint run, nor a claim that real-chain end-to-end behavior has been tested.

### Added automatic interaction evidence

web-test/voting-interaction.test.cjs mounts the actual Voting, HofHorseCard and HofHorseIdentity components with React DOM in JSDOM, using real click events. Only external wallet/RPC/admission I/O and Next image transport are replaced inside the test module. No production test flag, fake chain address or simulated result was introduced.

Checks cover exactly22 cards in canonical order with accessible names; connected eligible wallet blocked without selection; click selects #0008; switching to #0013 deselects #0008; the submit boundary receives numeric13 and the selected NFT token ID; no interim result reads/tables/per-horse totals or reveal/claim controls; account change resets eligibility; exact closing timestamp disables voting; Race Reveal withholds partial results; StrictMode cleanup removes wallet subscriptions. The initial submit handler also now checks canVote directly, in addition to the disabled button.

The dataset test explicitly compares both the id and number arrays to [1,...,22], proving no duplicate, missing or reordered canonical identity.

### Browser QA limitation

The earlier preview rendered correctly, but clicking a horse did not update the React selection state. A direct check of an observed client-script URL was rejected by the verification browser with ERR_BLOCKED_BY_CLIENT. This is not automatically an application bug. Independent automated tests now confirm selection, switching and submission-boundary behavior in the actual component. Real-browser/wallet end-to-end behavior must still be re-tested before release; do not approve deployment from these screenshots alone.

Mobile verification used iframe CSS viewports, not physical-device/wallet emulation. Screenshots show real pages without protocol fixtures. Adapter unit tests use isolated fixtures, never production demo data.

## Previews

- ../preview/hall-of-fame-desktop.jpg
- ../preview/voting-desktop.jpg
- ../preview/race-reveal-desktop.jpg
- ../preview/mobile-review.jpg

## All changed/new files

| `.gitignore` | Exclude dependencies, build output, local environment files and incremental caches. |
| `docs/frontend/FRONTEND_REVIEW.md` | This implementation and review report. |
| `docs/preview/hall-of-fame-desktop.jpg` | Browser screenshot; no simulated voting results. |
| `docs/preview/mobile-review.jpg` | Browser screenshot; no simulated voting results. |
| `docs/preview/race-reveal-desktop.jpg` | Browser screenshot; no simulated voting results. |
| `docs/preview/voting-desktop.jpg` | Browser screenshot; no simulated voting results. |
| `eslint.config.mjs` | Lint reused JSX/CJS with existing Next rules; preserve existing advisory severity. |
| `lib/owner-voting/ballot.cjs` | Reuse existing client-side encrypted ballot helper from owner-trusted work; no new cryptographic design. |
| `lib/owner-voting/countdown.cjs` | Chain timestamp countdown using monotonic elapsed time; clamp at deadline. |
| `lib/owner-voting/proxy.cjs` | Ciphertext-only, bounded same-origin proxy; rejects plaintext and unconfigured upstream. |
| `lib/owner-voting/wallet-session.cjs` | Recheck wallet/account/chain before sending after async admission. |
| `lib/owner-voting/website.cjs` | Provisional adapter from existing local trusted contracts: pinned reads, full22 validation and finalized-only board sums. |
| `next-env.d.ts` | Next-generated route type references. |
| `next.config.mjs` | Next Image qualities 75/90; source artwork is never overwritten. |
| `package-lock.json` | Lock the complete existing application's dependency graph with added ethers. |
| `package.json` | Add ethers, frontend test/typecheck scripts and Next dev wrapper; preserve existing contract scripts. |
| `public/images/hof/0001.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0002.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0003.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0004.jpeg` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0005.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0006.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0007.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0008.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0009.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0010.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0011.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0012.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0013.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0014.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0015.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0016.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0017.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0018.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0019.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0020.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0021.png` | Unmodified original portrait copied to its canonical number. |
| `public/images/hof/0022.png` | Unmodified original portrait copied to its canonical number. |
| `scripts/dev-next.cjs` | Translate preview host flags to Next.js flags; retain the existing Next framework. |
| `src/app/api/vote/admission/route.js` | Server-only admission proxy endpoint; no private decryption backend copied. |
| `src/app/hall-of-fame/page.tsx` | Dedicated official 22-horse gallery route. |
| `src/app/history/page.tsx` | Resolve horse identities through canonical dataset; label earlier testnet archive explicitly. |
| `src/app/hof.css` | Portrait aspect ratio, canonical cards, responsive gold styling, selection state and countdown. |
| `src/app/layout.tsx` | Load shared black/gold HOF styles. |
| `src/app/page.tsx` | Replace conflicting five-image HOF gallery/banner and hero with canonical artwork; preserve remaining marketing sections. |
| `src/app/race/backup/page.tsx` | Redirect obsolete reveal-secret backup UI to Voting. |
| `src/app/race/page.tsx` | Owner-trusted Voting page using shared UI. |
| `src/app/results/page.tsx` | Complete Race Reveal page using shared UI. |
| `src/app/review/page.tsx` | Development-only 390px iframe QA; notFound in production, no simulated protocol results. |
| `src/app/standings/page.tsx` | Season and All-Time pages using finalized protocol reads; no claims. |
| `src/app/voting.css` | Shared race navigation, controls, panels and tables. |
| `src/app/wallet/page.tsx` | Resolve old revealed horse identity canonically; label legacy snapshot and link to new voting/boards. |
| `src/components/HofGallery.jsx` | One gallery, used on homepage and dedicated Hall of Fame. |
| `src/components/HofHorseCard.jsx` | Canonical identity/portrait components with Next Image, contain fit and alt. |
| `src/components/HofPage.jsx` | Shared navigation and page shell. |
| `src/components/Voting.jsx` | Shared Vote/Reveal/leaderboard UI, deadline countdown, wallet session guards and explicit missing-integration states. |
| `src/data/hofHorses.json` | Only canonical horse identity dataset: id/number/name/breed/image. |
| `src/data/hofPortraitIntegrity.json` | Audit manifest linking corrected originals to canonical filenames and SHA-256; not a runtime display dataset. |
| `src/lib/hofHorses.js` | Frozen dataset exports, strict numeric lookup, formatted numbers and alt text. |
| `tsconfig.json` | Allow imported JS/JSX helpers; retain strict TypeScript settings (checkJs is not enabled). |
| `web-test/countdown.test.cjs` | 24h display, exact deadline, monotonic elapsed-time boundaries. |
| `web-test/hof-horses.test.cjs` | 22 IDs, canonical identities, paths, source hashes and five corrected file associations. |
| `web-test/trusted-adapter.test.cjs` | Adapter/proxy/wallet session tests, full result and duplicate identity rejection, finalized-only scoring. |
| `web-test/voting-interaction.test.cjs` | Actual React DOM interaction tests with external I/O isolated to tests; jsdom added as a dev dependency. |

Dependencies, .next output and incremental caches are ignored and are not proposed source changes. The original branch/worktree and all original artwork remain untouched.
