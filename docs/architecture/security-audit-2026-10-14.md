# Security review — 2026-10-14

Scope: API/module trust boundaries, web/native authentication and account lifetimes, uploads/private files, messaging/notifications, MCP, analysis subprocesses, repository secrets and dependency advisories. This is source review plus automated checks, not an exhaustive penetration test or production release approval. Unrelated working-tree edits were preserved.

## Confirmed issues corrected

| Issue | Root cause and correction | Evidence |
| --- | --- | --- |
| Web login CSRF through token-hash callback | Unsolicited links could establish an attacker's session. Callback state now binds a random nonce, browser, slot, expected email and one-hour lifetime; it is consumed before Auth exchange. | Regression rejected unsolicited/substituted/replayed callbacks; valid PKCE, email and recovery paths pass. Same-browser links may open another tab. Old/cross-browser links require a new request; see `docs/frontend/hosting.md`. |
| MCP denial requests bypassed throttling of database work | Integration consent middleware ran before the limiter. Authentication now precedes rate limiting, which precedes account/consent reads. | Real host/JWT tests cover MCP and global quotas, unchanged account-check counts after 429, and CORS preflight. |
| Application secrets inherited by decoder | `ProcessStartInfo` inherited the entire worker environment. Launch now permits only required OS/runtime/accelerator variables. | Regression failed before the fix; 12 adapter tests pass, including arbitrary credential sentinels excluded from the child. This is not an OS sandbox. |
| Local credential configuration copied into artifacts | SDK default content copying included `appsettings.Local.json` in API/test outputs. `Directory.Build.targets` excludes it from output and publish for all projects. | Fresh API publication and all isolated build outputs contain no local configuration; host regression checks artifact absence. |
| Local credential files readable by other Windows users | The repository inherited broad Users/Authenticated Users permissions. The 64 existing local configuration files/copies were restricted to current user, SYSTEM and administrators. | ACLs re-read after `icacls`; original descriptors retained locally for recovery. No password values changed. This does not protect against code running as the same user or a writable-parent/code compromise. |
| Vulnerable PKCS dependency | PDFsharp requests `System.Security.Cryptography.Pkcs` 8.0.1, affected by GHSA-2fmv-rv2c-59x7 and GHSA-846f-f764-76mx. Training now pins compatible 10.0.13 centrally; lockfiles regenerated. | NuGet audit covers 39 projects and reports zero known vulnerable dependency nodes after restore. Audit warnings remain errors. |

The existing secret guard now checks untracked, non-ignored source as well as tracked files, blocks tracked private key stores, and recognizes additional credential patterns. A temporary synthetic untracked credential was detected; the file was removed. CI keeps its dependency gate and does not suppress findings.

## Secrets and live configuration

- Gitleaks 8.30.1, downloaded from its official release and verified against its published SHA-256 checksum: no findings in current tracked/untracked source, the existing generated web client bundle (3.35 MB), or all 12 commits reachable through local Git refs. All runs used full redaction. This is not proof that every possible password or external backup is safe.
- Local API/worker settings remain ignored and intentionally contain development credentials. Their values were not printed, copied into documentation, tested against unrelated services or rotated. `.env.local` files are ignored. Browser/native source and authentication/storage boundaries were reviewed for server-key exposure.
- Read-only checks on the confirmed development project `atclvdkpbccafakzpwls`: all 16 business schemas deny `anon`/`authenticated` usage; API/worker/migrator roles are not superusers, BYPASSRLS, role creators or database creators. Private schemas use application authorization, not per-user RLS; a stolen runtime database credential remains powerful.
- Storage `trainflow-private` is private with a 50 MiB object limit and an explicit MIME allowlist. Object authorization is checked before signed tickets; signed tickets themselves remain bearer capabilities until expiry.
- Supabase advisor reports leaked-password protection disabled. Enable it before public release if supported by the chosen Supabase plan: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>. No Auth settings were changed in this review.

## Follow-up dependency and integration remediation

The subsequent [dependency remediation](dependency-remediation-2026-10-14.md) resolves the four npm advisories with reviewed source backports/compatible updates and stabilizes the full integration run: **348 passed, zero failed, two local Supabase tests skipped**. The earlier dependency count and failed-run evidence below describe the initial audit, not the current dependency/test result. Native device and live-service limits still apply.

## Initial release blockers and continuing limits

- npm audit still fails: **31 affected dependency nodes (20 high, 11 moderate), four underlying advisories**. `braces` and `node-forge` have no published patched version in the checked registry; the Expo Router decode dependency requires upstream/compatibility work, while `uuid` is used through older build tooling. No forced Expo downgrade or untested major transitive override was applied.
  - <https://github.com/advisories/GHSA-vfj7-8cjw-p6xm>
  - <https://github.com/advisories/GHSA-86w9-cpqp-85rv>
  - <https://github.com/advisories/GHSA-vcc3-ghjq-m6fr>
  - <https://github.com/advisories/GHSA-w5hq-g745-h8pq>
- Decoder/ML processes retain worker OS identity and filesystem/network access. Timeout/input/output limits do not provide memory, decompression, disk or subprocess quotas. Production needs a dedicated unprivileged worker and OS/container resource and network policy.
- Native device, real email/password recovery, live OAuth/PKCE/refresh, live Storage attack scenarios, actual ML decoding and OS/native-library vulnerability checks were not exercised. Package audits do not audit the installed SDK, operating system or external MotionTrace environment.
- JWT logout revocation remains bounded by token expiry; disabled Metrivum accounts and integration revocation are checked server-side. This review did not add an online Supabase session lookup per request.
- No production deployment, remote data mutation, credential rotation or history rewrite was performed.

## Verification

Evidence is ignored under `.local/security-2026-10-14/`. Build and fresh API publish passed without warnings. Unit tests: **223 passed**; architecture: **8 passed**; frontend/native/UI: **383 passed**. The focused PostgreSQL/HTTP security suite passed **149/149**, covering JWTs, MCP/approval/role isolation, account access, request boundaries, coaching, calendar, forms, messaging and notifications. New host/artifact regressions also passed independently **6/6** (overlap with the 149, not additional unique cases). Workspace TypeScript and ESLint passed.

The attempted full PostgreSQL run encountered a Windows PostgreSQL server-process failure during `DROP DATABASE ... WITH (FORCE)`, which reset unrelated active test connections. The run was stopped after becoming unresponsive: 224 passed, 99 failed, 2 skipped, with unfinished cases. Most errors were connection/recovery failures; the legacy migration fixture also expected the pre-MCP Access revision (11 instead of 12), which was corrected along with the new feature count/assertions and passed its isolated rerun (**1/1**). This is **not** a full green suite. The separate 149-case run passed on the same recovered disposable loopback database; no shared Supabase data was used for test identities.

Reproduce with `dotnet restore --locked-mode`, an isolated `--artifacts-path`, and `dotnet test` on Unit/Architecture/Integration projects. PostgreSQL tests require `TRAINFLOW_TEST_DATABASE` pointing only to a disposable local database. Frontend checks: `npm test`, `npm run typecheck`, `npm run lint`; credential guard: `infra/scan-secrets.ps1`; dependency checks: `dotnet package list --project Metrivum.slnx --vulnerable --include-transitive --format json` and `npm audit --json`. History audit: `gitleaks git . --log-opts="--all --full-history" --redact=100`.
