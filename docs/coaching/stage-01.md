# Coaching stage 01

## Audit and implementation plan

The existing .NET 10 modular monolith has Accounts, Access, ExerciseCatalog, Training, Media and VideoAnalysis. Accounts has one profile/workspace per identity and database business roles; onboarding currently assigns Coach. Access uses database entitlements, flags and per-request evaluation. JWT validation and private-schema API ownership remain unchanged. No Coaching module or accepted client intake exists.

1. Extend Accounts with explicit Client onboarding/self-activation, additive role/context fields, optional phone visibility and batch account projections; preserve legacy Coach onboarding and workspace IDs. Extend Access with role-aware evaluation and four Coaching features.
2. Add Coaching contracts, relationships, immutable status audit, private groups and memberships. Use owner-derived identifiers, composite foreign keys, bounded lists and version preconditions. Activation is an internal operation only.
3. Wire API/migration tooling and a separately invoked dev fixture command. Generate EF migrations, explicit runtime grants and frontend contracts. Do not change UI.
4. Test existing behavior first, then real PostgreSQL constraints, transitions, concurrency, ownership, feature loss and migration upgrades. Review SQL before applying. Apply remotely only if repository evidence positively identifies the configured target as development; otherwise verify locally and report the missing designation.

## Local decisions

- Work on `codex/coaching-stage-01` in the existing checkout so the user's uncommitted API changes remain available; preserve unrelated changes and do not publish.
- Client onboarding is explicit; omitted role retains legacy Coach behavior. Business role activation never creates a relationship. Workspace presence alone grants no authoring access.
- One ordered coach/client pair, no self relationship. No public activation endpoint, consent flag, invitations or intake substitutes.
- List group filters use match-any; use EXISTS to prevent duplicate counts. Versions are checked before retry idempotence so stale commands cannot undo newer states.
- Status policy distinguishes organizational read, protected read and write. Completed permits only historical shared-resource read in future consumers, never private library access.
- No commercial client limit exists today; report active relationship usage without inventing a quota.
- Coaching uses private schema grants and service-level authorization, not per-user RLS. Status and membership audits are durable transactional records; no broker/outbox exists or is needed without consumers.

## Account compatibility

`PUT /api/v1/me/onboarding` accepts optional `role: "Client" | "Coach"` (default Coach), `phone` and `phoneVisibleToCoach` (default false). Existing request payloads and workspace identifiers remain valid. `/me` adds `roles`, `contexts`, `phone` and `phoneVisibleToCoach`. A context is a presentation choice, never authorization state.

`POST /api/v1/me/roles/client` activates only the current onboarded account, idempotently. `PUT /api/v1/me/roles/coach/onboarding` revalidates age, accepted terms and the existing username/birth date before adding Coach. No profile operation accepts an arbitrary role array or another account ID. Phone PATCH omission preserves its value; an empty string clears it. Phone is visible in `CoachRelationshipDto.clientPhone` only with explicit sharing enabled and an owned relationship; client projections never include it.

The default feature configuration appends the four Coaching keys without removing existing grants. Every evaluation intersects entitlements/flags with current database roles. Client-only accounts cannot access authoring features even through an explicit positive override. Decisions are evaluated per request without a shared private cache.

## Access and status matrix

| Operation | Owner Coach | Related Client | Other account/admin |
| --- | --- | --- | --- |
| Organizational relationship read | `coaching.clients.view` | `coaching.relationships.read-own`, all statuses | Denied |
| Change relationship status | `coaching.clients.manage`, allowed transition + version | Denied | Denied |
| Private groups/membership | `coaching.groups.manage`; member list also requires clients.view | Denied | Denied |
| Protected read policy | clients.view | Active only | Denied |
| Historical shared read policy | clients.view | Active or Completed | Denied |
| Protected write policy | clients.manage, Active | read-own, Active | Denied |

All operations also require an active onboarded account with the relevant business role. The protected policy is a contract for future *explicitly shared* resources; it grants no access to private Training/Media libraries. Suspended client responses contain only relationship ID, coach identity, status and empty allowedActions. Internal reasons, group memberships and peer clients stay private. Foreign and unknown owned-resource IDs both return 404; missing role/feature returns 403 before resource access. There is no administrator privacy bypass.

Allowed transitions: Active -> Suspended, Suspended -> Active, Active -> Completed. Status changes append actor/time/old/new status/reason/version in the same transaction. Group membership audits are likewise durable and immutable. Completed reactivation and Suspended -> Completed return 409. A stale version returns 412 **before** considering a no-op; repeating the current state with the current ETag has no additional effect/audit. A missing ETag returns 428. This avoids a stale retry overwriting a later transition.

## API

All paths below start with `/api/v1/coaching`. Successful operations return JSON 200; versioned detail/mutation responses include `ETag`. All group changes, membership PUT/DELETE and relationship transitions require a strong numeric `If-Match`, for example `"3"`.

| Method and path | Response / input |
| --- | --- |
| GET `/clients` | Paged owner relationships, client identity, optional shared phone, dates, version, groups, status audit, allowedActions |
| GET `/clients/{id}` | Owner `CoachRelationshipDto` |
| GET `/my-coaches` | Paged minimal `ClientRelationshipDto` |
| GET `/relationships/{id}` | Owner/client projection; OpenAPI explicitly declares `oneOf` |
| POST `/relationships/{id}/suspend`, `/resume`, `/complete` | `{ "internalReason": null }` or reason up to 1000 chars; updated owner projection |
| GET `/groups` | Paged owner groups; `archived=false` by default |
| POST `/groups` | `{ "name": "...", "description": "...", "color": "#2563EB" }`; new group |
| GET `/groups/{id}` | Group metadata and allowedActions |
| PATCH `/groups/{id}` | Same editable fields as POST; updated group |
| POST `/groups/{id}/archive`, `/restore` | Updated group; no members or relationships deleted |
| GET `/groups/{id}/members` | Paged owner relationships, optional status filter |
| PUT/DELETE `/groups/{groupId}/members/{relationshipId}` | Updated group + ETag; idempotent with current version |

Lists accept `page` (1..1,000,000), `pageSize` (1..100, default 25), `search` (max 200), and allowlisted `sort`. Relationship sorting: updated/default, created, status; group sorting: updated/default, created, name. Every sort has an ID tie-breaker. Relationship lists accept Active/Suspended/Completed status. `/clients` accepts repeated `groupIds` (max 50), **match any**; EXISTS prevents duplicate totals. Search is scoped to owned relationship identities via batch Accounts projections. Group name is 1..200 characters, description max 4000, color strictly #RRGGBB. Archived groups reject new memberships until restored. Suspended/Completed relationships can remain organized in groups.

`/me/access` reports `coaching.active-clients` usage: unique Active relationships per coach. No commercial quota is configured; the existing limit shape uses `long.MaxValue` as an unbounded sentinel. Multiple groups do not increase usage.

## Storage and module boundary

`coaching.Relationships`, `Groups`, `Memberships`, `StatusChanges`, `MembershipChanges` belong to `trainflow_migrator`. A unique ordered coach/client pair and a no-self check protect activation. Composite membership foreign keys include coach/workspace; wrong-owner membership fails even below the handler. Deletes use RESTRICT. Runtime can update relationships/groups, add/remove memberships, append/read audit; it cannot update/delete audit or perform DDL. Worker, anon and authenticated have no Coaching access. The schema is private; RLS is not claimed as tenant isolation.

Coaching reads Accounts only through `IAccountContext` and batched `IAccountDirectory`. `IRelationshipAccessPolicy` is callable from internal services. `IRelationshipActivation.ActivateAcceptedApplicationAsync` is a trusted internal operation for the later intake service, which must establish genuine application acceptance before invoking it. It has no HTTP route and no current production caller. The dev wrapper uses the same activation core and marks rows `DevFixture`; it is environment-gated and never invents consent. Activation serializes each ordered pair with a PostgreSQL transaction lock and unique constraint.

## Local verification and dev scenario

Use a disposable PostgreSQL database supporting Unicode case conversion (the final run used PG17 builtin C.UTF-8). Supply secrets via environment/local ignored files. Run explicit migrations with the migrator connection, followed by `infra/runtime-grants.sql` as owner; startup does not migrate automatically.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
# Set ConnectionStrings__MigrationDatabase and TRAINFLOW_TEST_DATABASE externally.
dotnet run -c Release --project apps/api/Metrivum.Api -- --migrate
dotnet test Metrivum.slnx -c Release
./infra/export-coaching-stage01.ps1
```

For manual smoke testing, create four **test** accounts through Supabase Auth, then onboard A/B as Coach and C/D as Client using their real JWTs. The standalone executable below creates A->C, A->D, B->C, two A groups, C in both and D in the first. It reuses existing fixture rows on repetition. It never creates Auth users and is not part of API startup.

```powershell
$env:DOTNET_ENVIRONMENT = 'Development'
dotnet run -c Release --project tools/Metrivum.DevFixtures -- `
  --settings apps/api/Metrivum.Api/appsettings.Local.json `
  --confirm-project atclvdkpbccafakzpwls --confirm-test-accounts true `
  --coach-a <test-account-id> --coach-b <test-account-id> `
  --client-c <test-account-id> --client-d <test-account-id>
```

Only the recorded development project with exact pooler/user and VerifyFull, or loopback databases named with dev/test, is accepted. The runtime role must be `trainflow_api`. Production environment is rejected before connecting. For local automation, the test host alone supplies signed synthetic identities; the ordinary API retains real Supabase JWT validation. Testing ignores local application secrets and refuses non-loopback PostgreSQL.

## Applied to development

Owner explicitly confirmed project `atclvdkpbccafakzpwls` as development on 2026-10-06; recorded in `infra/development-target.json`. Host and prior EF history were inspected before writing. Applied Supabase wrapper `20261006211323_coaching_stage01_accounts_relationships_groups`, generated from:

- `20261006210202_ClientAccounts`
- `20261006210211_CoachingDefaultFeatures`
- `20261006210339_InitialCoaching`

EF histories remain authoritative. Upgrade preserved 23 then-existing profiles/workspaces/Coach roles, 482 exercises and four plans; no relationships/groups were automatically seeded remotely. Schema grants were checked after execution. Security advisor found no database warnings; its existing unrelated Auth warning is [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Baseline testing exposed an existing configuration bug: appsettings.Local.json overrode the test database and created 14 recognizable synthetic Test Coach profiles in dev. Those exact profiles (no Auth users or dependent business records) were backed up under ignored `.local/stage-01`, then removed transactionally as cleanup. The Testing configuration fix and loopback guard prevent recurrence. Existing real profiles and Auth were not removed.

## Next-stage dependencies

Offer -> form -> application -> acceptance must call the internal activation operation after real client participation. Offers, billing variants, forms, program/check-in assignments, messages and reports remain out of scope. They must reference RelationshipId and enforce the policy plus their own resource ownership/sharing rules. Status/groups currently alter no plans, files or analyses. Before connecting chat/check-in automation, add durable event delivery and membership reconciliation; the current audit is not a delivery guarantee.

## Verification results

| Check | Result |
| --- | --- |
| `dotnet build Metrivum.slnx -c Release` | Passed, zero warnings/errors |
| `dotnet test Metrivum.slnx -c Release` on local PostgreSQL 17 | 170 passed (80 unit, 88 integration, 2 architecture), 2 opt-in external tests skipped |
| Clean restricted-role migration and old-schema upgrade | Passed; original identity, workspace, plan, grants and histories preserved |
| DevFixtures console, two runs | Same three relationship IDs, no duplicate memberships/audit; Production guard rejected execution |
| Contract export + `npm run contracts` | OpenAPI/TypeScript/features regenerated, including role-dependent response union |
| `npm run typecheck` | All existing frontend workspaces passed; UI source unchanged |
| Secret patterns / `git diff --check` | Passed |
| Actual Supabase API pooler role | Relationship SELECT/INSERT/UPDATE allowed; audit UPDATE/DELETE and schema CREATE denied |
| Restarted local API | readiness 200; unauthenticated Coaching request 401 |
| `graphify update .` | Updated local code graph |

The two skipped checks require an isolated Supabase Auth/Storage instance and credentials; those integrations were not claimed as tested. HTTP ownership tests use real PostgreSQL and valid test-signed JWTs solely in the isolated Testing host. An early catalog search failure was traced to the old local database's C locale not uppercasing Polish letters; the full suite passed with Unicode-aware C.UTF-8, without changing catalog code. Test logs, TRX files, SQL exports and cleanup backup remain under ignored `.local/stage-01`.

Work remains on `codex/coaching-stage-01`, uncommitted and unpushed. User changes captured before implementation were retained. No stage 2 feature was started.
