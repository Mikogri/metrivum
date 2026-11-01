# Stage 5 delivery report

## Implemented

- Published programs can be assigned to individuals and overlapping groups. Each batch deduplicates recipients, keeps all group sources and leaves the source program shared. Arbitrary cycle lengths, assignment time zones, multiple workouts per day, lifecycle actions and explicit future-revision refresh are supported.
- Clients start with blank actual logs and a frozen prescription. Sets support actual reps/load/RPE/RIR/time/distance/rest/tempo/comments, substitutions, extra sets, skip, completion and authorized corrections. Optimistic concurrency prevents silent overwrites.
- Client profiles expose Training, Progress and Documentation. Clients have My training and Shared documents. Analyze Training uses SQL aggregates of actual records; coach/client perspectives remain separate for dual-role accounts.
- Relationship documentation includes compatible-unit measurement trends, dated private photos/files, editable plain text, explicit sharing and coach-private notes. Media rechecks relationship/visibility and uses short-lived signed URLs.
- The deterministic generator previews equipment/skill/exclusion/time constraints, locks, replacements and reshuffling, then saves an ordinary editable draft. Its reviewed registry contains 17 catalog records, including one manual-only entry. It never assigns or publishes automatically.
- OpenAPI, TypeScript schemas and capability catalog are regenerated. Free and Pro have all Stage 5 capabilities; role and resource checks still apply.

Details: [training contracts and metrics](stage-05-training.md), [documentation and privacy](stage-05-documentation.md), [generator rules](stage-05-generator.md).

## Tested

Verification on 2026-10-08:

- `dotnet test Metrivum.slnx --artifacts-path .local/stage05/full-build -m:2 /nodeReuse:false /p:UseSharedCompilation=false`: 170 unit, 200 integration and 2 architecture tests passed. Two optional local Supabase Auth/Storage tests skipped because that separate test stack is not configured. PostgreSQL integration tests used a disposable loopback database, not Supabase user data. Build the worker into the same artifacts directory before worker-startup tests.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2`: 144 tests passed in 38 files.
- `npm run typecheck`: all workspace checks passed. Scoped ESLint passed for changed screens and new browser tests.
- `npm run build`: production web build and public-page prerender passed. The code graph was refreshed with `graphify update .`.
- Playwright Stage 5 scenarios: 10 passed across desktop/mobile (4 training delivery, 4 documentation, 2 generator). Use `npm run e2e:coaching -- training-delivery.spec.ts documentation.spec.ts generator.spec.ts`; the verification run used equivalent isolated port configurations under ignored `.local/stage05`. Browser tests use explicit stateful HTTP fixtures; separate authenticated HTTP/PostgreSQL tests verify the real API and authorization.
- `infra/test-stage05-migrations.ps1`: clean database, upgrade, existing program/revision/group/membership preservation and restricted runtime write/read passed. No shared database was reset.
- Development Supabase: new schema grants and feature grants verified. A direct TLS connection using the API role inserted, updated and read synthetic records inside a rolled-back transaction.

## Migrations and rollout

EF remains the schema source of truth:

1. `20261008135024_TrainingDeliveryAndGenerator` — assignments, group sources, occurrences, actual execution and generation provenance.
2. `20261008135028_ClientDocumentationInitial` — private relationship documentation.
3. `20261008135032_StageFiveFeatures` — additive default capability grants.

**Applied to verified Supabase development:** yes, project `atclvdkpbccafakzpwls`, on 2026-10-08. Supabase migration: `stage05_training_delivery_generator_documentation`. EF histories match all three migration IDs. `anon` and `authenticated` have no usage of `client_documentation`; runtime API has no DDL privileges. The existing private storage bucket already supports the documentation formats.

Generate reviewable upgrade SQL with `infra/export-stage05.ps1`; clean installation uses `infra/export-initial-database.ps1`. These scripts only generate SQL. Standard local `--migrate` remains explicit and must be followed by reviewed `infra/runtime-grants.sql`; ordinary startup never migrates. Restart the API after updating its binaries, then refresh the web app. Do not rerun the Stage 5 upgrade against an already upgraded database.

**Not applied:** production migration, production deployment and Git push. Existing unrelated working-tree changes are preserved.

The local `Metrivum.Api` process was restarted with the Release build on the existing localhost ports 59119/59120. `/health/ready` returned `ready`; unauthenticated generator access returned 401. Refresh the existing frontend session to load the new capability catalog and navigation.

## Limits and deferred options

No core runtime prerequisite is blocked. Real local Supabase Auth/Storage transport tests remain optional and were skipped; documentation authorization uses real PostgreSQL with a fake object-storage transport in tests.

- Generator uses a conservative reviewed subset and balanced recipes. Separate movement-pattern priority, supplied-1RM input and generated mixed circuits are deferred. Unknown working loads stay empty; existing builder controls remain available after saving.
- Custom measurement definitions, grouped measurement sessions, document folders, dedicated side-by-side photo comparison, execution video attachments, check-in linkage and automatic personal-best flags are deferred. Photos remain available in the dated gallery.
- Previously issued signed file links remain usable until their short expiry (default 120 seconds). Permission changes stop new links immediately; there is no claim of instantaneous revocation of an already issued URL.
- Performance returns at most 1000 exercise/date/load-meaning groups and 200 client summaries; narrow date/exercise/group filters for details. Aggregate totals are calculated independently in SQL and are not sums of a truncated chart response.
