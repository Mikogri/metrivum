# Stage 05: relationship documentation

ClientDocumentation owns private schema `client_documentation` and the records tied to one Coaching relationship. It never writes global account/profile values. Module integration is `AddClientDocumentation()` and `MapClientDocumentation()`.

## Authorization and storage

Every operation checks the current account, Coaching relationship policy and either `coaching.documentation.manage` (coach) or `coaching.documentation.view-shared` (client). Active relationships permit writes. Completed relationships retain read-only history; suspended clients cannot access protected records. The coach can read their history in all statuses. Group membership grants no documentation access.

Private notes have a separate table and author-only queries and updates behind coach authorization. Reassignment and Team administrator status never grant access to another author's notes. Client document queries filter visibility before search, pagination and total counts. Clients can edit their own visible documents; only the coach can change visibility. Plain text is rendered as escaped React text, including literal markup.

Documentation uploads use existing private Supabase Storage, byte validation and size limits. Only PNG/JPEG/WebP/PDF/plain text are accepted. Server-generated object keys bind an upload to its author and relationship; file attachment requires finalized media owned by the current author in that relationship, then pins the file. Generic Media listing, metadata/read and finalization paths cannot expose documentation files. Every document download request checks current relationship status and visibility before requesting a signed URL. URLs expire using existing `Storage:ReadUrlSeconds` (default 120 seconds); an already-issued Storage URL remains valid until that expiry. No public bucket or long-lived sharing URL is introduced.

Shared-document notifications contain no title, body, filename or note text. They use document ID/version event keys and a delivery policy that rechecks current visibility and relationship status. Creation/sharing and publication run in the shared module transaction in the API.

## Measurements and UI

Supported keys: weight (kg/lb), height, waist, chest, arm, thigh and hip (cm/in), and body fat (%). Positive, type-bounded values and observed dates are validated. New manual measurements and corrections store canonical kg/cm/%; legacy imperial records remain readable. Conversion uses 0.45359237 kg/lb and 2.54 cm/in. PostgreSQL returns daily UTC averages, or monthly averages for periods over 366 days, plus the last actual value/date and first-to-last change. Body-fat change uses percentage points. Lists are paginated and can filter by key; charts use real elapsed-time spacing and never mix measurement keys.

Client Details places Body Metrics in Progress and Photos, Files and Private Coach Notes in Documentation. Client Shared documents supports choosing a relationship, automatically selects the sole relationship, and renders permitted records and client entry forms. Measurement corrections, document edits/deletion and note updates require `If-Match`; stale writes return `412 VERSION_CONFLICT`, with the existing reload/copy-your-text conflict UI. Queries are keyed by account, workspace and relationship path; changing account/relationship remounts local editor and temporary file-link state. Photo galleries show dated uploaded photos, without generated ratings.

## API

All routes below have prefix `/api/v1/coaching/relationships/{relationshipId}/documentation` and require authentication.

| Method | Route | Purpose |
|---|---|---|
| GET | `/` | Current status, perspective and allowed actions |
| GET | `/measurement-definitions` | Supported semantic keys and compatible units |
| GET / POST | `/measurements` | Date-filtered history / add measurement |
| PATCH | `/measurements/{measurementId}` | Correct a manual measurement, `If-Match` required |
| GET | `/measurements/trend` | One key/unit, bounded averages, actual latest value/date and change |
| GET / POST | `/notes` | Coach-only search/history / create private note |
| PATCH | `/notes/{noteId}` | Edit private note, `If-Match` required |
| GET / POST | `/documents` | Visibility-filtered search/category/history / create text or file document |
| PATCH | `/documents/{documentId}` | Edit metadata/text, `If-Match` required |
| DELETE | `/documents/{documentId}` | Retention-safe deletion, `If-Match` required |
| POST | `/documents/{documentId}/share` | Coach visibility transition, `If-Match` required |
| POST | `/uploads` | Relationship-scoped private upload reservation |
| POST | `/uploads/{mediaId}/finalize` | Verify uploaded bytes before attachment |
| POST | `/documents/{documentId}/read-url` | Reauthorize and sign a temporary private download URL |

Exact DTO fields are in generated OpenAPI. Notes, documents and measurements lists support `page` and `pageSize`; document/note searches are bounded. Documents support exact categories, `ProgressPhoto` for photos and `Files` for non-photo records. Deletion marks `DeletedAt`, blocks further reads/listing/editing/sharing and notification delivery, and retains pinned private media. Active relationship coaches and visible-document authors can delete; clients cannot delete coach-authored records. Previously signed links still expire normally.

## Verification and limits

`DocumentationTests` runs against disposable local PostgreSQL databases with real Coaching policy and Media services (object storage transport is an in-process test double). It checks private-note/metadata isolation, another coach of the same client, another client's records, share/unshare, suspended/completed status transitions, scoped uploads and signed URL issuance, retained files, generic-media bypass prevention, compatible-unit SQL charts, plain-text edits, notification privacy and stale versions. Six PostgreSQL documentation tests, eight HTTP ETag validation cases and one messaging-media regression test passed (15 total, zero skipped). Command: `dotnet test tests/Integration/TrainFlow.IntegrationTests --artifacts-path .local/stage05/documentation-build -m:2 /nodeReuse:false --filter "FullyQualifiedName~Documentation|FullyQualifiedName~MessagingMediaTests"` with `TRAINFLOW_TEST_DATABASE` configured for local PostgreSQL with CREATE DATABASE permission.

`apps/web/e2e-coaching/documentation.spec.ts` adds browser flows for coach text creation/sharing, client historical read-only visibility, hidden private notes and suspended-client query blocking. All four cases passed (desktop and mobile), 23.2 seconds, using `node node_modules/@playwright/test/cli.js test --config .local/stage05/documentation-playwright.config.ts` on isolated port 4345. These browser tests use the existing substituted HTTP transport; PostgreSQL tests separately verify backend authorization.

Migration creation/application and generated-contract checks are coordinated by the Stage 05 integration task. This slice does not apply remote schema changes. Custom measurement definitions, grouped measurement sessions, document folders, side-by-side photo selection and full edit histories are not implemented. Uploaded photos can be viewed together in the dated gallery. Existing URL expiry is the revocation boundary for previously issued download links.

## Client Details verification (2026-10-09)

The focused documentation frontend suite passes six tests (tab separation, versioned correction, confirmed deletion, BF percentage points, elapsed-time chart spacing, single/empty chart), and focused ESLint passes. The final integrated run passed all 19 documentation service/HTTP tests with no skips, including migration preservation, author isolation, concurrency, canonical units and retained-file deletion. Two additive migrations add measurement concurrency versions, note titles, nullable file sizes and document deletion timestamps. Both migrations were applied to the verified local test database by the integration task; no remote migration was performed. Check-in measurement import, permanent storage erasure and before/after comparison remain unsupported.
