# Independent MCP permission review, 2026-11-05

This review follows the executable `MetrivumTools` methods and their owning-module implementations in the current working tree. The 35 tools comprise 28 reads/previews and seven writes. Prior verification reports are not evidence for this review.

## Common enforcement

Every tool calls `IntegrationAccess.RequireAsync`: active, onboarded Coach; `integrations.mcp.connect`; exactly one nonempty OAuth `client_id`; an unrevoked connection belonging to the JWT subject and client; required connection grant; an `iat` at or after the connection's `TokenNotBefore`; and the feature corresponding to that grant. Owning modules independently check their domain feature, role and resource visibility. UUID possession does not authorize a resource.

Writes acquire the per-user/per-client PostgreSQL advisory transaction lock, reread consent, and use `ModuleTransaction` to commit domain writes and their Integration receipt together. Account and feature-policy state are refreshed when entering a different transaction so preflight cannot supply stale roles/active status/feature permissions to the inner authorization check. Draft receipts bind tool, connection, UUID key and payload hash. Pending actions bind owner, connection/version, type, exact immutable payload/hash, 30-minute expiry and owner approval. An executed action retry returns the stored receipt after checking current integration access. It cannot execute a different payload.

The API rejects OAuth `client_id` tokens outside exact `/mcp`; owner consent, integration administration and approval REST routes also require a regular account session. Unknown tools are absent from the executable catalog, and unsupported tool arguments are rejected. MCP has no dynamic HTTP, SQL, shell or reflection dispatch.

`Reviewed` below means the listed call path was inspected and no forbidden operation was found in that path. It is not a live-provider or exhaustive concurrency certification. Local test evidence and outstanding verification limits follow the matrix.

## All executable tools

All rows additionally require the common Coach/connection/feature checks above. Human consent to the connection grant is required for every row; the approval column describes an additional per-action human review.

| # | Tool | Connection grant | Actual domain authorization and effect | Additional human approval | Safety / indirect forbidden operation |
|---|---|---|---|---|---|
| 1 | `get_my_context` | `connect` | `IAccountContext.RequireCoachAsync`; own identity, workspace, connection, roles and grants. | No | Reviewed; read only. Returned roles do not grant capabilities. |
| 2 | `search_exercises` | `read_training` | ExerciseCatalog's normal browse visibility; shared/owned visible exercises and reviewed generator metadata; bounded page. | No | Reviewed; no catalog administration. |
| 3 | `get_exercise` | `read_training` | ExerciseCatalog `GetAsync` ownership/shared visibility; generator pool metadata. | No | Reviewed; no exercise modification or external fetch. |
| 4 | `search_programs` | `read_training` | Training library query filters owner and workspace, active `Program` kind; `training.programs.read`. | No | Reviewed; excludes other coaches and client assignments. |
| 5 | `get_program` | `read_training` | Training owner/workspace lookup plus `Program` kind; reads editor draft. | No | Reviewed; no publication or assignment. |
| 6 | `get_program_revision` | `read_training` | Owned program check followed by exact immutable revision number for the same plan. | No | Reviewed; no revision mutation. |
| 7 | `create_program_draft` | `write_training_drafts` | Training `CreateAsync`, Coach and `training.programs.create`; owned folder and document/catalog/formula validation; durable Integration receipt. | No | Reviewed; writes private draft only. Cannot publish, assign, change billing or effective prescriptions. |
| 8 | `propose_program_changes` | `read_training` | Owned program lookup and exact draft version; bounded typed patch targets must belong to existing hierarchy; backend validation. | No | Reviewed; preview only. |
| 9 | `apply_program_draft_changes` | `write_training_drafts` | Owned `Program`, `training.programs.manage`, expected version, active plan, validated document and owned folder; durable receipt. | No | Reviewed; `SaveAsync` never calls publish/revision updater. |
| 10 | `validate_program` | `read_training` | Coach and `training.programs.read`; optional owned plan; normal deterministic document/catalog/formula validator. | No | Reviewed; no save or dynamic command evaluation. |
| 11 | `search_clients` | `read_clients` | Coaching `ClientsAsync`, `coaching.clients.view`; own coach/workspace personal relationships. | No | Reviewed; reads status, never transitions it. |
| 12 | `get_client_context` | `read_clients` | Owned relationship and authorized relationship profile; six explicit programming-preference fields only. | No | Reviewed; no contact, health/private note editing, intake decisions or collaboration changes. |
| 13 | `get_client_training_history` | `read_training` + `read_clients` | Training `ScheduleAsync(view: coach)`; own relationship visibility and `HistoricalSharedRead` policy before bounded execution read. | No | Reviewed; cannot switch to the actor's Client view. |
| 14 | `get_client_programs` | `read_training` + `read_clients` | Delivery `ListAsync(view: coach)`; relationship policy and `training.progress.view-clients`; bounded assignment summaries. | No | Reviewed; no assignment status change. |
| 15 | `get_client_progress` | `read_training` + `read_clients` | Delivery progress request forces `View: coach`; relationship authorization and scoped training aggregation. | No | Reviewed; no own-client-role shortcut or writes. |
| 16 | `list_checkins` | `read_checkins` | CheckIns `RequestsAsync(..., view: coach)`; normal feature/coach/relationship scope; bounded range and status. | No | Reviewed; does not submit or review answers. |
| 17 | `get_checkin_submission` | `read_checkins` | Normal CheckIns detail policy, followed by explicit `Form.CoachId == actor` check. | No | Reviewed; cannot access a check-in merely through the actor's Client role. |
| 18 | `list_checkin_templates` | `read_checkins` | Forms `ListAsync(CheckIn)` and `forms.checkin.manage`; `CoachId == actor`, active templates only. | No | Reviewed; no application starter-form publishing path because purpose is fixed to CheckIn. |
| 19 | `get_checkin_template` | `read_checkins` | Forms owned-template lookup/feature check; explicit CheckIn purpose check. | No | Reviewed; no application form capability. |
| 20 | `create_checkin_form_draft` | `manage_checkins` | Forms `CreateAsync` with fixed CheckIn purpose, Coach, feature and definition validation; durable receipt. | No | Reviewed; creates draft only, never publishes/issues requests or changes collaboration terms. |
| 21 | `propose_checkin_assignment` | `manage_checkins` | CheckIns schedule-manage feature; normal form, active relationship/group, team and recurrence validation. | No | Reviewed; returns preview/review path with `CreatesSchedule=false`; no schedule/action/requests persisted. |
| 22 | `list_clients_needing_followup` | `read_checkins` + `read_clients` | Authorized coach overdue CheckIns query grouped by relationship; bounded range/page. | No | Reviewed; no automatic messaging or formal intake decisions. |
| 23 | `list_offers` | `read_clients` | Offers `ListAsync`; Coach and `offers.manage`; own personal offers only; projection omits billing option editing. | No | Reviewed; no prices/terms/offer-state mutation. |
| 24 | `list_leads` | `read_clients` | Coaching intake `ApplicationsAsync(coach: true)`; existing owner/feature filtering. Projection excludes answers and contact details. | No | Reviewed; does not call application accept/reject or relationship activation. |
| 25 | `get_business_analytics` | `read_finances` | Analytics forces personal scope; basic/advanced feature checks; aggregation through module-owned read contracts. | No | Reviewed; finance reads do not call payment, checkout, subscription, refund or settlement mutations. Entitlement reads are SELECTs. |
| 26 | `get_calendar_events` | `read_calendar` | Calendar `List(role: coach)` and `calendar.events.manage`; own coach/workspace or authorized active team events; redacted projection. | No | Reviewed; no Client attendee-view switch, event changes or invitation response. |
| 27 | `prepare_message` | `prepare_messages` | Messaging Coach, membership/send capability, block and introduction-consent rules; exact conversation/recipients/body frozen in a pending action. | No; preparation is private | Reviewed; sends nothing and cannot create business cards or formal decisions. |
| 28 | `list_conversations` | `read_messages` | Messaging normal actor membership/list visibility, Coach additionally required; bounded list. | No | Reviewed; Messaging threads are account-scoped, not separate Coach/Client stores. No membership administration. |
| 29 | `get_conversation` | `read_messages` | Messaging normal actor membership/visibility/capabilities; Coach additionally required. | No | Reviewed; removed/banned state does not grant send. |
| 30 | `get_messages` | `read_messages` | Messaging `HistoryAsync`; normal membership/history policy, bounded cursor/page, redacted chat projection. | No | Reviewed; no download URL, user action or card execution. Body remains untrusted data. |
| 31 | `send_approved_message` | `send_approved_messages` | Owner/connection/type/version/hash/expiry/approval checks; Messaging preview recomputes exact members/context under normal pair/preferences/conversation locks; ordinary send fixed to `MessageType.Text`, no attachments. | Yes; authenticated owner REST session, exact action version | Reviewed; cannot impersonate system/intake cards or execute their actions. Message send and receipt share one transaction; concurrent retries deduplicate. |
| 32 | `get_my_ai_preferences` | `read_training` | Own Integration programming-preference note; content returned only if owner explicitly enabled sharing. | No | Reviewed; note cannot edit permissions or integration secrets. |
| 33 | `preview_program_assignment` | `assign_programs` | Training assignment-manage feature; owned active Program and latest published revision; exactly one active owned relationship; date/timezone/occurrence validation; current assignments fingerprinted. | No; preview only | Reviewed after RT-MCP-01 fix; cannot publish, replace or cancel an assignment, select groups or bulk recipients. |
| 34 | `prepare_program_assignment` | `assign_programs` | Same domain preview, persisted as an immutable single-client pending action; UUID key binds identical request. | No; preparation is private | Reviewed after RT-MCP-01 fix; no assignment/financial/collaboration write. |
| 35 | `assign_approved_program` | `assign_programs` | Exact owner+connection pending action, grant/version/hash/expiry/approval checks; re-run preview and fingerprint; ordinary domain `AssignAsync`, single recipient, frozen latest revision, same ModuleTransaction/receipt. | Yes; authenticated owner REST session, exact action version | Reviewed after RT-MCP-01 fix; one additive assignment only. No replacement, cancellation, publication, relationship or financial changes. |

## Indirect forbidden-action trace

The seven executable writes resolve only to Training draft create/save, Forms CheckIn draft create, Integration pending-action creation, ordinary text-message send, and ordinary Training assignment creation. The latter also publishes a durable `training.assigned` notification and creates scheduled workout occurrences. None takes a payment method, price, offer option, collaboration status, role, password, MFA, account-deletion, secret, URL, SQL or command argument.

Message execution explicitly constructs `new(MessageType.Text, body, null, [])`. Business invitation/application/form-share messages are created by separate Coaching contracts; text resembling such a message does not invoke those contracts. Draft Training `SaveAsync` does not call Training publication or `AssignmentRevisionUpdater`. CheckIn assignment is a preview and never reaches schedule creation. Analytics and plan entitlement calls read billing data without invoking subscription lifecycle processing. No indirect path to the prohibited operations was identified in these traced implementations.

This is a bounded source call-graph conclusion, strengthened by the negative local protocol/ownership/action tests. It is not a claim that prompt injection is impossible: untrusted names, profile text, answers and messages can still influence a model's recommendations, while backend consent, schema and ownership checks remain authoritative.

## Finding RT-MCP-01: relationship status TOCTOU (High, fixed locally)

Location: `Training/Delivery/McpProgramAssignments.cs`, `TrainingDeliveryService.AssignAsync`, and `Coaching/Infrastructure/RelationshipRecipients.cs`.

Before the fix, active recipient resolution was an unlocked SELECT. Training's workspace/coach/assignment advisory locks were unrelated to Coaching's status-write lock. A legitimate human suspension could commit after the last active-relationship check but before the MCP assignment INSERT. The already approved action then created an assignment after suspension completed.

The regression `Relationship_suspension_cannot_commit_between_assignment_authorization_and_insert` uses the real local PostgreSQL database, normal pending-action approval, ordinary REST suspension and a fixture-specific BEFORE INSERT trigger. It holds the real assignment INSERT after authorization, then issues suspension. Before the fix it failed with `Suspension committed while a previously authorized assignment insert was still blocked.` Assignment execution still completed after the barrier was released. No domain dependency is mocked.

The minimal fix is in the owning Coaching recipient resolver: while participating in a `ModuleTransaction`, lock the selected owned relationship rows `FOR SHARE`, ordered by ID, before resolving active recipients. Ordinary status UPDATEs conflict with that lock until the caller commits. An assignment that wins serialization completes before suspension; a suspension that wins serialization makes subsequent active resolution fail. This also protects other transactional active-recipient callers without reading Coaching tables from Training. No migration or production mutation is required.

The regression passed after the fix. Existing MCP tests, including already suspended relationships, stale assignments, revoked integrations and parallel exactly-once execution, also passed.

## Finding RT-MCP-02: stale account and feature authorization after execution lock wait (High, fixed locally)

Location: `Accounts/Infrastructure/AccountContext.cs` and `Access/Infrastructure/FeatureAccessService.cs`, reached through the outer tool permission check and the inner Integration/domain mutation permission checks.

`AccountContext` originally cached active status and roles for the entire HTTP request. A tool checked them before starting its mutation transaction. If execution then waited on its Integration lock, account disablement or removal of the Coach role could commit before the inner authorization check, while that check reused the earlier snapshot. An approved assignment could therefore execute for an account already disabled before the execution lock became available.

The real PostgreSQL regression holds the normal per-user/client Integration lock on a separate connection, starts approved assignment execution and observes its actual lock wait through `pg_locks`. It then updates the account's active state in another context, commits and releases the lock. Before the fix, the assignment completed and `Assert.ThrowsAsync<ApiException>` failed because no exception was thrown. This proves the disabled-account path without mocking Accounts, consent or Training. The test also covers deleting the Coach role during the same lock window.

The minimal fix keys the existing account snapshot by the EF transaction ID. The inner check inside a new mutation transaction reads current account/role state after acquiring the Integration lock. It adds no public API, database migration or new lock. The two account/role variants now return `ACCOUNT_DISABLED` and `ONBOARDING_REQUIRED` respectively and create no assignment. Together with RT-MCP-01, the focused regression batch passed **3 tests, 0 skipped**.

Independent follow-up reproduced the same defect in the request-local Access policy cache: while execution waited on that lock, a normal AccessAdmin REST request denied either `integrations.mcp.assign-programs` or `training.assignments.manage`. The approved assignment still executed because the inner feature check reused preflight policy. Both variants failed before the Access fix; the existing account/role variants still passed (**2 failed, 2 passed, 0 skipped**). The Access policy snapshot now uses the same EF transaction boundary, retaining cache reuse inside that boundary and local-write invalidation. No additional capability or authorization bypass was introduced.

The expanded race batch then passed **5 tests, 0 skipped** in 39 seconds, covering all four account/role/integration-feature/domain-feature changes plus the relationship suspension race. This run built into ignored `.local/redteam-feature-cache` using `--artifacts-path`, independently of the main audit's concurrently running verification binaries. The database remained the same explicit disposable local target.

`Billing/Infrastructure/TeamContext.cs` was inspected for the same defect: it has no request cache and queries current membership/team/subscription state on each call. `PlanEntitlementsProvider` already keys its request cache by transaction ID. Neither needed a change for this issue.

These fixes do not hold account or feature-policy rows locked for the entire transaction. Changes occurring after the fresh inner check are not proven to cancel an operation already authorized at that check; that narrower concurrency guarantee remains explicit below.

## Local verification and limits

At the first post-fix MCP run: `dotnet test tests/Integration/Metrivum.IntegrationTests/Metrivum.IntegrationTests.csproj --no-build --no-restore --filter FullyQualifiedName~Mcp` completed with **45 passed, 0 failed, 0 skipped**. `TRAINFLOW_TEST_DATABASE` named the freshly migrated disposable database `redteam_20261105` at `127.0.0.1:55469`. No public endpoint was load-tested, mutated or attacked.

After both fixes and the expanded account/role regression, `dotnet test tests/Integration/Metrivum.IntegrationTests/Metrivum.IntegrationTests.csproj --no-build --no-restore --filter 'FullyQualifiedName~Mcp|FullyQualifiedName~CoachingPolicyTests|FullyQualifiedName~Account'` completed with **87 passed, 0 failed, 0 skipped** in 1 minute 53 seconds. The isolated three-case race batch passed against the freshly rebuilt binaries before that run. Other affected recipient-resolver callers and repository-wide verification are covered by the main audit, rather than implied by this filter.

The suite includes official MCP SDK over real TestServer HTTP for protocol versions `2025-11-25` and `2026-07-28`, real PostgreSQL action/assignment/receipt tests, foreign owner/resource checks, forged approval fields, expiry, grant changes/revocation, payload tampering, stale program/assignment state, concurrent approval execution and forbidden-operation allowlist tests. The OAuth provider handler tests are **synthetic**, including authorization subject binding and redirect checks; they do not prove deployed Supabase consent behavior or provider revocation.

**UNVERIFIED:** deployed OAuth issuer/client/resource configuration and refresh behavior; real browser account-switch races; account/feature changes after the inner transaction authorization snapshot has already been taken; every tool's full cross-role scenario over SDK; distributed deployment settings; Cloudflare/Railway behavior. The account-cache fix establishes a fresh inner check after the integration lock; it does not promise cancellation of every transaction already authorized before a concurrent revocation. HTTP JWT, REST token isolation, infrastructure and browser-specific findings belong to the main audit report. Passing local tests is not a production launch authorization.
