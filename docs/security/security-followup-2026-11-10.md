# Security follow-up — 2026-11-10

Targeted source review of web, API trust boundaries, assigned-plan reads and the local updater; read-only production header checks. No production mutations, exploitation, code fixes or dependency updates. This is not a complete penetration test. No confirmed critical exploit or cross-account bypass was found in the reviewed paths.

## Findings

1. **P2 — updater does not restrict the signing publisher.** `tools/Metrivum.LocalAnalyzer/AnalyzerUpdate.cs:92` checks Authenticode `Status == Valid` but does not verify an expected publisher/key. SHA-256 is read from the same origin as the installer. If the download origin is compromised, an attacker could replace both manifest and installer with a different legitimately signed executable. HTTPS, bounded downloads, hash checking and signature validity already mitigate weaker attacks. Pin an approved publisher/key with an explicit rotation policy; test rejection of valid signatures from other publishers. Conditional supply-chain hardening, not an unauthenticated remote-code-execution proof.

2. **P2 — frontend CSP does not constrain scripts or connections.** `apps/web/public/_headers:5` sets frame-ancestors/object-src/base-uri/form-action, but no default-src/script-src/connect-src. Confirmed on GET https://metrivum.com (200). The policy cannot contain script execution or exfiltration if an injection is introduced. No working XSS was demonstrated. Inventory app, CAPTCHA, Supabase, SignalR and loopback-analyzer requirements, then deploy a tested CSP through Report-Only first; do not blindly block the analyzer or add unsafe-eval.

3. **P2 — HSTS absent from sampled production responses.** Read-only HTTPS GETs to https://metrivum.com and https://api.metrivum.com/health/live returned 200 without Strict-Transport-Security. This leaves initial HTTP navigation without protection provided by these responses. This check does not establish browser preload status or all edge routes. Configure HSTS at the trusted HTTPS edge after checking subdomains; do not enable includeSubDomains/preload blindly.

4. **Dependency exposure requires triage.** Current npm audit: 21 advisories (2 high, 18 moderate, 1 low), 0 critical. The high entries are zod and the dependent @expo/cli, not necessarily independent exploits. npm explain shows root tooling zod 4.6.7 and Expo CLI zod 3.25.76. Advisory https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 reports collection-validation memory exhaustion and lists a patched 4.6.6 release. Verify actual vulnerable-code reachability in the Expo tooling and an officially compatible Expo update; do not force a Zod major override into Expo or describe this as a proven API vulnerability. Full audit output: ignored `.local/security-followup-audit-bounded.json`.

## Positive checks and limits

- Assigned-plan service authorizes by assignment ownership and relationship policy before loading the effective revision; existing new integration tests cover stranger denial and private-annotation filtering. This pass inspected those guards; it did not repeat the full integration suite.
- Forwarded headers are disabled without an explicit proxy trust list; no arbitrary X-Forwarded-For trust was found in the reviewed configuration.
- Local analyzer checks exact configured browser Origin; job lookup validates UUIDs. No path-traversal proof was found in the reviewed lookups.
- Source secret-pattern scan passed for 2276 nonignored tracked/untracked source files. Ignored configuration, repository history, logs/build artifacts and provider secrets were not exhaustively audited.
- No authenticated production user flows, live OAuth, WAF rules, full .NET vulnerability audit, updater executable exploit or exhaustive endpoint/permission matrix was tested in this follow-up.
