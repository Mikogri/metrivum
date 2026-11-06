# External AI assistants

Metrivum hosts the official MCP C# SDK 2.2.0 in its existing ASP.NET API at `/mcp`, using stateless Streamable HTTP. Domain operations live in owning modules and are exposed through small `.Contracts` adapters. There is no embedded chatbot or model API invocation. External assistants receive only the data authorized by the authenticated trainer, integration consent and normal resource policies.

## Configuration and connection

MCP is disabled in repository defaults. Merge `infra/mcp/appsettings.Mcp.example.json` into ignored local configuration or deployment settings; replace every example value. Use an exact public HTTPS API resource URL and web URL. HTTP loopback is accepted only in Development/Testing. Add the real API host to `AllowedHosts`. No credentials or OAuth tokens are stored in integration records. The consent proxy requires a publishable key, never a service-role/secret key.

In Supabase enable the OAuth 2.1 server, set the web Site URL and authorization path `/app/integrations/consent`, and register the external client with its real HTTPS callback. Review dynamic registration and callbacks before enabling it. The consent screen displays the provider-verified client ID/name/callback, requested identity scopes and selected Metrivum permission categories. The client name is a label, not proof of platform ownership. Supabase identity scopes do not grant Metrivum tools.

Protected-resource metadata is available at `/.well-known/oauth-protected-resource/mcp` and the root metadata path. It advertises the exact configured resource and Supabase `/auth/v1` issuer. Anonymous calls receive `WWW-Authenticate` with the resource metadata URL. Existing asymmetric JWT validation checks issuer, audience, lifetime and non-anonymous session claims; consent then binds the exact subject and `client_id`. Supabase currently issues audience `authenticated`; an explicit token `resource` claim is also checked when present. Resource-specific token issuance and live refresh behavior must be verified with the configured provider rather than assumed.

OAuth tokens cannot use normal REST or realtime endpoints to bypass MCP grants, and cannot approve actions or alter their own permissions. Revoke a connection in Settings → Integrations: local revocation applies on the next request; native provider grant revocation is best effort. Reconnection rejects access tokens issued before new consent. A provider's redirect-only auto-consent response cannot establish a new Metrivum grant and fails closed; if provider grant revocation failed, revoke that provider grant before reconnecting.

For **ChatGPT**, use a custom remote MCP app in developer mode where available. Current official guidance distinguishes Pro read/fetch from full write beta on eligible Business/Enterprise/Edu workspaces; admin controls and rollouts apply. For **Claude**, add a custom remote connector with the same public MCP URL and OAuth flow. Confirm current account eligibility. A local API alone is not a verified platform connection; use a supported secure tunnel or deploy HTTPS first. Neither platform was connected in this implementation run.

Sources checked for this stage: [official C# SDK](https://github.com/modelcontextprotocol/csharp-sdk), [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [ChatGPT developer mode](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt), [Claude connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities).

## Tools and approvals

The generated catalogue is `contracts/mcp/tools.json`. Representative tools: `get_my_context`, `search_exercises`, `search_programs`, `get_program`, `get_program_revision`, `get_client_context`, `get_client_training_history`, `list_checkins`, `get_checkin_submission`, `get_messages`, `get_business_analytics`, `get_calendar_events`, `create_program_draft`, `propose_program_changes`, `apply_program_draft_changes`, `validate_program`, `create_checkin_form_draft`, `prepare_message`, `send_approved_message`.

Arguments/results are typed; unknown fields are rejected. Pagination, date windows, request sizes and execution time are bounded. Financial totals cover the entire authorized period; details are capped and flagged. Financial output retains simulated/external settlement semantics and currencies. Missing training/profile observations are reported as missing data, not inferred measurements. Source text is untrusted content; see `METRIVUM_AI_WORKFLOW.md`.

Draft writes retain typed training hierarchy, formula DSL, exercise validation, concurrency and transactional idempotency receipts. Draft writes never publish or apply effective changes to clients. Approved single-client assignment is described below. Check-in assignment remains preview-only, including normal recipient deduplication. Publishing, deletion, actual check-in assignment, payments, video binaries and exports remain unavailable.

Preparing a message stores immutable recipients/text/context and a SHA-256 hash for 30 minutes. It creates no chat message. The owner opens its full web review link and approves or rejects in a normal Metrivum session. The assistant then executes the approved action. Execution rechecks grants, connection revision, payload, expiry, membership, blocks and conversation context. Message, receipt and action state commit in one `ModuleTransaction`; realtime dispatch runs after commit. Concurrent retries return the same persistent message ID. Only typed `SendMessage` and `AssignProgram` actions are executable; no generic command runner exists.

## Approved program assignments

| Tool | Required Metrivum grant | Effect |
| --- | --- | --- |
| `preview_program_assignment` | `assign_programs` | Domain-validated preview of one relationship, latest published revision, start date/timezone, current assignments and effects. |
| `prepare_program_assignment` | `assign_programs` | Immutable 30-minute approval action with UUID idempotency key and owner-only review link. |
| `assign_approved_program` | `assign_programs` | Execute that human-approved action through ordinary Training assignment logic; retry returns its assignment ID. |

The new grant is opt-in. Existing OAuth connections receive no additional permission. `integrations.mcp.assign-programs` uses the same paid plan entitlement policy as MCP draft writes, in addition to the current coach role and normal `training.assignments.manage` feature. A client UUID is never a relationship ID: Training resolves exactly one current active relationship in the coach's authorized workspace and verifies ownership of the latest published program. MCP cannot publish a draft or select an outdated published revision. Publication already uses normal deterministic validation; assignment also uses the ordinary schedule, exercise/formula and recipient checks.

The review identifies the client (name and ID), program (name and ID), immutable published version/revision, start date, timezone and existing active/paused assignments. This domain operation **adds** one active assignment and its scheduled workouts. It does not cancel or replace existing assignments or erase history. The owner must approve each addition even when no assignment exists. More than 100 current assignments requires manual review in Metrivum. No group IDs, recipient arrays or bulk execution are accepted.

Execution rechecks consent/client binding, grant and connection revision, immutable payload hash, expiry and human approval, program ownership/latest publication and active relationship. It compares the frozen assignment fingerprint while holding the ordinary team/workspace/coach and assignment locks through the shared `ModuleTransaction`. A second approved action prepared against the same old state fails after the first assignment; concurrent retries of the same action return the original ID. Domain assignment batch, frozen revision/formulas, planned workouts, notification and integration receipt commit together. The durable action records the OAuth connection, approving trainer, payload, timestamps and resulting assignment ID; Settings → Integrations links the receipt for review.

Settings shows separately labeled read permissions and action permissions, EN/PL assignment review, revocation, and the latest 100 persisted draft-write receipts/approval actions through the owner-only `/api/v1/me/ai-activity`. Read operations and rejected tool calls remain in structured server audit logs; they are not duplicated into the business action history. Request logs must be retained by the deployment's logging/monitoring configuration. OAuth display names are labels, never platform verification.

The closed write-tool allowlist is `create_program_draft`, `apply_program_draft_changes`, `create_checkin_form_draft`, `prepare_message`, `send_approved_message`, `prepare_program_assignment` and `assign_approved_program`. Finance/subscription/payment/refund/pricing writes, relationship lifecycle/acceptance, account/role/security changes, integration administration, arbitrary HTTP/SQL/system execution are unavailable in code and public tool contracts. Regular REST endpoints reject MCP OAuth tokens, including owner approval and connection administration; a source message or model-provided `approved` field cannot create human approval. Unknown arguments are rejected.

Additive migrations: Integrations `20261104194416_ApprovedProgramAssignments` adds nullable `AssignmentId` and expands closed check constraints; Access `20261104194425_DistributedAbuseAndAssignmentFeature` adds the explicit feature and distributed admission table. No existing consent is expanded. Use the guarded `infra/export-security-hardening.ps1` output and inspect the exact target/history before approval; do not run ordinary API startup migrations. Roll back by disabling MCP/new action permission and reverting application code while retaining the additive schema and receipts. Do not run destructive down migrations after assignment receipts exist.

Logs contain tool/user/client IDs, outcome, duration and correlation ID, not bodies, health answers or tokens. The MCP SDK's own logs are limited to Warning. Per-user/client throttling also sits behind the API's normal global limiter.

## Verification and operational status

Baseline: 219 backend unit tests and 286 web unit tests passed. Final checks: 222 backend unit tests, 8 architecture tests, 26 MCP/adapter integration cases, 39 existing messaging/consent/JWT regressions, 298 frontend unit tests, and 16 browser cases (10 integrations + 6 collaboration files, desktop/mobile) passed. Workspace type checks, lint, API build, production web build and OpenAPI export passed. Browser tests use HTTP fixtures, not live Supabase login or a physical device.

The original rollout's SDK client verified initialization, 32-tool discovery, scoped context, idempotent draft creation, validation, message preparation, rejection of forged approval, human REST approval, exactly-once send and revocation with both `2025-11-25` and `2026-07-28` protocol versions. JWTs are signed test fixtures; domain operations use real disposable PostgreSQL. A fresh database migrated successfully. That rollout's upgrade clone retained identical fingerprints for 6 plans, 53 messages and 2 check-in requests. Restricted API-role insert/read/update worked, while schema creation, deletion, migration-history access and worker access were denied.

The 2026-11-04 hardening run verified 35-tool discovery and real preview/prepare/human approval/assignment/retry with both protocol versions. The 11 approval/domain tests passed against a new disposable loopback PostgreSQL database, including four new assignment scenarios: foreign coach/client IDs, client-role and missing-grant denial; ordinary-session approval; concurrent exactly-once execution; unchanged-state fingerprint; revoked consent; suspended relationship; expired/tampered payload; and archived program. Ten additional tests passed for the closed write-tool allowlist and forbidden/injected grant rejection. Nineteen web integration unit cases, web type checking and 12 desktop/mobile browser fixtures passed. Browser checks cover exact assignment review/effects, approval, messages, consent and revocation. These are local signed-fixture/domain checks, not a live provider exchange or model prompt-injection evaluation.

Provider status was not refreshed during the hardening run; the original development project's discovery had returned `feature_disabled`. Real PKCE login, refresh/reconnect, live Supabase consent/revocation and ChatGPT/Claude sessions remain unverified. The OAuth proxy tests use a fixed fake provider; the generic MCP smoke test uses properly signed fixture JWTs and real API/domain operations on PostgreSQL, not a live OAuth exchange.

Migrations created and applied to the previously confirmed **development** project `atclvdkpbccafakzpwls`: Integrations `20261013230121_ConnectedAiIntegrations`; Access `20261014160000_IntegrationFeatures`. Live EF histories and least-privilege grants were checked after application. The private `integrations` schema has no `anon`/`authenticated` access and stores no copied business tables. Restart the API to load new code. No production deployment or app-store publication is included.

## Reproducing the checks

Run from the repository root. Build into an isolated directory if a development API is running. `TRAINFLOW_TEST_DATABASE` must name an explicitly disposable, migrated PostgreSQL database; never point it at the shared development project.

```powershell
dotnet build Metrivum.slnx --artifacts-path .local/mcp-checks
dotnet test tests/Unit/Metrivum.UnitTests --no-build --artifacts-path .local/mcp-checks
dotnet test tests/Architecture/Metrivum.ArchitectureTests --no-build --artifacts-path .local/mcp-checks
dotnet test tests/Integration/Metrivum.IntegrationTests --no-build --artifacts-path .local/mcp-checks --filter 'FullyQualifiedName~Mcp'
dotnet test tests/Integration/Metrivum.IntegrationTests --no-build --artifacts-path .local/mcp-checks --filter 'FullyQualifiedName~MessagingTests|FullyQualifiedName~JwtTests'
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run e2e:coaching --workspace @metrivum/web -- integrations.spec.ts documentation.spec.ts
& ./infra/export-contracts.ps1 -NoBuild -ArtifactsPath .local/mcp-checks
```

The browser runner also needs Node on `PATH`. The protocol test writes its live SDK catalogue when `TRAINFLOW_MCP_CATALOG_OUTPUT` names an output file; the checked-in result is `contracts/mcp/tools.json`. Export a reviewed development upgrade with `infra/mcp/export-upgrade.ps1`; it guards the known Access baseline and requires the new schema to be absent. Database migrations remain explicit and never run on ordinary API startup.

Source entry points: `apps/api/Metrivum.Api/Security/McpHosting.cs`, `backend/modules/Integrations/Metrivum.Integrations/`, and `apps/web/app/modules/integrations/`. Local operation is implemented and tested; Claude, ChatGPT read access and ChatGPT write access are each **not verified**. Check-in schedule execution/approval, optional video-result tools and export tools are deferred; check-in schedule proposals currently return a non-executing preview. Program assignment approval and execution are implemented as described above. Training, messaging, check-in, calendar and analytics source modules already exist.

## Metrivum production

Use `infra/mcp/appsettings.Mcp.production.example.json` as the production configuration reference: resource `https://api.metrivum.com/mcp`, web origin `https://metrivum.com`, Supabase project `tqkgzhtaznmymkuxjnkb`. Set `Mcp__Enabled=true`, `Mcp__PublicResourceUrl`, `Mcp__WebUrl`, `Integrations__AllowLocalHttp=false` and the project's public `Supabase__Auth__PublishableKey` in hosting configuration. Do not put a secret/service-role key in the consent proxy.

In production Supabase, enable OAuth 2.1 Server and configure Site URL `https://metrivum.com` and authorization path `/app/integrations/consent`. Register each assistant's actual HTTPS callback; the API domain is not an OAuth callback. Then connect the assistant to `https://api.metrivum.com/mcp` and verify discovery, PKCE consent and revocation with a test account. These provider settings and a real assistant session have not been configured or verified by the local build.

## Integration UI (2026-11-06)

Settings separates setup guides, backend-authorized connections, permission management and the latest 100 durable actions (ten per UI page). This is not a complete request-audit feed: rejected/read tool calls remain in server logs. Setup only explains external OAuth; copying a URL never establishes consent. Provider names are unverified labels.

The desktop/mobile app bar shares the account-scoped connection query with Settings (30-second freshness, focus refetch, mutation invalidation, no polling). The feature decision hides this entry without connect access. AccountScope remounts private state on account switches; transport fences stale responses. Active means an unrevoked backend consent with at least one grant; an unrevoked empty grant set requires attention. Revoked consents remain visible. Errors override cached status indicators. This does not test remote assistant availability or token validity. Permission changes remain explicit, versioned human-session requests; MCP cannot change its own grants. No new migration or production configuration is performed by this UI change.

UI verification: 26 integration UI unit tests and 12 Chromium desktop/mobile workflow fixtures passed; web typecheck and production build passed. ESLint has zero errors and one pre-existing analyzer-jobs effect dependency warning. Browser tests use intercepted API/OAuth fixtures, not a live assistant connection.
