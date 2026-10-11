# TrainFlow API endpoint reference

Training assignments, schedules, actual execution and progress are described in [Stage 5 training](coaching/stage-05-training.md). See [generator](coaching/stage-05-generator.md) for preview/replace/reshuffle/draft endpoints and [documentation](coaching/stage-05-documentation.md) for relationship records and private files. Generated OpenAPI includes current DTOs, `view=coach|client`, numeric ETags and idempotency headers.

Messaging endpoints, request/response behavior, attachments and SignalR are documented in the [Stage 03A reference](coaching/messaging.md#rest-reference). The generated OpenAPI includes all Messaging REST operations; realtime payloads are in `contracts/messaging-events.ts`.

This guide describes the original API operations. Client accounts and relationships are documented in [Coaching stage 01](coaching/stage-01.md#api). Offers, forms, applications, invitations, services, check-ins and simulated billing are described in [stage 02](coaching/stage-02.md); exact current request/response schemas are in `contracts/generated/openapi.json`. Nested training semantics are in [Training](features/training.md) and [formulas and CSV](features/training-formulas-csv.md).

Jump to [Accounts](#accounts), [Access](#access), [access administration](#access-administration), [Exercises](#exercises), [tags](#exercise-tags), [dictionaries](#exercise-dictionaries), [catalog administration](#catalog-administration), [Training](#training), [Media](#media), [VideoAnalysis](#videoanalysis), [Health](#health) or [OpenAPI](#openapi-document).

## Calling the API

Use the ASP.NET host URL, for example `http://localhost:5080` locally, followed by the paths below. The Supabase project URL serves Auth/Storage, not these business endpoints. Sign in through Supabase and send `Authorization: Bearer <access-token>`. Except for health endpoints, a valid non-anonymous token is required. **Coach** means completed onboarding and an active backend Coach role. Admin permissions come from backend roles, not JWT user metadata.

Send JSON bodies as `Content-Type: application/json`. Responses use camelCase fields, string enums, UUID strings, ISO date/date-time strings and JSON numbers. Omit optional query parameters rather than sending the string `null`. Path UUIDs and revision numbers are required. Unknown JSON properties are rejected. Private responses use `Cache-Control: no-store`.

### Versions and retries

- Where documented, copy the response ETag (for example `"3"`) to `If-Match: "3"`. A stale version returns `412 VERSION_CONFLICT` for profile, Training, Media and Analysis operations.
- Exercise/catalog administration and access administration use `expectedVersion` in JSON instead. Their version conflicts return `409 VERSION_CONFLICT`.
- For idempotent operations, retain both the key and original request when retrying. Do not reuse a key with modified content or a different version. Other POST operations are not automatically idempotent.
- Training mutations that emit ETag use a quoted numeric version. Collection items expose version in JSON where applicable. Training lists use page 1..1000000 and pageSize 1..100; endpoint-specific defaults are below.
- Exercise/Training paginated objects contain `items`, `total`, `page`, `pageSize`. Media/Analysis lists, tags and exercise history return plain arrays without total counts.

### Errors

Handled application errors use `application/problem+json` with `status`, `title`, `detail`, `code`, `traceId`, `errors`. `errors` may be null; generic validation uses `errors.request`. Authentication/status-code middleware responses can omit detail/errors. Depend on status and code rather than exact messages.

| HTTP | Typical code | Meaning |
| --- | --- | --- |
| 400 | VALIDATION_FAILED | Invalid body, parameters, units, formula or mapping |
| 401 | UNAUTHENTICATED | Missing, expired or invalid token |
| 403 | ONBOARDING_REQUIRED / ACCOUNT_DISABLED / FEATURE_UNAVAILABLE / ADMIN_PERMISSION_REQUIRED | Caller cannot perform the operation |
| 404 | RESOURCE_NOT_FOUND | Missing resource; foreign private resources use the same response |
| 409 | CONFLICT / VERSION_CONFLICT / IDEMPOTENCY_CONFLICT / LIMIT_EXCEEDED | Domain conflict, catalog/access version conflict, mismatched retry or Training quota |
| 412 | VERSION_CONFLICT | Stale profile, Training, Media or Analysis version |
| 413 / 415 | LIMIT_EXCEEDED / UNSUPPORTED_MEDIA_TYPE | Oversized CSV or wrong upload content type |
| 428 | VERSION_REQUIRED / PRECONDITION_REQUIRED / IF_MATCH_REQUIRED | Required version header is missing or invalid for that module |
| 429 | RATE_LIMIT_EXCEEDED / LIMIT_EXCEEDED | Per-instance request rate or global Media/Analysis quota |
| 503 | DATABASE_UNAVAILABLE / INTEGRATION_UNAVAILABLE / ANALYZER_NOT_CONFIGURED | A dependency is unavailable |

HTTP server limits may reject requests before application error handling. A successful 202 means accepted work, not completion; 204 has no body. Do not call `response.json()` for empty 202/204 responses or CSV/PDF bytes.

Example stale-version error (messages and trace IDs vary):

```json
{
  "status": 412,
  "title": "VERSION_CONFLICT",
  "detail": "Resource changed; reload and retry.",
  "code": "VERSION_CONFLICT",
  "traceId": "request-trace-id",
  "errors": null
}
```

## Request and response examples

### Complete onboarding

`PUT /api/v1/me/onboarding`, authenticated, with JSON:

```json
{
  "username": "coach_demo",
  "displayName": "Demo Coach",
  "birthDate": "1990-01-01",
  "acceptedTerms": true,
  "locale": "en",
  "timeZone": "Europe/Warsaw"
}
```

Example **200** response with `ETag: "2"` (IDs/versions are illustrative):

```json
{
  "id": "8db154f8-10f0-4fba-9e1d-cf0e74528132",
  "workspaceId": "b41150e3-3598-466f-8313-59147438961b",
  "username": "coach_demo",
  "displayName": "Demo Coach",
  "birthDate": "1990-01-01",
  "locale": "en",
  "timeZone": "Europe/Warsaw",
  "onboarded": true,
  "version": 2
}
```

### Evaluate a built-in formula

`POST /api/v1/training/formulas/evaluate`, authenticated coach with Training read access:

```json
{
  "formulaId": null,
  "version": 1,
  "builtIn": "percentage-1rm",
  "inputs": {
    "base1Rm": { "value": 100, "unit": "Kg" },
    "percentage": { "value": 0.8, "unit": "Scalar" }
  }
}
```

**200** response:

```json
{
  "expression": "base1Rm * percentage",
  "version": 1,
  "inputs": {
    "base1Rm": { "value": 100, "unit": "Kg" },
    "percentage": { "value": 0.8, "unit": "Scalar" }
  },
  "result": { "value": 80, "unit": "Kg" }
}
```

### Import, publish and download

1. POST raw CSV to `/api/v1/training/imports/csv`; retain its `id` and ETag.
2. PUT the complete mapping to `/imports/{id}/mapping`, for example `{"exercises":{"0":"8db154f8-10f0-4fba-9e1d-cf0e74528132"}}`, using real catalog IDs and `If-Match`.
3. POST `/imports/{id}/validate`; inspect the resulting document. No program exists yet.
4. POST `/imports/{id}/commit` with `{"name":"Strength A","kind":"Program","folderId":null}`, the current import ETag and a fresh `Idempotency-Key`. Retain the returned program ID/ETag.
5. POST `/programs/{id}/revisions` with that ETag and another idempotency key; retain `number`.
6. GET `/programs/{id}/revisions/{number}/export?format=pdf`; save response bytes as a file. These abbreviated paths remain under `/api/v1/training`.

### Upload a video

POST `/api/v1/media/uploads` with `{"name":"Squat set","contentType":"video/mp4","size":1048576}` where size is the actual byte length. MP4 and WebM are supported. The default maximum is 256 MiB and the default pending reservation limit is 5; deployments can configure these.

The **201** JSON ticket has `file`, `uploadUrl`, `expiresAt`, `method`. PUT raw bytes to the signed `uploadUrl` with the declared Content-Type. This is a Storage URL; do not attach the TrainFlow bearer token to it. Then POST `/api/v1/media/{file.id}/finalize`. Request `/read-url` when playback is needed; use its `url` until `expiresAt` (default read lifetime 120 seconds). Signed URLs must be treated as temporary credentials.

## Endpoint catalog

Body/response links describe every field, nested type and enum. Query parameters marked required must be supplied. Defaults applied inside handlers are explained under Behavior. Common authentication/errors above apply throughout. Success statuses are checked against route handlers; some generated OpenAPI metadata for IResult/anonymous responses is currently less specific. The reference corrects those cases from source rather than copying misleading metadata.


## Health

### `GET /health/live`

Checks that the HTTP process is alive.

- **Access:** Public.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — `{ "status": "live" }`.

### `GET /health/ready`

Runs SELECT 1 against PostgreSQL.

- **Access:** Public.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — `{ "status": "ready" }`.
- **Behavior:** 200 means DB connectivity, not Auth/Storage/analyzer readiness. Database failure returns 503 ProblemDetails.

## Accounts

### `GET /api/v1/me`

Gets the current profile and creates its profile/workspace on first access.

- **Access:** Authenticated active user.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [ProfileResponse](api-types.md#profileresponse).
- **Behavior:** Returns ETag. Available before onboarding.

### `PATCH /api/v1/me`

Replaces editable profile settings: display name, locale and time zone.

- **Access:** Authenticated active user.
- **Query:** None.
- **Body:** [UpdateProfileRequest](api-types.md#updateprofilerequest) (application/json).
- **Returns:** **200** — [ProfileResponse](api-types.md#profileresponse).
- **Behavior:** Requires If-Match; returns ETag. Username and birth date are not editable here. Missing version: 428 PRECONDITION_REQUIRED; stale version: 412 VERSION_CONFLICT.

### `PUT /api/v1/me/onboarding`

Completes coach onboarding and assigns the server-owned Coach role.

- **Access:** Authenticated active user.
- **Query:** None.
- **Body:** [OnboardingRequest](api-types.md#onboardingrequest) (application/json).
- **Returns:** **200** — [ProfileResponse](api-types.md#profileresponse).
- **Behavior:** Requires age 18+, acceptedTerms=true and valid username/locale/timeZone. Returns ETag. Repeating the same username and birth date is safe; it returns the existing profile without overwriting settings. A different identity conflicts.

## Access

### `GET /api/v1/me/access`

Returns effective feature decisions and current resource usage.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [AccessSnapshot](api-types.md#accesssnapshot).
- **Behavior:** The version is a hash of the access snapshot, not a numeric resource ETag. A limit_reached decision is advisory; mutations reserve quotas transactionally.

### `GET /api/v1/features`

Lists all registered feature definitions, dependencies and associated limit keys.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — Array<[FeatureDefinition](api-types.md#featuredefinition)>.
- **Behavior:** Sorted by key. Describes available capabilities, not this user's grants; use /me/access for those.

## Access administration

### `PUT /api/v1/admin/access/configurations/{id}`

Creates or replaces the granted feature set of a named configuration.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** [ConfigurationRequest](api-types.md#configurationrequest) (application/json).
- **Returns:** **200** — `{ id, version, grantedFeatures: string[] }`.
- **Behavior:** Send expectedVersion=0 to create; otherwise the current version. Only registered keys are accepted; duplicates are removed. Writes an audit entry.

### `PUT /api/v1/admin/access/users/{userId}/features/{key}`

Sets an explicit per-user feature grant or denial.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** [OverrideRequest](api-types.md#overriderequest) (application/json).
- **Returns:** **200** — `{ key, granted: boolean, version }`.
- **Behavior:** expectedVersion=0 creates an override; otherwise use its current version. granted=false explicitly denies access. No endpoint removes an override. Writes an audit entry.

### `PUT /api/v1/admin/access/flags/{key}`

Enables or disables a feature globally.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** [FlagRequest](api-types.md#flagrequest) (application/json).
- **Returns:** **200** — `{ key, enabled: boolean, version }`.
- **Behavior:** expectedVersion=0 creates a flag; existing flags require their current version. A disabled flag overrides grants. Writes an audit entry.

### `PUT /api/v1/admin/access/users/{userId}/configuration`

Assigns an existing access configuration to a user ID.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** [AssignmentRequest](api-types.md#assignmentrequest) (application/json).
- **Returns:** **200** — `{ userId, configurationId, version }`.
- **Behavior:** expectedVersion=0 creates an assignment; otherwise use its current version. Writes an audit entry.

### `GET /api/v1/admin/access/users/{userId}`

Gets a user's explicit configuration assignment and feature overrides.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [UserAccessSettings](api-types.md#useraccesssettings).
- **Behavior:** An absent explicit assignment is null; the effective fallback is v1-default. This is not a resolved access snapshot or a user existence check.

### `GET /api/v1/admin/access`

Lists access configurations and operational feature flags.

- **Access:** AccessAdmin.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [AccessAdminOverview](api-types.md#accessadminoverview).
- **Behavior:** Each collection is capped at 100; there is no pagination parameter.

### `GET /api/v1/admin/access/audit`

Lists access administration audit entries, newest first.

- **Access:** AccessAdmin.
- **Query:** `page`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — Array<[AccessAuditEntry](api-types.md#accessauditentry)>.
- **Behavior:** page defaults to 1, range 1..10000; fixed page size 50. Returns a plain array. change is a JSON-encoded string, not a nested JSON object.

## Exercises

### `GET /api/v1/exercises`

Searches the shared active exercise catalog.

- **Access:** Coach + `exercises.browse`.
- **Query:** `Search`: `string`; `TagId`: `string (uuid)`; `MuscleKey`: `string`; `MovementPatternKey`: `string`; `FavoritesOnly`: `boolean` = `false`; `Sort`: `string` = `"name"`; `Page`: `integer (int32) | string (int32)` = `1`; `PageSize`: `integer (int32) | string (int32)` = `25`.
- **Body:** None.
- **Returns:** **200** — [CatalogPage](api-types.md#catalogpage).
- **Behavior:** FavoritesOnly=true additionally requires exercises.favorites. Page=1, PageSize=25 (1..100), Page<=10000. Sort: name (default), -name, createdAt, -createdAt. Filters combine with AND.

### `POST /api/v1/exercises`

Creates a shared exercise and its first revision.

- **Access:** Coach + `exercises.create`.
- **Query:** None.
- **Body:** [CreateExerciseRequest](api-types.md#createexerciserequest) (application/json).
- **Returns:** **201** — [ExerciseDto](api-types.md#exercisedto).
- **Behavior:** Returns Location. Names are normalized and unique, including archived exercises; duplicate: 409 EXERCISE_NAME_EXISTS. Referenced dictionaries must be active.

### `GET /api/v1/exercises/{id}`

Gets an exercise with tags, muscle/pattern keys and user-specific favorite/author flags.

- **Access:** Coach + `exercises.browse`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [ExerciseDto](api-types.md#exercisedto).
- **Behavior:** An archived exercise can still be retrieved by ID. version is in JSON; this route does not emit ETag.

### `PATCH /api/v1/exercises/{id}`

Updates the author's exercise description and instructions and creates a revision.

- **Access:** Coach + `exercises.create`, exercise author.
- **Query:** None.
- **Body:** [UpdateExerciseRequest](api-types.md#updateexerciserequest) (application/json).
- **Returns:** **200** — [ExerciseDto](api-types.md#exercisedto).
- **Behavior:** Send expectedVersion in JSON, not If-Match. Name, taxonomy and demonstration URL are not editable here. Archived exercise: 409 EXERCISE_ARCHIVED.

### `POST /api/v1/exercises/{id}/archive`

Archives the author's exercise and records the change.

- **Access:** Coach + `exercises.create`, exercise author.
- **Query:** None.
- **Body:** [ArchiveExerciseRequest](api-types.md#archiveexerciserequest) (application/json).
- **Returns:** **204** — No body.
- **Behavior:** Send expectedVersion in JSON. This endpoint does not unarchive.

### `GET /api/v1/exercises/{id}/history`

Lists immutable exercise revisions.

- **Access:** Coach + `exercises.browse`.
- **Query:** `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — Array<[ExerciseRevisionDto](api-types.md#exerciserevisiondto)>.
- **Behavior:** page=1, pageSize=50 (1..100), page<=10000. Plain array, newest revision first.

### `PUT /api/v1/exercises/{id}/favorite`

Adds an active exercise to the current user's favorites.

- **Access:** Coach + `exercises.favorites`.
- **Query:** None.
- **Body:** None.
- **Returns:** **204** — No body.
- **Behavior:** No body or version header; repeating the operation is safe.

### `DELETE /api/v1/exercises/{id}/favorite`

Removes an exercise from the current user's favorites.

- **Access:** Coach + `exercises.favorites`.
- **Query:** None.
- **Body:** None.
- **Returns:** **204** — No body.
- **Behavior:** No body or version header.

## Exercise tags

### `GET /api/v1/exercise-tags`

Lists searchable, non-merged exercise tags.

- **Access:** Coach + `exercises.browse`.
- **Query:** `search`: `string`.
- **Body:** None.
- **Returns:** **200** — Array<[TagDto](api-types.md#tagdto)>.
- **Behavior:** Plain array, capped at 100; no page parameter.

### `POST /api/v1/exercise-tags`

Creates a normalized shared tag.

- **Access:** Coach + `exercises.create`.
- **Query:** None.
- **Body:** [CreateTagRequest](api-types.md#createtagrequest) (application/json).
- **Returns:** **200** — [TagDto](api-types.md#tagdto).
- **Behavior:** Duplicate normalized name: 409 TAG_NAME_EXISTS.

## Exercise dictionaries

### `GET /api/v1/exercise-dictionaries`

Returns muscles and movement patterns with English/Polish labels.

- **Access:** Coach + `exercises.browse`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [DictionariesDto](api-types.md#dictionariesdto).
- **Behavior:** Use isActive to determine whether a value may be assigned to a new exercise.

## Catalog administration

### `PUT /api/v1/admin/exercise-dictionaries/{kind}/{key}`

Creates or updates a dictionary entry.

- **Access:** CatalogAdmin.
- **Query:** None.
- **Body:** [DictionaryRequest](api-types.md#dictionaryrequest) (application/json).
- **Returns:** **200** — [DictionaryEntryDto](api-types.md#dictionaryentrydto).
- **Behavior:** kind: muscles or movement-patterns. expectedVersion=0 creates an entry; otherwise use its current version.

### `POST /api/v1/admin/exercise-tags/{id}/merge`

Atomically moves tag assignments from the source tag to targetId.

- **Access:** CatalogAdmin.
- **Query:** None.
- **Body:** [MergeTagRequest](api-types.md#mergetagrequest) (application/json).
- **Returns:** **204** — No body.
- **Behavior:** The source stops appearing in normal tag lists. Already merged tags produce 409 TAG_MERGED.

## Training

Feature dependencies also require `training.programs.read`. Operations that resolve catalog exercises (create/copy/save, publication and CSV import/mapping/validation/commit) also need `exercises.browse`. Editing or publishing a Template requires `training.templates.manage`; creating/copying/importing a Template checks that capability for the target kind. Advanced set and custom formula edits are checked independently. See the [Training feature rules](features/training.md).

### `GET /api/v1/training/programs`

Lists the owner's programs and private templates without their document trees.

- **Access:** Coach + `training.programs.read`.
- **Query:** `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`; `search`: `string`; `sort`: `string`; `kind`: [DocumentKind](api-types.md#documentkind); `folderId`: `string (uuid)`; `archived`: `boolean`.
- **Body:** None.
- **Returns:** **200** — [PagedOfPlanListItem](api-types.md#pagedofplanlistitem).
- **Behavior:** page=1, pageSize=25 (1..100). sort: updated (default, newest), name, created (newest). archived=false by default; true selects archived records. kind: Program or Template. Omitting folderId searches all folders.

### `POST /api/v1/training/programs`

Creates a program or private template with a complete draft.

- **Access:** Coach + `training.programs.create`.
- **Query:** None.
- **Body:** [CreatePlanRequest](api-types.md#createplanrequest) (application/json).
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Returns ETag. Template creation also requires training.templates.manage. Advanced sets/custom formulas require their respective capabilities. Catalog exercise validation requires exercises.browse.

### `GET /api/v1/training/programs/{id}`

Gets the owner's current draft, including the full document tree.

- **Access:** Coach + `training.programs.read`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Returns ETag. This is the mutable draft, not a published revision.

### `PUT /api/v1/training/programs/{id}/draft`

Replaces draft metadata and the full document tree.

- **Access:** Coach + `training.programs.manage`.
- **Query:** None.
- **Body:** [SavePlanRequest](api-types.md#saveplanrequest) (application/json).
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Requires If-Match; returns a new ETag. Not a partial JSON patch. Cannot edit archived documents. Template/advanced-set/custom-formula checks apply; existing unchanged advanced content may remain after feature revocation.

### `POST /api/v1/training/programs/{id}/copy`

Copies the owner's current draft into a new document with fresh internal IDs.

- **Access:** Coach + `training.programs.create`.
- **Query:** None.
- **Body:** [CopyPlanRequest](api-types.md#copyplanrequest) (application/json).
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Returns ETag. Does not copy published revision history. Target Template requires training.templates.manage; copied advanced content must pass current feature checks.

### `PUT /api/v1/training/programs/{id}/archive`

Archives or restores a document using archived=true/false.

- **Access:** Coach + `training.programs.manage`.
- **Query:** None.
- **Body:** [ArchiveRequest](api-types.md#archiverequest) (application/json).
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Requires If-Match; returns ETag. Templates additionally require training.templates.manage.

### `POST /api/v1/training/programs/{id}/revisions`

Publishes an immutable private snapshot of the current draft.

- **Access:** Coach + `training.programs.manage`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [RevisionDto](api-types.md#revisiondto).
- **Behavior:** Requires If-Match and Idempotency-Key (1..128 characters). Captures exercise data and evaluated formula versions. Repeating the same key and request returns the original revision; changed input gives 409 IDEMPOTENCY_CONFLICT. Publication is not public sharing and does not increment the draft version.

### `GET /api/v1/training/programs/{id}/revisions`

Lists revision metadata without large snapshots.

- **Access:** Coach + `training.programs.read`.
- **Query:** `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — [PagedOfRevisionListItem](api-types.md#pagedofrevisionlistitem).
- **Behavior:** page=1, pageSize=25 (1..100); newest revision number first.

### `GET /api/v1/training/programs/{id}/revisions/{number}`

Gets a full immutable revision snapshot.

- **Access:** Coach + `training.programs.read`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [RevisionDto](api-types.md#revisiondto).
- **Behavior:** number identifies the published revision, not the current draft version.

### `GET /api/v1/training/programs/{id}/revisions/{number}/export`

Downloads a CSV or PDF generated from the selected immutable revision.

- **Access:** Coach + `training.programs.read` + `training.export.csv` or `training.export.pdf`.
- **Query:** `format`: `string` (required); `scope`: `string`; `scopeId`: `string (uuid)`; `delimiter`: `string`.
- **Body:** None.
- **Returns:** **200** — CSV bytes (`text/csv; charset=utf-8`) or PDF bytes (`application/pdf`).
- **Behavior:** Required format: csv or pdf. scope defaults to program; block, cycle and workout require scopeId. program forbids scopeId. delimiter defaults to comma; CSV also supports semicolon and tab (URL-encode tab as `%09`). Returns file bytes with Content-Disposition attachment, not JSON or a URL.

### `GET /api/v1/training/folders`

Lists direct child folders of parentId.

- **Access:** Coach + `training.programs.read`.
- **Query:** `parentId`: `string (uuid)`; `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — [PagedOfFolderDto](api-types.md#pagedoffolderdto).
- **Behavior:** Omitting parentId lists root folders. page=1, pageSize=25 (1..100); ordered by position then ID.

### `POST /api/v1/training/folders`

Creates an owner-scoped folder.

- **Access:** Coach + `training.folders.manage`.
- **Query:** None.
- **Body:** [FolderRequest](api-types.md#folderrequest) (application/json).
- **Returns:** **200** — [FolderDto](api-types.md#folderdto).
- **Behavior:** Returns ETag. parentId=null creates a root folder; position must be nonnegative. Depth/count limits apply.

### `PUT /api/v1/training/folders/{id}`

Renames, moves or reorders a folder.

- **Access:** Coach + `training.folders.manage`.
- **Query:** None.
- **Body:** [FolderRequest](api-types.md#folderrequest) (application/json).
- **Returns:** **200** — [FolderDto](api-types.md#folderdto).
- **Behavior:** Requires If-Match; returns ETag. Cycles and excessive nesting are rejected.

### `DELETE /api/v1/training/folders/{id}`

Deletes an empty folder.

- **Access:** Coach + `training.folders.manage`.
- **Query:** None.
- **Body:** None.
- **Returns:** **204** — No body.
- **Behavior:** Requires If-Match. Nonempty folders return 409 CONFLICT; move children/documents first.

### `GET /api/v1/training/formulas`

Lists the owner's custom formula metadata.

- **Access:** Coach + `training.programs.read`.
- **Query:** `search`: `string`; `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — [PagedOfFormulaListItem](api-types.md#pagedofformulalistitem).
- **Behavior:** page=1, pageSize=25 (1..100), optional name search. Returns metadata rather than definitions.

### `POST /api/v1/training/formulas`

Creates a custom formula and immutable version 1.

- **Access:** Coach + `training.formulas.custom`.
- **Query:** None.
- **Body:** [FormulaRequest](api-types.md#formularequest) (application/json).
- **Returns:** **200** — [FormulaDto](api-types.md#formuladto).
- **Behavior:** Returns ETag. Expression syntax, declared units and technical complexity limits are validated.

### `GET /api/v1/training/formulas/built-in`

Lists versioned built-in formula definitions.

- **Access:** Coach + `training.programs.read`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — Array<[BuiltInFormula](api-types.md#builtinformula)>.
- **Behavior:** Keys: percentage-1rm, previous-cycle-increment, top-set-back-off; current version 1.

### `GET /api/v1/training/formulas/{id}`

Gets a custom formula definition at a requested version.

- **Access:** Coach + `training.programs.read`.
- **Query:** `version`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — [FormulaDto](api-types.md#formuladto).
- **Behavior:** Omit version for latest. Returns ETag for the returned version; reload latest before editing an older version.

### `PUT /api/v1/training/formulas/{id}`

Updates a formula name and creates a new immutable definition version.

- **Access:** Coach + `training.formulas.custom`.
- **Query:** None.
- **Body:** [FormulaRequest](api-types.md#formularequest) (application/json).
- **Returns:** **200** — [FormulaDto](api-types.md#formuladto).
- **Behavior:** Requires If-Match; returns ETag. Previously referenced versions remain unchanged.

### `POST /api/v1/training/formulas/{id}/copy`

Copies the latest definition into a new custom formula.

- **Access:** Coach + `training.formulas.custom`.
- **Query:** None.
- **Body:** [FormulaCopyRequest](api-types.md#formulacopyrequest) (application/json).
- **Returns:** **200** — [FormulaDto](api-types.md#formuladto).
- **Behavior:** Returns ETag. The source must belong to the caller.

### `POST /api/v1/training/formulas/evaluate`

Evaluates a built-in or owner-scoped custom formula at a pinned version.

- **Access:** Coach + `training.programs.read`.
- **Query:** None.
- **Body:** [FormulaUse](api-types.md#formulause) (application/json).
- **Returns:** **200** — [FormulaEvaluation](api-types.md#formulaevaluation).
- **Behavior:** Using formulaId additionally requires training.formulas.custom. Returns the expression, version, supplied inputs and calculated result with its unit; it does not save a formula or modify a document.

### `POST /api/v1/training/imports/csv`

Parses CSV into a temporary import session and attempts exercise-name matching.

- **Access:** Coach + `training.import.csv`.
- **Query:** `delimiter`: `string`.
- **Body:** `string` (text/csv).
- **Returns:** **200** — [ImportPreview](api-types.md#importpreview).
- **Behavior:** Send raw UTF-8 text/csv, not multipart or JSON. delimiter defaults to comma (semicolon and tab supported; URL-encode tab as `%09`). Returns ETag and the first 100 preview rows. This does not create a program. 415 for wrong content type; 413 for excessive input.

### `GET /api/v1/training/imports/{id}`

Gets a page of an owner-scoped import preview.

- **Access:** Coach + `training.import.csv`.
- **Query:** `page`: `integer (int32) | string (int32)`; `pageSize`: `integer (int32) | string (int32)`.
- **Body:** None.
- **Returns:** **200** — [ImportPreview](api-types.md#importpreview).
- **Behavior:** Returns ETag. page=1, pageSize=100 (1..100). Expired sessions cannot be used.

### `PUT /api/v1/training/imports/{id}/mapping`

Replaces the import's complete exercise mapping.

- **Access:** Coach + `training.import.csv`.
- **Query:** None.
- **Body:** [MapImportRequest](api-types.md#mapimportrequest) (application/json).
- **Returns:** **200** — [ImportPreview](api-types.md#importpreview).
- **Behavior:** Requires If-Match; returns ETag. exercises maps zero-based CSV row indices to catalog exercise UUIDs. This replaces the mapping, not a patch.

### `POST /api/v1/training/imports/{id}/validate`

Builds and validates the mapped document without saving a program.

- **Access:** Coach + `training.import.csv`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [ImportValidation](api-types.md#importvalidation).
- **Behavior:** Success returns valid=true, the import version and document. Invalid input returns ProblemDetails, not valid=false. Advanced content and catalog permissions are checked.

### `POST /api/v1/training/imports/{id}/commit`

Atomically creates a program from the validated import.

- **Access:** Coach + `training.import.csv` + `training.programs.create`.
- **Query:** None.
- **Body:** [CommitImportRequest](api-types.md#commitimportrequest) (application/json).
- **Returns:** **200** — [PlanDto](api-types.md#plandto).
- **Behavior:** Requires If-Match and Idempotency-Key (1..128 characters); returns the new program and its ETag. Template/advanced capabilities apply. Same-key replay returns the committed program; a different request or a second commit key conflicts.

## Media

### `POST /api/v1/media/uploads`

Reserves a private video and issues a signed Storage upload URL.

- **Access:** Coach + `video.library.manage`.
- **Query:** None.
- **Body:** [UploadRequest](api-types.md#uploadrequest) (application/json).
- **Returns:** **201** — [UploadTicket](api-types.md#uploadticket).
- **Behavior:** Returns Location and a ticket containing method=PUT. Send video bytes directly to uploadUrl with the declared Content-Type, then finalize. Overwrite is forbidden. URL expires after approximately two hours; use expiresAt.

### `GET /api/v1/media`

Lists the owner's video metadata.

- **Access:** Coach.
- **Query:** `search`: `string`; `state`: `string`; `sort`: `string`; `page`: `integer (int32) | string (int32)` = `1`; `pageSize`: `integer (int32) | string (int32)` = `25`.
- **Body:** None.
- **Returns:** **200** — Array<[MediaDto](api-types.md#mediadto)>.
- **Behavior:** page=1, pageSize=25 (1..100), page<=100000. state: Pending, Ready, Deleting. sort: newest (default), oldest, name. Plain array with no total; Deleted entries are excluded.

### `GET /api/v1/media/{id}`

Gets owned video metadata.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [MediaDto](api-types.md#mediadto).
- **Behavior:** Returns ETag. The response contains no binary video or storage credentials.

### `DELETE /api/v1/media/{id}`

Schedules removal of an owned video.

- **Access:** Coach + `video.library.manage`.
- **Query:** None.
- **Body:** None.
- **Returns:** **202** — No body.
- **Behavior:** Requires If-Match. 202 means scheduled, not physically deleted. Cleanup waits for outstanding upload capability expiry. Pinned analysis sources return 409 MEDIA_IN_USE.

### `POST /api/v1/media/{id}/finalize`

Checks the stored video type, length and container header, then marks it Ready.

- **Access:** Coach + `video.library.manage`.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [MediaDto](api-types.md#mediadto).
- **Behavior:** No request body. An already Ready file returns its metadata. Returns version in JSON but no ETag header. Mismatched files are rejected.

### `POST /api/v1/media/{id}/read-url`

Issues an expiring URL for reading an owned Ready video.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [MediaReadTicket](api-types.md#mediareadticket).
- **Behavior:** No body. Verify expiresAt and request a new URL after expiry. File is rechecked in Storage. Not-ready files: 409 MEDIA_NOT_READY.

## VideoAnalysis

### `POST /api/v1/analyses`

Creates a durable analysis job for an owned Ready video.

- **Access:** Coach + `video.analysis.run`.
- **Query:** None.
- **Body:** [CreateAnalysisRequest](api-types.md#createanalysisrequest) (application/json).
- **Returns:** **202** — [AnalysisDto](api-types.md#analysisdto).
- **Behavior:** Requires Idempotency-Key (1..100 characters); returns Location. Metadata is validated and media is pinned transactionally. The supplied build has no analyzer: new valid requests return 503 ANALYZER_NOT_CONFIGURED. No simulated results are produced.

### `GET /api/v1/analyses`

Lists owned analysis metadata without trajectories.

- **Access:** Coach.
- **Query:** `search`: `string`; `status`: `string`; `tag`: `string`; `sort`: `string`; `page`: `integer (int32) | string (int32)` = `1`; `pageSize`: `integer (int32) | string (int32)` = `25`.
- **Body:** None.
- **Returns:** **200** — Array<[AnalysisDto](api-types.md#analysisdto)>.
- **Behavior:** page=1, pageSize=25 (1..100), page<=100000. status: Queued, Processing, Completed, Failed, Cancelled. sort: newest (default), oldest, name; optional name search and exact normalized tag filter. Plain array without total.

### `GET /api/v1/analyses/{id}`

Gets owned job status, attempts, metadata and failure code.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **200** — [AnalysisDto](api-types.md#analysisdto).
- **Behavior:** Returns ETag. Poll this endpoint after a 202 response. Result data has a separate endpoint.

### `PUT /api/v1/analyses/{id}`

Replaces job name, note and tags.

- **Access:** Coach + `video.library.manage`.
- **Query:** None.
- **Body:** [UpdateAnalysisRequest](api-types.md#updateanalysisrequest) (application/json).
- **Returns:** **204** — No body.
- **Behavior:** Requires If-Match. It does not replace the source video/configuration or rerun the analyzer. Fetch again to obtain the new version.

### `POST /api/v1/analyses/{id}/cancel`

Cancels a queued or processing job.

- **Access:** Coach.
- **Query:** None.
- **Body:** None.
- **Returns:** **204** — No body.
- **Behavior:** Requires If-Match. Other states return 409 CONFLICT. Worker completion is fenced against cancellation.

### `GET /api/v1/analyses/{id}/result`

Gets a completed result, optionally limited to one repetition.

- **Access:** Coach.
- **Query:** `repetition`: `integer (int32) | string (int32)`; `maxPoints`: `integer (int32) | string (int32)` = `1000`.
- **Body:** None.
- **Returns:** **200** — [AnalysisResult](api-types.md#analysisresult).
- **Behavior:** maxPoints defaults to 1000 (2..5000) and limits trajectory resolution. repetition is an optional repetition number. Incomplete job: 409 ANALYSIS_NOT_COMPLETED.

### `GET /api/v1/analyses/compare`

Returns two owned completed results after checking compatibility.

- **Access:** Coach + `video.analysis.compare`.
- **Query:** `leftId`: `string (uuid)` (required); `rightId`: `string (uuid)` (required); `leftRepetition`: `integer (int32) | string (int32)`; `rightRepetition`: `integer (int32) | string (int32)`; `maxPoints`: `integer (int32) | string (int32)` = `1000`.
- **Body:** None.
- **Returns:** **200** — [AnalysisComparison](api-types.md#analysiscomparison).
- **Behavior:** leftId/rightId are required; optional repetition numbers select individual repetitions. maxPoints=1000 (2..5000) applies to each result. It returns left/right results, not a computed difference score.

## OpenAPI document

### `GET /openapi/v1.json`

Returns **200 application/json**, the complete OpenAPI document. Requires a valid bearer token in normal API operation; the local contract-export process explicitly allows anonymous access. No body or query parameters. This route is intentionally not listed inside its own document.

## Calendar

Calendar event CRUD, cancellation, invitation responses and check-in range projections are documented in [Calendar API](coaching/calendar.md#api). Generated OpenAPI/types include these endpoints. Event updates use the event ETag; client responses use the attendee responseVersion.

### Messaging people autocomplete

`GET /api/v1/messaging/people?search=alex` returns up to 20 active, onboarded accounts matching a username prefix (minimum two characters), projected as `{ userId, username, displayName }`. Requires `messaging.direct`; excludes the caller and either-direction blocks. No private contact details are exposed. Accepting a message request atomically inserts its introduction into the resulting direct conversation exactly once.

## Stage 04

- [Notifications](coaching/notifications.md): authenticated list/count/read/read-all/preferences APIs and the user-scoped SignalR hub. `activeConversation` excludes the open chat from list/count without marking unrelated notifications read.
- [Platform subscriptions](coaching/platform-subscriptions.md): Free/Pro/Team plans, authoritative checkout, simulated payment confirmation, renewal preference and immutable history. Service payments retain their own context and endpoints.
- [Analyze](coaching/analytics.md): coach-owned overview, financial, clients, acquisition, check-ins and training availability. Date range, timezone, grouping, client group and offer revision are validated server-side; currencies are never summed together.

Generated OpenAPI and `contracts/generated/api.d.ts` define the exact request/response fields.

## Client documentation (Stage 05)

Relationship-scoped measurements, private coach notes, text documents and private upload/download endpoints are documented in [Client documentation API](coaching/stage-05-documentation.md#api). Every route authorizes current relationship status and document visibility. Client history remains readable when completed and is blocked when suspended; coach-private note/document metadata never enters client list/search responses. Document/note updates and visibility transitions require `If-Match`.

## Team and message deletion

[Team organizations](coaching/team-organizations.md#api-map) documents paid seats, roles, invitations, explicit client consent, ownership and scheduled dissolution. Team navigation remains visible in both account modes, including Free; nonmembers see invitations rather than a Team directory. [Individual subscriptions](coaching/platform-subscriptions.md#apis) retain separate checkout and renewal routes.

`DELETE /api/v1/messaging/messages/{id}` returns **200 MessageDto** with `deletedAt` set, `body=null` and an empty `attachments` array. Only the sender with access to the conversation can delete; foreign IDs return 404. Repeating deletion preserves the tombstone timestamp. Clients receive `MessageDeleted`; see [chat behavior](frontend/messaging.md#message-deletion-and-voice-recording).

## Client Details relationship-scoped reads

- `GET /api/v1/coaching/relationships/{id}/profile`: currently permitted training profile fields.
- `GET /api/v1/coaching/relationships/{id}/applications`: paginated original applications linked by services.
- `GET /api/v1/coaching/relationships/{id}/applications/{applicationId}`: immutable application/form/offer snapshot, with exact relationship check.
- `GET /api/v1/check-ins/relationships/{id}/summary`: review/overdue counters, latest request and next due date.
- `GET /api/v1/check-ins/relationships/{id}/requests/{requestId}`: authorized immutable check-in detail; does not mark reviewed.
- `GET /api/v1/training/activity-options`, `/assignment-summary`, `/last-activity`: relationship-scoped navigation options, paginated assignment progress, and real last execution.
- Existing relationship billing adds status/service/date filters and per-currency overdue/last/next settlement summary. Services include a batched current-billing projection.
- `GET /api/v1/coaching/services/current?relationshipIds=<uuid>&relationshipIds=<uuid>`: up to 100 Coach/workspace-owned relationships, authorized together. Returns `{ relationshipId, offerName, currentBilling }[]` for the latest Active service (`UpdatedAt DESC, Id ASC`), omitting relationships without one. Requires `coaching.services.manage`; a foreign/missing relationship rejects the entire request. Used by the Clients list to avoid one service request per row.

The generated OpenAPI remains the source for exact request/response contracts. See `frontend/client-details.md` for URL state and metric definitions.
