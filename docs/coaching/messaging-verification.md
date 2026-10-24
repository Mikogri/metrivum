# Stage 03A verification — 2026-10-07

## IMPLEMENTED

Persistent direct/manual/linked group conversations, canonical pairs, requests, blocks, immutable reports/replies, historical membership cutoffs, atomic Coaching synchronization, durable reads/unread counts and stable catch-up cursors. Private Media supports image/file/video/PCM WAV attachments, ownership/purpose checks, byte validation and retained references. SignalR delivery follows commit, rechecks current recipients and uses the same camelCase/string-enum JSON as REST. Typing expires without persistence.

OpenAPI, generated TypeScript/feature catalog, typed SignalR events, guarded fixtures, schema/grant exports and [endpoint/architecture documentation](messaging.md) are included. Existing frontend and earlier stage changes remain in the checkout.

## TESTED

| Command / check | Result |
|---|---|
| `dotnet build TrainFlow.slnx -c Release --no-restore --nologo` | Passed, zero warnings/errors. |
| `$env:TRAINFLOW_TEST_DATABASE=(Get-Content .local/stage-01/database.json\|ConvertFrom-Json).ConnectionString; dotnet test TrainFlow.slnx -c Release --no-restore --logger 'console;verbosity=minimal'` | **266 passed**: 121 unit, 143 integration, 2 architecture. Two separately opt-in local Supabase tests skipped. |
| Focused `--filter FullyQualifiedName~MessagingTests` | 15 real PostgreSQL scenarios passed; also included in the full run. |
| Focused `--filter FullyQualifiedName~MessagingRulesTests` | 2 passed; also included in the full run. |
| `powershell -NoProfile -File infra/test-messaging-migrations.ps1` | Clean and upgrade migrations passed, seeded stage 2 records preserved, restricted runtime write/read passed; temporary databases removed. |
| `python -X utf8 infra/messaging-storage-smoke.py --settings apps/api/TrainFlow.Api/appsettings.Local.json --confirm-project atclvdkpbccafakzpwls` | Actual development Supabase: signed upload/read, overwrite rejection and denied anonymous public access for PNG/PDF/MP4/WAV. Only this run's smoke objects removed. |
| DevFixtures stage 3a, full command below | Passed twice in separate processes: same conversation/message IDs, six direct messages, four real private attachments downloaded as Client C, unread 6→0 then 0→0, foreign Coach B denied, E cannot bypass pending request. |
| `dotnet run --project apps/api/TrainFlow.Api -c Release --no-build --no-launch-profile -- --export-contracts` with `ASPNETCORE_ENVIRONMENT=Testing` and `TRAINFLOW_CONTRACT_OUTPUT=contracts/generated` absolute path | OpenAPI/features exported; `npm.cmd run contracts` regenerated TypeScript. Required Messaging headers and report response schema checked. |
| `npm.cmd run typecheck` | All workspaces passed. |
| `npx.cmd tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module esnext --target es2022 contracts/messaging-events.ts` | Event/method contract passed. |
| `dotnet format whitespace TrainFlow.slnx --no-restore --verify-no-changes --include <stage-3a paths>` | Passed for new/edited Messaging, Media, FeatureAudience, transaction, fixture and test paths after formatting. Whole-checkout verification also reports pre-existing Calendar formatting outside this stage. |
| `powershell -NoProfile -File infra/scan-secrets.ps1`, equivalent tracked + untracked source scan, `git diff --check` | Passed. Ignored local credentials remain untracked. |
| `graphify update .` | Graph rebuilt after code changes. |
| Restarted Metrivum API; `Invoke-WebRequest http://localhost:59120/health/ready` | 200 `{"status":"ready"}`; unauthenticated `/api/v1/messaging/conversations` returns 401. |

PostgreSQL coverage includes concurrent pair creation/idempotent sends, accepted/declined/cancelled requests, blocking/history, account swapping, group-only grants, join/removal/rejoin cutoffs, manual-vs-synced members, ban precedence under concurrency, transactional rollback, suspended relationships, tied/frozen-clock cursors including rename, monotonic reads/unread, attachment ownership/cutoffs, report evidence, committed-before-event behavior, transport failure recovery and current recipient revocation. A real in-process JWT WebSocket exercises typing and removal. REST persistence is checked with a reopened API host; fixtures additionally survive a separate console process.

Media tests validate actual object bytes, MIME/size, WAV duration, invalid/truncated content, ownership, purpose separation and pin retention. A registered SignalR JSON protocol test verifies string enums/camelCase. CORS tests cover allowed/foreign origins and query-token restrictions.

The first full run found an older migration test expecting the pre-Messaging feature count; expectations now include the six new default grants. Review findings were fixed and re-reviewed: group-only metadata authorization, strictly monotonic timestamps through rename, and messaging-upload purpose isolation. No actionable issue remains from that scoped review.

### Reproducible fixture command

```powershell
$env:DOTNET_ENVIRONMENT = 'Testing'
$ids = Get-Content .local/stage-01/fixture-ids.txt
dotnet run --project tools/TrainFlow.DevFixtures -c Release --no-build -- `
  --settings .local/messaging/fixture-settings.json --stage 3a `
  --confirm-test-accounts true `
  --coach-a $ids[0] --coach-b $ids[1] --client-c $ids[2] --client-d $ids[3] `
  --user-e 33000000-0000-4000-8000-000000000005 `
  --image-file .local/messaging/fixture-files/image.png `
  --file-file .local/messaging/fixture-files/document.pdf `
  --video-file .local/messaging/fixture-files/video.mp4 `
  --voice-file .local/messaging/fixture-files/voice.wav
```

This run used the restricted local `trainflow_api` connection to `trainflow_stage01_test`, existing local fixture accounts, one additional local-only test profile E, and actual development private Storage. Client C's custom local test configuration was explicitly granted Messaging features; application defaults do not overwrite custom configurations. Files are valid PNG/PDF, one-second MP4 and one-second PCM WAV. Four fixture objects remain privately stored and referenced by the local fixture Media records so the scenario can be repeated. No cloud Auth accounts or cloud conversation fixtures were created. Local evidence is under ignored `.local/messaging/`.

## MIGRATIONS CREATED

- Media: `20261007153121_MessagingAttachments` — purpose and verified duration, existing records default to Video.
- Messaging: `20261007153423_InitialMessaging` — private durable tables, indexes and constraints.
- Access: `20261007153450_MessagingFeatures` — six default capabilities; custom configurations remain unchanged.

Exports: `infra/export-messaging.ps1 -Configuration Release` for the pinned current-stage upgrade; `infra/export-initial-database.ps1 -OutputPath .local/messaging/initial.sql -Configuration Release -NoBuild` for clean installation. Apply reviewed exports once against their required baseline, not against an already-migrated project.

## APPLIED TO DEV

Owner-confirmed Super Team / Metrivum development project **`atclvdkpbccafakzpwls`**. Supabase migration `stage03a_persistent_messaging` applied successfully; all three EF history entries verified. `trainflow-private` created as a private bucket, allowed types configured and per-object limit set to 50 MiB. Server-only local Storage settings configured; no credentials added to source.

Actual TLS/VerifyFull runtime connection performed conversation/message insert and read inside a rolled-back transaction using `psql -X -w -v ON_ERROR_STOP=1 -f .local/messaging/runtime-smoke.sql`; zero smoke messages remained. Verified `trainflow_api` schema USAGE without CREATE, immutable message/report grants, and no Messaging schema access for Supabase anon/authenticated roles. Cloud counts remained 9 profiles and 482 exercises; Messaging contained zero messages after smoke rollback.

Security advisors retain the existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth settings were changed. Performance advisors report only [unused-index informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), with no unindexed foreign-key finding.

## NOT APPLIED

No production deployment, Git commit or push. No chat frontend was added. No synthetic Auth users or persisted chat fixtures were added to the cloud database. Existing Calendar functionality was preserved.

## BLOCKED

No implementation blocker in this scope. Two opt-in local Supabase Auth/Storage tests lacked their separate environment and were skipped; the development Storage checks above are independent evidence, not a claim of browser-to-live-Auth coverage. A complete chat UI/browser login flow was outside this backend-only stage.

## DEFERRED

Calls/WebRTC/meetings, chat frontend, optional presence, multi-instance SignalR backplane, transcription, compressed voice formats beyond PCM WAV, malware scanning, full-text body search, rich reply previews and moderation review tooling. PostgreSQL history remains usable when realtime delivery is unavailable.
