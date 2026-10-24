# API integration map

Screen → operation → contract → required feature → handled errors → status. Types come from
`contracts/generated` through `@trainflow/api-client-web`; adapters live in each module's `api.ts`.

**Status legend.** *Implemented* means the call is wired with typed request/response, error handling and UI
states, type-checked against the generated contract and exercised in the developer mock mode. **No call has
been verified against a running Metrivum API or Supabase project in this change** (none was available);
see [api-gaps.md](api-gaps.md) for what that verification must cover.

Common to every private call: `Authorization: Bearer` of the active account, 401 → one refresh and replay for
GET only, 403 `FEATURE_UNAVAILABLE` → access snapshot refetched, 429 → message with `Retry-After`, network
failure/timeout → retry UI, `traceId` shown as a reference.

## Accounts and access

| Screen | Operation | Contract | Feature | Errors handled | Status |
| --- | --- | --- | --- | --- | --- |
| Account gate (all private screens) | `GET /api/v1/me` | → `ProfileResponse` + ETag | – | 401 session expired, 403 `ACCOUNT_DISABLED`, other → communication error | Implemented |
| Onboarding | `PUT /api/v1/me/onboarding` | `OnboardingRequest` → `ProfileResponse` | – | 400 field errors, 409 username conflict, client 18+ check | Implemented |
| Settings → profile | `PATCH /api/v1/me` + `If-Match` | `UpdateProfileRequest` → `ProfileResponse` | – | 412 → reload and retry | Implemented |
| Everywhere (gating), Settings → access | `GET /api/v1/me/access` | → `AccessSnapshot` | Coach | error → features stay closed | Implemented |

## Exercises

| Screen | Operation | Contract | Feature | Errors handled | Status |
| --- | --- | --- | --- | --- | --- |
| Exercises list | `GET /api/v1/exercises?Search&TagId&MuscleKey&MovementPatternKey&FavoritesOnly&Sort&Page&PageSize` | → `CatalogPage` | `exercises.browse` (+ `exercises.favorites` for the filter) | list error state, empty library vs no results | Implemented |
| Filters | `GET /api/v1/exercise-tags`, `GET /api/v1/exercise-dictionaries` | → `TagDto[]`, `DictionariesDto` | `exercises.browse` | – | Implemented |
| Add exercise | `POST /api/v1/exercises`, `POST /api/v1/exercise-tags` | `CreateExerciseRequest` → `ExerciseDto` | `exercises.create` | 409 `EXERCISE_NAME_EXISTS` inline, 409 `TAG_NAME_EXISTS` | Implemented |
| Exercise detail | `GET /api/v1/exercises/{id}`, `GET …/history` | → `ExerciseDto`, `ExerciseRevisionDto[]` | `exercises.browse` | 404 | Implemented |
| Edit / archive (author) | `PATCH /api/v1/exercises/{id}`, `POST …/archive` with `expectedVersion` | `UpdateExerciseRequest`, `ArchiveExerciseRequest` | `exercises.create` | 409 `VERSION_CONFLICT`, `EXERCISE_ARCHIVED` | Implemented |
| Favourite toggle | `PUT/DELETE /api/v1/exercises/{id}/favorite` | 204 | `exercises.favorites` | toast | Implemented |
| Editor / import exercise picker | `GET /api/v1/exercises?Search&PageSize=30` | `CatalogPage` | `exercises.browse` | – | Implemented |
| Editor exercise names | `GET /api/v1/exercises/{id}` per distinct ID | `ExerciseDto` | `exercises.browse` | missing shown as “—” | Implemented (N calls, see gaps) |

## Training

| Screen | Operation | Contract | Feature | Errors handled | Status |
| --- | --- | --- | --- | --- | --- |
| Programs / templates library | `GET /api/v1/training/programs?kind&folderId&search&sort&archived&page&pageSize` | → `PagedOfPlanListItem` | `training.programs.read` | list states | Implemented |
| Folder tree, folder cards | `GET /api/v1/training/folders?parentId` | → `PagedOfFolderDto` | `training.programs.read` | – | Implemented |
| Folder create / rename / move / delete | `POST`, `PUT` (+`If-Match`), `DELETE` (+`If-Match`) `/api/v1/training/folders[/{id}]` | `FolderRequest` → `FolderDto` | `training.folders.manage` | 409 not empty, 400 cycle/depth | Implemented |
| New program / template | `POST /api/v1/training/programs` | `CreatePlanRequest` (empty document) → `PlanDto` | `training.programs.create` (+ `training.templates.manage`) | dialog error | Implemented |
| Copy / use template | `POST /api/v1/training/programs/{id}/copy` | `CopyPlanRequest` → `PlanDto` | `training.programs.create` | dialog error | Implemented |
| Move to folder | `GET …/programs/{id}` then `PUT …/draft` (+`If-Match`) | `SavePlanRequest` | `training.programs.manage` | 412 | Implemented (see gaps) |
| Archive / restore | `PUT /api/v1/training/programs/{id}/archive` (+`If-Match`) | `ArchiveRequest` → `PlanDto` | `training.programs.manage` | toast | Implemented |
| Program detail | `GET …/programs/{id}`, `GET …/revisions` | `PlanDto`, `PagedOfRevisionListItem` | `training.programs.read` | 404 | Implemented |
| Editor load | `GET …/programs/{id}` (fresh on open, no background refetch) | `PlanDto` + ETag | `training.programs.read`; editing needs `training.programs.manage` (+ templates) | 404 | Implemented |
| Editor save / autosave | `PUT …/programs/{id}/draft` + `If-Match` | `SavePlanRequest` → `PlanDto` + ETag | `training.programs.manage`, `training.sets.advanced`, `training.formulas.custom`, `exercises.browse` | 412 conflict dialog, 400 validation banner (server detail), network → offline | Implemented |
| Publish | `POST …/programs/{id}/revisions` + `If-Match` + `Idempotency-Key` (kept for retries) | → `RevisionDto` | `training.programs.manage` | 409 `IDEMPOTENCY_CONFLICT` | Implemented |
| Export | `GET …/revisions/{n}?` (scope items) and `GET …/revisions/{n}/export?format&scope&scopeId&delimiter` | `RevisionDto`; CSV/PDF bytes | `training.export.csv` / `training.export.pdf` | download error on the file card, abort on close | Implemented |
| Formulas | `GET /formulas`, `GET /formulas/built-in`, `GET/PUT /formulas/{id}` (+`If-Match`), `POST /formulas`, `POST /formulas/{id}/copy` | `FormulaDto`, `FormulaRequest`, `BuiltInFormula` | read: `training.programs.read`; write: `training.formulas.custom` | 400 with server detail | Implemented |
| Formula evaluation (formulas page, editor) | `POST /api/v1/training/formulas/evaluate` | `FormulaUse` → `FormulaEvaluation` | `training.programs.read` (+ custom) | inline error | Implemented |
| CSV import | `POST /imports/csv` (raw `text/csv`, delimiter), `GET /imports/{id}?page`, `PUT /imports/{id}/mapping` (+`If-Match`), `POST /imports/{id}/validate`, `POST /imports/{id}/commit` (+`If-Match` + `Idempotency-Key`) | `ImportPreview`, `MapImportRequest`, `ImportValidation`, `CommitImportRequest` → `PlanDto` | `training.import.csv`, `training.programs.create` | 413/415, expired session (404), validation detail | Implemented |

## Media and analysis

| Screen | Operation | Contract | Feature | Errors handled | Status |
| --- | --- | --- | --- | --- | --- |
| Analyses list | `GET /api/v1/analyses?search&status&tag&sort&page&pageSize` | → `AnalysisDto[]` | Coach | list states | Implemented |
| Videos tab | `GET /api/v1/media?sort&page&pageSize`, `DELETE /api/v1/media/{id}` (+`If-Match`) | `MediaDto[]`, 202 | delete: `video.library.manage` | 409 `MEDIA_IN_USE` | Implemented |
| New analysis | `POST /api/v1/media/uploads` → PUT bytes to signed `uploadUrl` (XHR, no bearer) → `POST /api/v1/media/{id}/finalize` → `POST /api/v1/analyses` + `Idempotency-Key` | `UploadRequest`, `UploadTicket`, `MediaDto`, `CreateAnalysisRequest` → `AnalysisDto` (202) | `video.library.manage`, `video.analysis.run` | type/size check, upload cancel, 503 `ANALYZER_NOT_CONFIGURED` → honest screen | Implemented |
| Analysis detail | `GET /api/v1/analyses/{id}` polled 2s→30s backoff while Queued/Processing | `AnalysisDto` + ETag | Coach | failure code text | Implemented |
| Result | `GET /api/v1/analyses/{id}/result?maxPoints=1000` | `AnalysisResult` | Coach | 409 not completed | Implemented |
| Playback | `POST /api/v1/media/{id}/read-url` (re-requested on expiry/error) | `MediaReadTicket` | Coach | 409 `MEDIA_NOT_READY` | Implemented |
| Edit / cancel | `PUT /api/v1/analyses/{id}` (+`If-Match`), `POST …/cancel` (+`If-Match`) | `UpdateAnalysisRequest`, 204 | edit: `video.library.manage` | 409 | Implemented |
| Compare | `GET /api/v1/analyses/compare?leftId&rightId&leftRepetition&rightRepetition` | `AnalysisComparison` | `video.analysis.compare` | unit/calibration mismatch warnings | Implemented |

## Supabase Auth (not business data)

| Screen | Call | Notes |
| --- | --- | --- |
| Login | `signInWithPassword`, `signInWithOtp({ shouldCreateUser: false })` | per-slot client |
| Register | `signUp({ emailRedirectTo: /auth/callback?slot=N&next=/onboarding })` | |
| Verify | `verifyOtp({ email, token, type: "signup" \| "email" })`, `resend` | code entry |
| Callback | `exchangeCodeForSession(code)` or `verifyOtp({ token_hash, type })` | link entry, single-use guard |
| Forgot / reset | `resetPasswordForEmail(redirectTo: /auth/callback?slot=N&next=/auth/reset-password)`, `updateUser({ password })` | |
| Sign out | `signOut({ scope: "local" })` | one account only |
