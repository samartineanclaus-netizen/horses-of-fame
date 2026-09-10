# V7 dependency audit — remediation proposal, not applied

Snapshot: 2026-09-10, integration worktree, unchanged package.json/package-lock.json
since the previous integration report. Command: `npm audit --omit=dev --json`.
Result: **3 high + 23 moderate = 26 affected package entries, zero critical**.
These are not 26 independent CVEs: many entries inherit the same leaf advisories.
The exact audit output, including every affected node, advisory URL, range and
recommended fix object, is preserved in `V7_DEPENDENCY_AUDIT.json`.

All 26 below are in the **production dependency graph**, not dev-only. Some also
have development dependents. Installed does not imply present/reachable in the
browser bundle or currently executed. Source inspection found HOF using ethers,
root viem HTTP and injected EIP-1193 wallet access, with no direct imports of
wagmi, AppKit, WalletConnect SDK, axios, lodash, or UUID. This narrows current
exposure; it does not certify transitively unreachable code or replace an audit.

## Exact inventory

| Package | Severity | Installed affected versions | Direct/transitive | Scope | HOF impact / reachability | Available fix / proposal |
| --- | --- | --- | --- | --- | --- | --- |
| axios | high | 1.16.0 | Transitive | Production | Node HTTP adapter can redirect requests after prior prototype pollution and interceptor cloning; HOF admission uses native HTTP/fetch and has no axios import. Exploitability is not demonstrated. | axios >=1.18.0; registry confirms 1.18.0. Re-resolve CDP transitive dependency with review. |
| lodash | high | 4.17.21 | Transitive | Production | Untrusted _.template imports can execute code; unset/omit have prototype-pollution issues. No HOF template/unset/omit usage found; lodash is also pulled by production MetaMask utilities, so not dev-only. | Patched >=4.18.0; registry latest observed 4.18.1. Review same-major minor update. |
| ws | high | 8.18.0 | Transitive | Production | Malicious WebSocket fragments can exhaust memory; a separate advisory concerns uninitialized-memory disclosure. Flagged copies belong to nested WalletConnect/viem; current HOF uses HTTP RPC, not those transports. | Patched 8.x >=8.21.0, confirmed in registry; audit proposes wagmi 3.7.7 (major). Review targeted parent update/override first. |
| @coinbase/cdp-sdk | moderate | 1.55.0 | Transitive | Production | Inherits axios HTTP-adapter risk; CDP SDK is not imported by current HOF application/admission code. | audit: fixAvailable=true, no parent version named; update/re-resolve axios to >=1.18.0. |
| @gemini-wallet/core | moderate | 0.3.2 | Transitive | Production | Inherits MetaMask utility/UUID risks through the installed Gemini connector; no current HOF connector import found. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @metamask/rpc-errors | moderate | 6.4.0, 7.0.2 | Transitive | Production | Inherits UUID risk through utilities; installed SDK error handling, not directly called by HOF. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @metamask/sdk | moderate | 0.33.1 | Transitive | Production | Inherits UUID risk via SDK/communication code; HOF currently uses injected wallet requests rather than this SDK. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @metamask/sdk-communication-layer | moderate | 0.33.1 | Transitive | Production | Inherited UUID buffer-boundary issue in an installed SDK transport; not directly used by HOF. | audit: fixAvailable=true, no parent version named; obtain SDK-compatible patched UUID >=11.1.1. |
| @metamask/utils | moderate | 11.12.1, 8.5.0, 9.3.0 | Transitive | Production | Inherited UUID issue; risky UUID v3/v5/v6 buffer calls are not present in HOF source. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @reown/appkit | moderate | 1.7.8 | Transitive | Production | Inherited WalletConnect parsing/WebSocket risks in installed connector UI; no AppKit import found in HOF. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @reown/appkit-controllers | moderate | 1.7.8 | Transitive | Production | Inherited WalletConnect transport/parser risks; controller stack not imported by HOF. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @reown/appkit-pay | moderate | 1.7.8 | Transitive | Production | Inherited controller/UI/utils risks; HOF has no AppKit Pay integration. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @reown/appkit-scaffold-ui | moderate | 1.7.8 | Transitive | Production | Inherited controller/UI/utils risks; no HOF AppKit scaffold import. | audit: fixAvailable=true, no parent version named; re-resolve aligned AppKit/WalletConnect tree after compatibility review. |
| @reown/appkit-ui | moderate | 1.7.8 | Transitive | Production | Inherited controller risks; no HOF AppKit UI import. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @reown/appkit-utils | moderate | 1.7.8 | Transitive | Production | Inherited WalletConnect/parser risks; no HOF AppKit utility import. | audit: fixAvailable=true, no parent version named; update aligned WalletConnect/viem/parser descendants. |
| @wagmi/connectors | moderate | 6.2.0 | Transitive | Production | Aggregates Gemini/MetaMask/WalletConnect findings; no connector import in current HOF source. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @walletconnect/core | moderate | 2.21.0, 2.21.1 | Transitive | Production | Inherited query parsing/ws risks; no current HOF WalletConnect transport configured. | audit: fixAvailable=true, no parent version named; update aligned utils/provider tree. |
| @walletconnect/ethereum-provider | moderate | 2.21.1 | Transitive | Production | Inherited WalletConnect/AppKit risks; current HOF wallet access uses the injected EIP-1193 provider. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @walletconnect/sign-client | moderate | 2.21.0, 2.21.1 | Transitive | Production | Inherited transport/utils findings; installed but not selected by current HOF wallet flow. | audit: fixAvailable=true, no parent version named; update aligned core/utils/provider tree. |
| @walletconnect/universal-provider | moderate | 2.21.0, 2.21.1 | Transitive | Production | Inherited transport/utils findings; no universal-provider HOF integration. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| @walletconnect/utils | moderate | 2.21.0, 2.21.1 | Transitive | Production | Inherits malformed URI decoding and nested viem/ws issues; reachable if this connector stack is enabled. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| decode-uri-component | moderate | 0.2.2 | Transitive | Production | Malformed percent-encoded input can cause exponential decoding/DoS in inherited query parsing; no direct HOF call. | 0.5.0 is available outside the affected <=0.4.2 range; audit proposes wagmi 3.7.7 (major). Check CJS/ESM compatibility; no blind override. |
| query-string | moderate | 7.1.3 | Transitive | Production | Inherits decode-uri-component DoS; no direct HOF import, present under installed WalletConnect. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| uuid | moderate | 8.3.2, 9.0.1 | Transitive | Production | Missing buffer checks in v3/v5/v6 with caller-provided buffers; no such HOF calls found. Installed SDK use still needs review if enabled. | Patched >=11.1.1 (registry confirmed); upgrading installed 8/9 copies crosses majors. Audit proposes wagmi 3.7.7; review SDK migration. |
| viem | moderate | 2.23.2 | Transitive | Production | Only nested 2.23.2 copies under WalletConnect are flagged via ws. HOF imports root viem 2.56.3 with HTTP transport; that copy is not in the affected nodes. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |
| wagmi | moderate | 2.19.5 | Direct | Production | Direct installed dependency aggregating connector vulnerabilities. No current src/lib import found; removal is a proposed separate dependency cleanup, not performed. | audit proposes wagmi 3.7.7 (major); no standalone fixed parent version supplied. Review removal of unused connector tree or an explicit SDK migration. |

## High-severity advisories and precise limits

- **axios**: fix 1.18.0. The high advisory requires Node HTTP-adapter use plus prior
  prototype pollution and request config cloning. It does not establish browser
  impact or ordinary HTTPS credential disclosure. HOF's admission/proxy does not
  use axios. [Maintainer advisory](https://github.com/advisories/GHSA-gcfj-64vw-6mp9).
- **lodash**: fix 4.18.0; 4.18.1 also available. Code injection requires unsafe
  template imports; other listed advisories concern unset/omit pollution. No such
  HOF call was found. [Maintainer advisory](https://github.com/advisories/GHSA-r5fr-rjxr-66jc).
- **ws**: fix 8.21.0 for the affected installed 8.x copies. A malicious WebSocket
  peer can cause memory exhaustion through tiny fragments. The flagged copies
  are nested in WalletConnect; HOF's current RPC path uses HTTP. This is not a
  guarantee for future WebSocket configuration.
  [Maintainer advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p).

Other leaf advisories are included verbatim as metadata in the JSON snapshot:
axios's additional request-construction/recursion/upload/proxy findings;
lodash's two unset/omit findings; ws memory disclosure; malformed URI decoding;
and UUID buffer boundaries. No exploit against HOF was demonstrated. No assertion
that mere installation exposes private decryption keys is made.

## Separate remediation proposal — approval required

1. Audit whether the unused wagmi/connectors tree can be removed while preserving
   the current injected-wallet UX. That is the smallest candidate change affecting
   the large inherited connector finding set; verify fresh install/audit/build and
   wallet interaction tests in a separate change. Do not promise a remaining count
   until that experiment is performed.
2. For retained dependencies, review same-major targeted updates: axios 1.18.0+,
   lodash 4.18.0+ (available 4.18.1), and ws 8.21.0+. Respect parent version pins;
   a forced global override is not automatically safe.
3. If broad SDK connectors are required, propose a deliberate wagmi 3.7.7
   migration with API/React peer/wallet tests. Audit suggests it as a fix but it
   is a major upgrade and has NOT been applied. UUID 8/9→11+ and query decoding
   module changes also need parent compatibility review.
4. Re-audit the production install and actual server/client deployment traces,
   then run all regressions. Evaluate development-only findings separately if
   needed; the 26-entry claim here is strictly the omit-dev audit scope.

No `npm audit fix`, force fix, dependency update, or lockfile change was performed
for this task. A registry check for guessed lodash 4.17.24 returned 404; the actual
maintainer-documented fix is 4.18.0, and the observed published latest is 4.18.1.
