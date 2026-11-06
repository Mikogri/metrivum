# Independent security audit and red-team review — 2026-11-05

## A. Executive summary

**Production MCP: NOT READY for an unconditional public launch.** Local fixes address confirmed authorization, account-lifetime and resource-admission defects. Real Cloudflare/Railway controls, provider CAPTCHA/OAuth enforcement and the production MFA flag have not been verified. The new hardening migrations are absent from production, confirmed by read-only history queries; they must precede the release. High dependency entries remain an explicit maintenance/reachability gate, not a clean dependency audit.

Scope: current uncommitted working tree in `C:/Work/Projects/train-flow`, compared with trusted Git HEAD `66ae2604ab59f09663d35eafd3f5c73b3fc1debb`. That commit predates the hardening; it is not proof of the currently deployed build. Existing unrelated UI/Claude changes were preserved. Old test reports were not used as security evidence. New negative tests and current source were inspected, and provider access was limited to read-only metadata/advisors. No public load testing or provider changes were performed.

Related evidence: [all 35 MCP tools](redteam-mcp-matrix.md), [resources and dependencies](redteam-resources.md), [Auth integration/configuration](turnstile.md), [deployment/rollback](public-mcp-hardening.md).

## B. Findings

### RT-AUTH-01 — Medium — stale Auth completion writes a different account into an existing slot

Location: `apps/web/app/shared/session/supabase.ts`, `manager.ts`, Auth routes and MFA completion. Root cause: the installed SDK persists/emits a successful session before resolving sign-in; checking `isCurrent` only after awaiting the SDK does not guard storage/events. Abuse: start C sign-in into slot A, switch active account to B while the network request is pending, then let C succeed. The former mocked regression skipped `completeSignIn` but missed the actual SDK side effect. Impact: account/session confusion and persistence across slots, not demonstrated server-side privilege escalation. The repair protects the actual SDK write boundary and expected identity, and handles callback/OTP/MFA lifetimes. See real installed-SDK regressions and the final verification section; live Supabase enforcement is not inferred from mocks.

### RT-MCP-01 — High — cooperation suspension can commit between assignment authorization and insert

Location: `backend/modules/Coaching/Metrivum.Coaching/Infrastructure/RelationshipRecipients.cs`, `ResolveActiveAsync`, and the ordinary Training assignment path. Real local PostgreSQL trigger paused the normal assignment INSERT after access checks. A normal REST suspension committed while the INSERT remained paused; the original assignment then completed. Fix: retain shared row locks on resolved active relationships when participating in the shared module transaction, so suspension and assignment serialize. No direct foreign-DbContext access or alternative assignment writer was introduced. Regression fails before and passes after the fix. This enforces the existing domain rule, not a new MCP-only if statement. Details and call graph: [matrix report](redteam-mcp-matrix.md).

### RT-MCP-02 — High — request authorization cache survives a mutation lock wait

Location: `backend/modules/Accounts/Metrivum.Accounts/Infrastructure/AccountContext.cs` and `backend/modules/Access/Metrivum.Access/Infrastructure/FeatureAccessService.cs`. A preflight cached active/Coach state; execution waited for the Integration advisory lock; disabling the profile/removing Coach meanwhile did not invalidate that request-local snapshot. The approved assignment succeeded with outdated rights. Fix: tie the Accounts snapshot to the current EF transaction identity so inner mutation authorization rereads state after entering the transaction/lock boundary. Real PostgreSQL regressions cover disabled profile, removed Coach role and AccessAdmin denial of either the integration feature or underlying Training feature during the lock wait. Both cached Accounts state and feature policy now refresh at the transaction boundary; no assignment is created after the fresh denial. Billing entitlements already key their cache by transaction, and Team context is uncached. This does not promise cancellation of every operation already authorized inside an ongoing transaction; normal serialization points remain explicit.

### RT-RES-01 — Medium — early analysis deletion releases still-live upload capacity

Location: `backend/modules/Media/Metrivum.Media/MediaLibrary.cs`, `ReleaseVideoAsync` and cleanup selection. Releasing the last analysis set deletion due immediately, while its signed upload capability remained valid. Cleanup could delete the object/mark the reservation deleted, then replay could recreate untracked storage. Fix: never physically delete before upload-capability expiry, both when scheduling release and centrally when selecting cleanup (including prepatch queued rows). Real PostgreSQL RED/GREEN tests cover new and legacy deletion states. They prove DB reservation/cleanup behavior; actual provider URL replay/immutability remains UNVERIFIED. See [resource report](redteam-resources.md).

### RT-RES-02 — Medium — a shared-document viewer spends the author's download budget

Location: `backend/modules/Media/Metrivum.Media/DocumentMedia.cs`, internal `Media.Contracts/IDocumentMedia.cs` and `ClientDocumentation/DocumentationService.cs`. Owner and caller were conflated. An authorized peer could exhaust the author's shared signed-download allowance. Fix passes authenticated viewer identity through the internal contract and charges that principal; ownership/visibility authorization stays separate. Regression exercises both directions of collaboration and verifies each person's independent allowance. No public HTTP contract change.

### RT-HOST-01 — Medium — 429 occurs after unlimited session DB checks

Location: `SupabaseAuthentication.OnTokenValidated`, `AbuseHttpProtection`. Signature-valid requests, including revoked sessions, hit `accounts.auth_session_is_active` before the HTTP limiter. A tiny two-request budget still executed three session checks: local RED `AuthAdmissionTests` Expected2/Actual3. Fix charges the existing per-user global budget after cryptographic/claim validation but before session SQL; after-auth middleware preserves the same 429/Retry-After through normal ProblemDetails and avoids double charging successful authentication. Invalid signatures never acquire a trusted-user partition. The admission is process-local; edge protection and shared important-operation budgets remain necessary for multiple replicas.

### RT-HOST-02 — Medium — anonymous readiness bypasses admission and reaches DB

Location: `/health/ready`, existing health exemptions. Unlike cheap liveness, readiness performs a database query, so unmetered health traffic could consume the app connection pool despite the origin health exception. Fix adds a configurable per-process readiness budget (default120/minute), two concurrent probe slots, no waiting queue and a three-second SQL command timeout. `/health/live` stays cheap and public. Local test confirms the second request is429 under a one-request test budget. Before deployment, verify actual Railway/monitor probe frequency and configure `Security__ReadinessRequestsPerMinute` accordingly (1..600); do not induce restarts with an incompatible monitor cadence.

### CFG-01 — Medium — leaked-password protection disabled (confirmed provider setting)

Read-only Supabase security advisor for `metrivum-production` (`tqkgzhtaznmymkuxjnkb`) returned `auth_leaked_password_protection` WARN. Status: **OPEN; no provider changes**. Review feature availability/plan and enable through an approved provider change. [Remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

### DEP-01 — High advisory entries, production reachability unproven — Expo/Zod chain

Current npm audit reports 25 affected package entries, including three High (`expo`, `@expo/cli`, underlying Zod); do not count wrappers as three independent root exploits. Reached through native tooling; no corresponding deployed ASP.NET/web path demonstrated. No unsafe Expo major downgrade/forced override was made. **OPEN maintenance/reachability gate.** NuGet audit across39 projects reports no vulnerable frameworks/packages; that is advisory coverage, not proof against application bugs. A stale dependency regression assuming old xcode/uuid behavior was corrected to verify current xcode/native UUID generation rather than adding an unnecessary dependency. [Evidence](redteam-resources.md).

## C. MCP permission matrix

[The matrix lists all35 actual SDK tools](redteam-mcp-matrix.md): exact grants, owning domain authorization, human approval, indirect write paths and limitations. The seven write tools are reviewed beyond their annotations. Financial/subscription writes, cooperation acceptance/termination/suspension, account/role/MFA/security administration, arbitrary SQL/HTTP/commands are not reachable through those write adapters. OAuth client tokens are also denied normal REST/realtime and human approval endpoints. This is a reviewed/tested local call graph, not a live provider OAuth certification.

User-generated messages/program/form/check-in text is treated as data. Server permission/ownership checks and immutable action receipts remain the security boundary, regardless of model instructions. MCP cannot supply a different recipient/program/action payload at execute time to change the approved operation. Assignment uses the ordinary validated domain mutation, one relationship only; it adds an assignment rather than silently canceling/replacing existing assignments.

## D. Verification

Final executed counts and separate evidence categories are recorded at the end of this report. Synthetic JWT tests use a local signing key/session validator; local domain races use real disposable PostgreSQL and normal owning services. SDK tests use the official MCP client and actual installed Supabase SDK with intercepted local network responses. Browser tests are real Chromium, but intercepted CAPTCHA/Auth is **not** PASS for provider-side CAPTCHA. Two real local Supabase Auth/Storage tests require a disposable local Supabase instance and remain explicitly skipped when unavailable.

## E. Changes and migration boundary

All confirmed findings are repaired in local source with focused regressions; no security rule was removed to make the tests pass. No additional schema migration is required for the red-team fixes themselves. Prior hardening still requires Access `20261104194425_DistributedAbuseAndAssignmentFeature`, Integrations `20261104194416_ApprovedProgramAssignments`, CheckIns `20261104194224_ScheduleStatusIndex`, followed by reviewed runtime grants. Read-only production histories confirmed all three absent on audit day. Use the existing guarded exporter/review process and obtain separate production approval.

## F. Provider facts versus release blockers

**Verified read-only in production:** project name/ref and PostgreSQL17.11; API/worker/migrator are LOGIN, not superuser/createdb/createrole/bypassrls; API is not a migrator member; zero effective browser-role SELECT/INSERT/UPDATE/DELETE grants on inspected application tables/views; both Auth boolean helpers are SECURITY DEFINER with fixed empty search_path and no browser EXECUTE; active-session helper checks email confirmation and session expiry. Private bucket `metrivum-private`: public=false,50MiB cap, no bucket MIME allowlist (API format checks are separate). Advisor leaked-password warning and the absent migration histories above are confirmed. These reads did not exercise user rows or storage mutations.

**UNVERIFIED / launch gates:**

- Actual Turnstile/Supabase CAPTCHA enforcement, absent/invalid/spent token denial, and native-client compatibility. Staging frontend override is explicit configuration, not a server bypass once provider enforcement is active.
- Production OAuth registration/PKCE/callbacks/client identity/resource-bound issuance, real assistant sessions and revocation. Missing resource claims under shared `authenticated` audience do not prove resource-bound OAuth. Stolen still-active bearer tokens are replayable until revoked/expired; there is no claimed DPoP.
- Railway `RequireSecondFactorWhenEnrolled` and other actual environment settings. Helpers exist, but repository default is false until configured; do not label production MFA enforcement PASS without reading/testing the hosting setting. Verify helper grants first, then enable under separate approval.
- Cloudflare actual DNS proxy/WAF/plan/edge credential overwrite, origin bypass protection, strict TLS, API/MCP compatible rules, monitor cadence and trusted proxy addresses. No Cloudflare/Railway administrative connection was available for this audit.
- Real SMTP/Resend/Auth quotas and direct-provider response enumeration/timing; generic UI alone is insufficient proof. Confirm the email provider settings without mass mail tests.
- Private Storage direct-role RLS/capability immutability/replay and restore drills; production was inspected read-only, not actively exploited.
- Production pool/replica/network/reconnect capacity and remaining process-local ingress/hub limits. No public load testing was authorized.
- Dependency maintenance/reachability above. Passing application tests does not close advisory entries.

Before launch: review/apply approved migrations; deploy compatible code with MCP disabled and CAPTCHA enforcement off; configure/test real keys and every supported client; verify MFA, OAuth and edge settings; perform controlled approved live smoke tests; enable MCP last. Rollback in [the runbook](public-mcp-hardening.md) preserves receipts/history and additive schema. Never remove CAPTCHA-compatible clients before turning off provider enforcement, or remove the edge rewrite while the origin credential is still enforced.

## Final verification — 2026-11-05

[Machine-readable results](independent-redteam-verification.json) distinguish provider reads from local tests. Final source builds/typechecks pass; the final Access-policy cache change was rebuilt and its MCP/account cases rerun after the complete batched inventory. Results are deduplicated by fully qualified case name, with the final authorization run replacing its older cases.

| Check | Result | What it establishes |
| --- | --- | --- |
| Backend integration inventory + final authorization overlay | 499 PASS, 0 FAIL, 2 SKIPPED (501 unique cases) | Normal local REST/domain/DB behavior and races; synthetic signed JWTs/session validator for host tests |
| Backend unit tests | 418 PASS | Deterministic rules, not provider enforcement |
| Architecture | 8 PASS | Registered module/contract boundaries |
| Full frontend Vitest | 848 PASS, 0 FAIL across168 files | Real installed SDK against controlled responses, component/session/cache behavior; not actual Supabase |
| Chromium Auth desktop/mobile | 14 PASS | Local widget/SDK wiring and delayed success/unmount; CAPTCHA/Auth network intercepted |
| Chromium integrations desktop/mobile, fresh audit rerun | 12 PASS | Local consent/review/approve/reject UI, with explicit API fixtures; not real provider OAuth |
| Node dependency regressions | 17 PASS | Current installed parser/UUID behavior; does not clear npm advisories |
| Build/typecheck | API/integration, worker, web production and web TypeScript PASS | Compilation/bundling; web build used explicit staging CAPTCHA override, not real keys |
| Lint | 0 errors, 1 pre-existing hook dependency warning in `analyzer-jobs.tsx` | Remaining warning is not reported as resolved |
| Secrets | Source pattern scan PASS | Tracked/untracked nonignored source only; not an exhaustive secret proof/history/provider audit |

The two skipped cases are the real local Supabase JWKS/password-session and private Storage upload/inspect/read/delete cases named in the JSON record. They were not replaced with mocks and counted as integration successes. Real provider token replay, OAuth exchange, CAPTCHA and production host configuration remain UNVERIFIED.

Negative reproductions intentionally failed before each repair (actual installed SDK, real PostgreSQL transactions or local HTTP probes as described above). The final run has no outstanding test failures. A legacy cleanup retry fixture was corrected to expire `UploadExpiresAt` as well as `DeleteAfter`: changing only a scheduled deletion timestamp no longer simulates expiry of a valid upload capability. Its original initial-no-delete assertion is retained and the new capability regressions independently prohibit early cleanup. An earlier all-frontend run overlapped in-progress sign-in cleanup edits and hit a UI timeout; the final current-source run passed all848 cases with two workers and unchanged test assertions/timeouts.

No new migration was introduced by these audit repairs. The three preceding hardening migrations still require separate production approval. No production deployment, DDL/DML/grant change, provider setting mutation, commit or push was performed.
