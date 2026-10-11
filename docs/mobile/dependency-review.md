# Mobile dependency review — 2026-10-10

`npm audit --workspace @trainflow/mobile --omit=dev --json` reported **31 affected dependency nodes: 20 high, 11 moderate, 0 critical**. These are propagated nodes from four underlying advisories, not 31 independently identified application exploits. Exact local output: `.local/mobile/npm-audit.json`. Do not describe this dependency tree as audit-clean or store-ready.

| Advisory | Reachability and action |
|---|---|
| [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Metro/build-tool glob dependency; no upstream patched version listed. No public build server is deployed by this task. Reassess toolchain updates before distribution. |
| [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Expo CLI/code-signing tooling; no upstream patched version listed. No OTA signing/update service is configured. Do not infer that APK/OS signing is proven vulnerable or safe from the audit count alone. |
| [decode-uri-component malformed-input CPU exhaustion](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Router/query-string dependency, potentially relevant to external links. Patched 0.5.0 is ESM-only, while the installed query-string uses CommonJS; a blind override is not compatible evidence. Native system intents are reduced to static allowlisted routes before router query parsing. Auth independently validates and consumes the original bounded PKCE URL. This guard is tested, but does not remove the vulnerable package or replace an upstream compatible update. |
| [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Transitive xcode/build tooling. App identifiers use Expo Crypto UUIDs, not affected v3/v5/v6 buffer APIs. Requires compatible upstream dependency resolution before release. |

The configured SDK remains a coherent stable Expo 57 / RN 0.86 set. Audit suggests destructive downgrades (including Expo 44/RN 0.72) for some propagated nodes; `npm audit fix --force` was deliberately not applied. Do not add an unreviewed major override merely to reduce counts. Native deep-link normalization uses Expo's documented [system intent hook](https://docs.expo.dev/router/advanced/native-intent/); device link tests remain outstanding.
