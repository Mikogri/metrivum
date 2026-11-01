# Security hardening — 2026-11-01

## Release assessment: CONDITIONAL

This pass uses [ASVS 5.0 Level 2](https://asvs.owasp.org/) and [OWASP API Security Top 10](https://api-security.owasp.org/editions/2023/en/0x11-t10/) as review frameworks. It is not an ASVS certification or proof that every Level 2 requirement passes. No production deployment, remote DDL, permission changes or Auth settings changes were performed. Existing unrelated working-tree changes were preserved.

Release gates remain: resolve/accept remaining dependency risks through the release process, validate production Auth/MFA/CSP/edge settings, perform email-delivery/device acceptance, and demonstrate database plus Storage restoration. Real payment processing remains blocked until a real adapter provides idempotency, signature-verified events and reconciliation; only the simulator exists today.

## A. Findings and disposition

| ID | Priority | Evidence / impact | Change / status |
| --- | --- | --- | --- |
| AUTH-EMAIL-01 | P1 | `auth/routes/callback.tsx` accepted the email-change branch without the browser-bound initiation nonce required by ordinary sign-in. Auth SDK exchange can mutate slot credentials before the subject check. An unsolicited callback must be rejected before contacting Auth. | Initiation nonce now has its own purpose namespace, original user ID, target email, expiry and slot binding. Validate before Auth; keep the attempt for a two-link confirmation; consume on final confirmation. Account-generation checks prevent applying a late result. Regression tests pass. Real-provider email-link delivery/concurrent-tab acceptance remains unverified. |
| AUTH-PASSWORD-01 | P1 | Prior pass: `settings/routes/SignInSecurity.tsx` waited for password verification then looked up a slot client, allowing account replacement during the wait. | Existing account lifecycle fences continuation and UI results; client captured before waiting. Deferred-response regression tests pass. This does not turn a browser password check into a server policy. |
| DEP-01 | P1 | npm reports 29 affected package/parent entries: 3 high, 24 moderate, 2 low, no critical. Four root advisories are listed below. | Previously compatible Storybook/Vite/undici/Expo patch fixes retained. Remaining chains require reviewed upstream replacements/backports; incompatible blanket overrides/downgrades were not applied. Open release risk. |
| CI-HISTORY-01 | P2 | Existing `infra/scan-secrets.ps1` scanned current files only, missing a credential removed from the working tree but retained in Git history. | Add explicit full-history mode, redacted commit/path reporting, shallow-clone rejection, artifact scanning and a synthetic-history regression. CI fetches full history and runs both regression and history scan. No likely secret found by these heuristics. |
| CI-ACTIONS-01 | P2 | Workflows referenced mutable v4 tags. | Pin the five existing upstream Actions to verified v4 commit hashes. No new external scanning service was activated. |
| OPS-01 | P1 / verification gate | Production MFA, edge enforcement, restore execution, external audit retention and alert delivery cannot be established from a local checkout or restricted runtime credentials. | Required operational checks below; no fabricated pass or infrastructure changes. |

The prior notification/device query batching, recipient checks, activity-summary aggregation and pending-delivery index remain in place. They are documented in [the preceding review](production-review-2026-11-01.md); they were not reimplemented. Payment replay uses persisted client action IDs/Team quotes and existing transactional due/attempt guards; [billing documentation](../coaching/transaction-history.md) describes the boundary.

## B. Endpoint, role and resource matrix

[Generated inventory](endpoint-inventory.md): 376 HTTP operations and 75 registered capability definitions. Regenerate with `python infra/diagnostics/export-security-inventory.py` after contract changes. Runtime route discovery in `ApiBoundaryTests` also covers routes not represented by the checked-in OpenAPI. Anonymous rejection is tested across registered business verbs, with the deliberate public subscription catalogue exception.

This matrix describes the owning authorization boundary, not a claim that every verb/resource/role combination has an individual E2E test:

| Area | Authorized role / resource scope | Other account / anonymous boundary | Main regression evidence |
| --- | --- | --- | --- |
| Accounts | Authenticated subject; own profile/security settings | Exact active Auth user/session; subject is not a writable request field | AccountAccess, AccountIdentity, SupabaseAuth, ApiBoundary tests |
| Exercise catalogue | Shared catalogue reads; capability/owner checks on custom writes | Paid capability and custom ownership are server-controlled | CatalogPostgres, PlanSystemHttp tests |
| Training | Coach-owned drafts/revisions; authorized collaboration assignments; client-owned executions/purchased copies | Foreign plans/workouts/history hidden; versioned writes; frozen execution history | CrossAccountAccess, TrainingDeliveryPostgres, PlanPurchaseHttp tests |
| Coaching / Team | Coach/client participant and active/historical relationship operations; organizational case membership; Team role | Nested IDs are checked through owning contracts; membership is not blanket content access | CoachingIntake, TeamSecurity, TeamBilling, CrossAccountAccess tests |
| Forms / offers | Coach manages own templates/offers; client gets authorized frozen form/active offer | Publication, invitation, check-in and scope checked by server | Forms, CoachingIntake, OptionalForm, OfferDeletion tests |
| Billing | Payer owns due/method; coach owns settlement; Team billing Owner/Admin | Locked due + unique attempt key; payload/method binding; authoritative price/version | PlatformBilling, CanonicalPlanBilling, OffersBilling, PlanSystemHttp tests |
| Check-ins | Coach manages authorized schedules/reviews; client answers own released request | Cancelled/future/foreign requests denied; immutable answers/reviews; plan-cycle authorization | CheckIn, CrossAccountAccess tests |
| Calendar | Event owner or authorized attendee/collaboration | Nested attendee IDs and relationship status checked | Calendar tests |
| Messaging | Conversation membership and explicit conversation state | Realtime never grants membership; own message mutation and attachment checks | Messaging, CrossAccountAccess tests |
| Notifications / push | Recipient ownership, active account, preferences and source policy | Device/recipient binding, revoked accounts and active-chat suppression | Notifications, NotificationAccountRevocation, MobileBackend tests |
| Media / video | Owner or explicitly authorized relationship/share | Upload quotas, finalization, private read/delete and result version/state checks | Media, MediaAnalysisPostgres, CrossAccountAccess tests |
| Analytics | Authorized client/coach sources plus paid capabilities | Explicit relationship/group/date bounds; no aggregate from foreign sources | Analytics, AnalyticsPlanBoundary tests |
| Integrations / MCP | Authenticated subject, client/scope/consent and owning-module capability checks | OAuth redirect/client binding and revoked consent; resource tools still use module authorization | McpOAuthConsent / MCP tests |

Server JWT validation pins issuer/audience, requires expiry/signature and ES256/RS256, rejects anonymous identities and checks the exact Auth session on each request without a positive cache. Roles/business permissions come from the application database, not user-editable Auth metadata. Request DTOs and owning-module transitions constrain mass assignment; raw IDs do not establish access.

## C. Actual data-layer and live-flow evidence

Read-only inventory of the confirmed development project (`infra/diagnostics/security-catalog.sql`):

- 133 application/public table/view entries; none grants effective SELECT or write access to `anon` or `authenticated`.
- All 133 have RLS disabled. This architecture uses restricted backend roles and API row authorization, **not tenant RLS**. Do not enable RLS indiscriminately or expose schemas/grants without designing compatible runtime/worker policies. API object authorization and grant-drift tests remain essential.
- `trainflow_api`, `trainflow_worker`, `trainflow_migrator`, `anon` and `authenticated` are neither superusers nor `BYPASSRLS`/CREATEROLE/CREATEDB roles.
- `accounts.auth_session_is_active` uses `SECURITY DEFINER` with an empty search path; anon/authenticated cannot execute it. The public `rls_auto_enable` definer returns `event_trigger`, has `pg_catalog` search path and is not an ordinary Data API RPC. Its EXECUTE flag alone was not treated as an exploit.
- Actual private bucket is non-public, has a 50 MiB object limit and an explicit MIME allowlist. Server upload/finalization checks and object authorization remain required; extension alone is not trusted.

`development-auth-smoke.py` created only its own disposable Auth identity and object, then removed them. Observed: real sign-in/JWKS accepted; anonymous/tampered JWT rejected; password update accepted; old password rejected/new password accepted; global sign-out invalidated both old/new API sessions. Anonymous and unrelated authenticated Storage reads failed; a 60-second signed URL returned exactly the synthetic fixture; tampering failed. No email was sent and no Metrivum business records were created. The running development API was probed; rebuilt code is exercised separately by integration tests.

These probes do not establish production settings, all effective column grants, every RLS/RPC policy in provider-managed schemas, signed-URL expiry after waiting, real email delivery, or restore capability. Metadata inventory contains no application rows, role passwords or token values.

## D. Dependency / artifact assessment

| Root package | Finding | Reachability evidence | Compatible remediation / risk |
| --- | --- | --- | --- |
| Zod | High, oversized constrained collection allocation; inherited by Expo CLI | Not imported by application source; absent from both exported mobile source-map graphs | Upstream patched v4 changes the v3 API used by Expo CLI. Do not force a global major override. Build/development threat remains. |
| glob | Moderate, cancellation bypass | Toolchain dependency; absent from both mobile graphs | Current affected ranges span old majors; forcing a new major can alter traversal and Node/API requirements. Review upstream tool upgrades. |
| minimatch | Moderate, pattern amplification | Multiple ESLint/Expo/generator chains; absent from both mobile graphs | Older callers use different export/API shapes. Global v11 override is not compatibility-preserving. |
| deepmerge | Low, prototype poisoning | Expo/toolchain chain; absent from both mobile graphs | Registry latest observed remains affected 4.3.1; no compatible upstream patch found. Do not report suppression as remediation. |

All 29 npm entries are not necessarily distinct CVEs; parent-package propagation contributes to the count. Absence from the Android/iOS bundle does not make the build/CI supply chain safe. .NET SCA reported no vulnerable packages. Current files, all locally available Git refs and web/mobile text/source-map artifacts were scanned for known secret patterns without exposing matches. This is heuristic coverage, not an entropy-based proof or a forensic audit of deleted/unavailable refs.

Web renders application text through React; the observed `dangerouslySetInnerHTML` is a fixed motion/bootstrap script. Browser Auth remains an explicit multi-slot bearer-token architecture: moving refresh credentials into HttpOnly cookies requires a reviewed BFF/session change and CSRF tests, not a local flag. Full script CSP is deployment-specific; the checked-in static host supplies a baseline, not a verified production nonce/hash policy. Native Auth uses chunked Expo SecureStore with device-only unlocked keychain accessibility. No business authorization is delegated to cache/realtime/UI.

## E. Test results and operational gates

Final run outputs are retained under ignored `.local/hardening-*`:

| Verification | Result |
| --- | --- |
| PostgreSQL / HTTP integration | 438 passed, 0 failed, 2 skipped (440 total) |
| .NET unit / architecture | 410 / 8 passed |
| Full web Vitest | 749 passed across 154 files |
| Final callback regression rerun | 11 passed; callback-attempt and settings lifecycle: 7 passed (18 total); includes stale-generation error-screen check added after the full suite |
| Workspace TypeScript / ESLint | Passed |
| Production web build with public assets | Passed |
| Android and iOS Expo exports | Passed; no physical-device acceptance |
| Current source, Git history and exported artifact secret heuristics | Passed; synthetic removed-secret regression passed |
| Real development Auth / private Storage probe | Passed; disposable fixtures removed |
| Dependency audit | NuGet: no reported vulnerable packages; npm: 29 entries remain |

Two loopback Supabase integration cases remain skipped without a local Supabase instance; the separate authorized development probes above are not a reclassification of those skips. No commercial SAST/DAST certification or hostile production load test was performed. ESLint, compiler/SDK analyzers, SCA, secret scanning, HTTP negative tests and controlled live probes provide different evidence, not interchangeable guarantees.

Before production:

1. Confirm Supabase password-change/secure-email/redirect policies on staging and production; require TOTP/WebAuthn step-up for Team Owner/Admin and infrastructure administrators, with recovery and session-revocation tests. Do not trust browser password verification as enforcement.
2. Complete real two-link email-change/reset tests, including expired/replayed links, another browser, slot replacement during exchange, OAuth-only accounts and delayed cross-tab events. Old pending email-change links without the new nonce require a freshly initiated request.
3. Review every route's object/property policy against the inventory; expand operation-specific tests where only module-level coverage exists. The inventory is not an exhaustive 376-operation BOLA/BFLA certification.
4. Validate HTTPS, CORS origins, proxy trust, HSTS, strict CSP, secret injection and edge/WAF rules at the real host. In-memory abuse counters do not provide a shared multi-replica rate budget. Keep durable quotas/version/idempotency checks authoritative.
5. Resolve remaining dependency risks. Do not deploy the UI catalogue/dev servers publicly. Existing npm audit CI remains allowed to fail; its threshold was not weakened.
6. Review the pending Notifications index migration separately for the intended remote target. No remote migrations were applied by this audit.
7. Prove database and private-object restoration together in an isolated environment: record row/object manifests and checksums, restore ownership/grants/policies, verify application access, regenerate signed links, and measure RPO/RTO. A PostgreSQL dump alone does not restore Storage object bytes. Suggested initial objectives: RPO <= 24 hours, RTO <= 4 hours; these are targets, not measured guarantees.

### Monitoring / incident procedure

Use existing structured application logs, Supabase Auth logs and deployment metrics; retain trace/action IDs and opaque account IDs, never tokens, passwords, full signed URLs, private message content or entire request bodies. Candidate alerts, to tune on staging: >20 forbidden object accesses/account/5 min; >100 failed Auth attempts/source/5 min; >=5 idempotency-payload conflicts/5 min; any uncertain real-payment outcome; job failures >5%/15 min with >=20 jobs; DB connection occupancy >80% for 10 min. Paging and false-positive handling must be tested.

On an incident: preserve redacted evidence and correlation IDs; contain affected endpoint/provider; revoke affected sessions/credentials and rotate exposed secrets; reconcile payment receipts before retrying; restore only into isolation first; verify permissions and object integrity; document cause and recovery. Provider receipts/real payment events require signature validation, duplicate handling and ordering/reconciliation before activation. No placeholder webhook endpoint was added.
