# Exercise catalog

The catalog is shared by authenticated, onboarded adult coaches. `exercises.browse` permits reading; `exercises.create` permits creation and author edits/archive; `exercises.favorites` permits private favorites. The latter two depend on browsing. Server-owned identity determines authorship. Administrators need the separate `catalog.manage` permission for dictionaries and tag merges.

## API

| Method and path | Behavior |
|---|---|
| `GET /api/v1/exercises` | Active exercises; `search`, `tagId`, `muscleKey`, `movementPatternKey`, `favoritesOnly`, `sort`, `page`, `pageSize` |
| `POST /api/v1/exercises` | Create an immediately shared exercise |
| `GET /api/v1/exercises/{id}` | Details, including archived records |
| `PATCH /api/v1/exercises/{id}` | Author changes description/instructions with `expectedVersion` |
| `POST /api/v1/exercises/{id}/archive` | Author archives with `expectedVersion` |
| `GET /api/v1/exercises/{id}/history` | Revisions, newest first; `page`/`pageSize` |
| `PUT` / `DELETE /api/v1/exercises/{id}/favorite` | Idempotent private favorite addition/removal |
| `GET` / `POST /api/v1/exercise-tags` | Search existing exercise tags / create a tag by name |
| `GET /api/v1/exercise-dictionaries` | EN/PL muscle and movement-pattern labels, stable keys and active state |
| `PUT /api/v1/admin/exercise-dictionaries/{kind}/{key}` | Create/update a dictionary entry; kind `muscles` or `movement-patterns` |
| `POST /api/v1/admin/exercise-tags/{id}/merge` | Merge source into `targetId` atomically |

Exercise pages default to 25 records, at most 100, with page numbers 1–10000. Allowed sorts are `name`, `-name`, `createdAt`, `-createdAt`; ID always resolves ties. Search normalizes the text and uses literal substring matching on the exercise name and on the muscles it works (English or Polish label, or key); list items include their primary muscle keys. Filters and pagination run in PostgreSQL. History defaults to 50 revisions, at most 100 per page. Tag search returns at most 100 matches in normalized-name/ID order.

Creation accepts `name`, `description`, `instructions`, optional `demonstrationUrl`, `tagIds`, `primaryMuscleKeys`, `secondaryMuscleKeys`, and `movementPatternKeys`. Tags must already exist. Primary/secondary muscle lists cannot overlap. Name, demonstration URL, muscles, patterns and tag links are immutable through the author edit API; administrative tag merges may consolidate links. Maximums: 200-character name, 10000-character description, 20000-character instructions, 30 tags, 30 muscles and 20 patterns. No equipment dictionary exists.

Demonstrations are optional HTTPS links without URL credentials. The API stores metadata and never fetches these URLs. They are not signed private-media references; callers must not put signed/private URLs or secrets in shared catalog content. User text is not translated automatically.

## Identity, revisions and concurrency

Names and exercise tags use Unicode NFKC normalization, trim, collapse Unicode whitespace to a single ASCII space, then invariant uppercase for identity. Display text keeps its case. PostgreSQL unique indexes enforce identity even for concurrent creation. Different language names are not inferred to describe the same movement; accents are preserved. Exercise and analysis tags have separate tables and identities.

An archived exercise keeps its ID, name reservation, history and references but disappears from active browsing and import name matching. Its details and snapshots remain readable; new favorites and edits are rejected. No endpoint physically deletes exercises. Every description/instruction change and archive operation records a version in the same transaction as the exercise update. `expectedVersion` and EF optimistic concurrency prevent silent overwrites; conflicts return `409 VERSION_CONFLICT`.

`IExerciseCatalog.SnapshotAsync` returns current snapshots of existing IDs, **including archived records**. Missing IDs are omitted; the caller must reject missing references. `MatchNamesAsync` matches only active records and returns keys using the original input spelling with ordinal comparison; unmatched inputs are omitted. Both methods cap requests at 1000 distinct items and require browsing access. Training must persist the returned snapshot in its immutable revision to keep exports independent of later catalog edits.

Dictionary keys are permanent lowercase ASCII slugs, at most 80 characters. Initial EN/PL labels are migration seed data; an administrator can add keys, change labels or deactivate entries. Creation uses `expectedVersion: 0`; updates require the current version. Existing references survive deactivation, while new exercises require active entries. There is no dictionary deletion API.

Tag merges acquire source/target locks in ID order, insert missing target links and remove source links in one transaction. Creation holds shared locks on its selected tags, so merging cannot miss a concurrent link. A merged source remains as a reserved name and redirect record; it is hidden from tag search, and stale selections return `409 TAG_MERGED`. Duplicate target links are deduplicated by their composite primary key.

## Persistence and verification

`ExerciseCatalogDbContext` owns the private `exercise_catalog` schema. Relationships, unique indexes, favorite `(user_id, exercise_id)` keys and revisions are relational. v1 explicitly leaves per-user database RLS disabled on these newly created tables; isolation relies on restricted database grants and API authorization. Supabase `anon` and `authenticated` must have no schema/table access. The API uses its restricted runtime role; only an explicit deployment step uses migration credentials.

Set `TRAINFLOW_MIGRATION_DATABASE` to a migration connection string before `dotnet ef database update --project backend/modules/ExerciseCatalog/TrainFlow.ExerciseCatalog --context ExerciseCatalogDbContext`. Migration execution is never an ordinary API startup step.

Catalog unit tests cover normalization and request validation. Catalog integration tests require `TRAINFLOW_TEST_DATABASE` pointing at a disposable, migrated PostgreSQL database; no EF InMemory provider is used. They cover concurrent normalized-name creation, author/version enforcement, history, archived snapshots, favorite privacy, tag-link preservation and feature revocation. Without that explicit connection, PostgreSQL tests report skipped rather than claiming database verification.
