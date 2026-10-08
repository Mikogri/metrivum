# Deterministic program generation

The generator emits the existing schema-1 `TrainingDocument`, then saves through the normal Training program creation path. It never publishes or assigns. The saved draft opens in the existing builder; its initial input, selection map, locks, seed, dataset/recipe versions, document hash and assumptions remain in private `training.program_generations` metadata. Editing the draft later does not rewrite that provenance.

## Reviewed catalog

On 2026-10-08, a read-only query verified the canonical IDs, names, descriptions, instructions and primary muscles of 17 exercises in TrainFlow development project `atclvdkpbccafakzpwls`. The exercise table had no generator metadata fields. `ReviewedGeneratorCatalog` therefore supplies a small, typed, versioned registry instead of inferring properties for the complete catalog. Its equipment, level, required-skill and time rules are conservative recipe assumptions. Sixteen records are candidates or skill-gated; Snatch is explicitly manual-only and can never be generated. Other catalog records remain available to the ordinary builder but are not automatically selected.

Catalog rows must still exist, be unarchived, and match the reviewed name and version. Changed rows drop out until reviewed again. `equipmentAnyOf` contains alternative branches whose `allOf` equipment must all be explicitly available. “Full gym” grants nothing; rack safeties, an incline bench, an air bike and a walking route are separate requirements. Required skills and minimum experience must both match. Exclusions always win, including for previously locked selections. There is no manual-only bypass.

## Recipes and estimates

- Strength uses squat, press, pull, hip extension and an optional trunk accessory, normally three sets; main movements have 5–7 reps, accessories 8–10, three reps in reserve and 150 seconds rest.
- Hypertrophy uses the same balanced movement roles, 8–10 reps, three reps in reserve and 90 seconds rest.
- Cardio uses one modality, a 10–30 minute time cap and RPE 5, without forced repetitions or arbitrary working weights.
- Mixed uses controlled squat/press sets, an optional trunk accessory and a ten-minute conditioning finish. It deliberately uses supported sequential standard sets rather than simulating unsupported EMOM or AMRAP timing.

Session estimates include five minutes of general warm-up, one minute of exercise-specific preparation per resistance movement, four seconds per repetition (both sides for per-side counting), rest between sets, reviewed equipment/setup estimates, and three minutes buffer. Duration reflects the longest cycle when progression is enabled. Optional accessories are removed first if time is short; work sets can then reduce to two. A bounded deterministic pass then tries faster eligible alternatives, preserving exclusions, skills, equipment, locks and family constraints. Prescribed rests are never shortened. A still-infeasible recipe returns a structured `TIME_BUDGET` issue. Extra available time does not inflate volume indefinitely.

The input supports 1–28 day cycles, 1–7 explicit workout positions and 1–12 cycles. Selected movements repeat across cycles. Optional progression increases repetitions by one per cycle, capped at two additional repetitions over the initial prescription. Loads and 1RM remain unfilled; this baseline does not accept or infer maximum-strength data.

This first recipe set has fixed balanced movement roles. Muscle priorities and preferred families bias choices within those roles; there is no separate movement-pattern priority control, no custom split designer, and no supplied-1RM input. Coaches can make those further prescription/structure edits in the normal builder. Mixed uses the disclosed sequential/time-cap baseline rather than a circuit-generation recipe.

## Repeatability and edits

SHA-256 ranks eligible exercises using the selection seed, slot key and canonical ID, with bounded preference weights for up to three muscles and selected exercise families. Roles remain balanced; a family cannot appear twice within one session. Node IDs depend on the original seed and structural path, so replacement/reshuffle does not rewrite unrelated identities. Dataset fingerprints include metadata version plus the currently eligible catalog IDs and revisions.

Locking operates on a session-role slot and therefore preserves the chosen exercise across repeated cycles. Reshuffle keeps structure, set counts and locks, and accepts only choices still within the time budget. Replacement changes one slot across its repeated cycles and preserves all other choices; an explicitly selected alternative still passes server eligibility and duration validation. Regenerate structure is a separate action and clears locks. Invalid/stale metadata cannot be saved. Save is idempotent and atomic with normal draft creation; the same key with another payload conflicts.

## API and UI

`/api/v1/training/generator/options`, `preview`, `replace-exercise`, `reshuffle`, and `save-draft` all require the coach role and `training.generator.use`. Save additionally checks ordinary program creation permissions. `GET /api/v1/training/programs/{id}/generation` uses normal owner/workspace authorization. Both plan tiers retain the capability through the shared Access catalog.

Programs links to `/app/programs/generate`. The form includes constraints, explicit skills, preferences, exclusions, arbitrary cycle-day positions and seed. Preview shows duration components, equipment, movement roles, muscles, prescriptions, locks and eligible replacements. Saving opens `/app/programs/{id}/edit`. Query keys begin with the authenticated account key and account switches remount the form.

## Verification

- `dotnet test tests/Unit/TrainFlow.UnitTests/TrainFlow.UnitTests.csproj --artifacts-path .local/stage05/generator-build -m:2 /nodeReuse:false --filter FullyQualifiedName~Generator`: 17 passed.
- `dotnet test tests/Integration/TrainFlow.IntegrationTests/TrainFlow.IntegrationTests.csproj --artifacts-path .local/stage05/generator-build -m:2 /nodeReuse:false --filter FullyQualifiedName~GeneratorPostgresTests`: 4 passed with `TRAINFLOW_TEST_DATABASE` pointing to the upgraded disposable local PostgreSQL database. Covers ordinary edit/publish, provenance restoration/privacy, concurrent idempotent saving, feature denial and stale-input rollback. PostgreSQL JSONB normalizes object key order; provenance comparisons use semantic selections and reproduced document content.
- `node node_modules/vitest/vitest.mjs run apps/web/app/modules/training/generator/GeneratorScreen.test.tsx`: 3 passed.
- `node node_modules/@playwright/test/cli.js test --config .local/stage05/generator-playwright.config.ts`: desktop and mobile passed. This local config runs the tracked `apps/web/e2e-coaching/generator.spec.ts` on port 4322; the normal coaching config also discovers it. Browser tests use explicit API fixtures to verify UI requests/navigation; the separate PostgreSQL suite verifies persistence and normal publication.
- Scoped ESLint passed for the generator UI/tests and browser spec. Supabase inspection for this slice was read-only.
