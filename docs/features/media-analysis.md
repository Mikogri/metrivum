# Private video library and analysis

`Media` owns file reservations in `media.files`; Supabase Storage owns the bytes. `VideoAnalysis` owns durable jobs and bounded JSON results in `video_analysis.jobs`. Both schemas are private and must be omitted from the Supabase Data API's exposed schemas. Ownership is enforced in the API/application service; these tables deliberately do not claim JWT-based RLS isolation. Never grant `anon` or `authenticated` privileges on them.

## Configuration and Storage

Use a distinct Supabase project and private bucket per environment. The example worker configuration is `workers/TrainFlow.Worker/appsettings.example.json`. Set secrets through environment variables, such as `Storage__SecretKey` and `ConnectionStrings__WorkerDatabase`. No production URL or bucket is a fallback. Non-loopback Storage requires explicit `Storage__AllowRemoteStorage=true` and HTTPS. Use direct PostgreSQL or a session pool; transaction-pool compatibility is not claimed.

Create a **private** `trainflow-videos-local` bucket for local development. Set its maximum file size to 268435456 bytes (256 MiB), and allow `video/mp4`, `video/webm` and `video/quicktime`. Do not create broad authenticated Storage policies. Backend credentials authorize Storage transport only; the API still checks ownership. Keep service credentials solely in backend/worker environments. The adapter checks bucket privacy before issuing capabilities or reading/deleting objects. Default upload reservation limit is five pending uploads per owner; the per-file limit and URL lifetime are configured separately.

1. `POST /api/v1/media/uploads` accepts `{ "name": "Squat", "contentType": "video/mp4", "size": 12345 }`. The server creates an owner-prefixed random key and returns a PUT upload URL. There is no client-selected owner, bucket or object key.
2. PUT bytes to the returned URL with the reserved Content-Type. The upload capability uses `x-upsert=false`; existing objects cannot be replaced. Supabase signed upload URLs currently last two hours.
3. `POST /api/v1/media/{id}/finalize` checks ownership, pending state, actual Storage length, Content-Type and a bounded container signature. MP4 requires an accepted `ftyp` brand; WebM requires EBML plus a WebM document type. MOV accepts a QuickTime `ftyp` brand or a bounded legacy movie/data atom. This verifies the container header, **not decodability, every frame or codec safety**. A real analyzer must decode/validate the complete video before producing results.
4. `POST /api/v1/media/{id}/read-url` rechecks ownership and actual bytes, and returns a read capability valid for 120 seconds by default (configurable 30–600).
5. `DELETE /api/v1/media/{id}` requires `If-Match: "version"`. Analyses pin source files permanently in v1; pinned files cannot be deleted. For other files, deletion becomes durable `Deleting`, then the worker removes bytes after the outstanding upload capability has expired plus a five-minute margin. An unexpired capability continues to consume the pending-upload quota even after deletion is requested; deleting a reservation cannot create an unlimited supply of live upload links. Retry delay grows to an hour. Failed deletions retain tombstones for retry. Abandoned uploads follow the same path.

Signed URLs and provider response bodies are never logged by the adapter; its HttpClient logging is disabled. Hosting/APM must also avoid logging response bodies containing capabilities. Pending/ready/deleting metadata does not imply the backing object is available: finalize/read/worker retrieval report missing objects or Storage failures.

## Durable analysis and limits

`POST /api/v1/analyses` requires `video.analysis.run` and `Idempotency-Key` (1–100 characters). Body: name, optional note, up to 20 tags, mediaId and configuration (`movement`: unspecified/squat/deadlift/bench-press; optional positive metersPerPixel). Tags have a separate analysis namespace and Unicode/trim/lowercase normalization. Metadata updates require `If-Match`. Owner is obtained only from the authenticated account.

Acceptance returns 202 and a job ID. Owner-scoped transaction advisory locks serialize quota/idempotency checks. The same transaction contains the media pin and job insertion. An ambient transaction and one shared Npgsql data source enlist both module contexts; sequential operations allow Npgsql to reuse the connection. The integration test proves rollback of the pin after failed admission. Reusing a key with the same request returns the same job; different content gives `IDEMPOTENCY_CONFLICT`. The default `Analysis:MaxConcurrentPerOwner=2` bounds queued/running jobs per owner, and `Analysis:MaxQueuedJobs=100` bounds total queue admission. Both guards are technical safety limits shared across API instances through PostgreSQL, identical on Free and Pro; they are not subscription upgrade gates. See [security stage 1](../security/stage-01.md). Per-file validation, upload safety limits and worker concurrency remain bounded.

Statuses: Queued, Processing, Completed, Failed, Cancelled. PostgreSQL `FOR UPDATE SKIP LOCKED` atomically claims a job. Every claim increments attempts and issues a fresh lease token; heartbeat and result writes require that token and a nonexpired lease. Default lease is 60 seconds, heartbeat 15 seconds, maximum attempts three and run timeout 1800 seconds. A crashed worker's expired job is reclaimed; exhausted jobs become Failed. A cancellation invalidates the token immediately. Only the worker can write results; no HTTP endpoint accepts Completed status. A result is stored atomically in its job row, so a stale or duplicate worker cannot append another result.

The worker is a **separate process**:

```powershell
# Supply environment-specific configuration/secrets first.
$env:DOTNET_ENVIRONMENT = 'Development'
& ./workers/TrainFlow.Worker/start-worker.ps1
```

Provision a dedicated worker DB login with SELECT/UPDATE on `media.files` and `video_analysis.jobs`, notifications publish/read permissions from `infra/runtime-grants.sql`, and USAGE on the relevant schemas. It needs no Accounts, Access, Training or ExerciseCatalog table access. Startup rejects superuser, BYPASSRLS, CREATEDB, CREATEROLE, database/schema CREATE privileges, and read/write access to other module tables. Do not use a migration login. Neither API nor worker runs production migrations automatically. Worker scope creation/lease heartbeat avoid sharing a DbContext across concurrent work. Storage uses separate server-side credentials; the standard Supabase service key remains broad at the Storage layer and must be protected accordingly.

## Analyzer contract and current limitation

The optional [MotionTrace adapter](motiontrace.md) supports two-point tracking and repetition/phase speeds in px/s. Without explicit configuration, registration remains `UnavailableVideoAnalyzer`: new requests return `ANALYZER_NOT_CONFIGURED`; a previously queued job processed without an engine becomes Failed with that code. No velocities, repetitions or Completed results are fabricated. The synthetic adapter exists only in tests.

To integrate an existing engine, implement `IVideoAnalyzer`, register the same adapter in API and worker, expose its actual availability, and honor cancellation. Heavy decoding/ML belongs in the worker. Uncooperative native code may require an independently killable engine process; the current lease still fences its late writes. The worker uses the explicitly claimed owner, never a fabricated authenticated request context.

Result schema 1 contains engine/model versions, method, position unit, optional scale, repetitions with start/end times and phases, bar trajectory points (seconds/X/Y/optional velocity), quality [0,1], occlusion flags and warnings. Positions are `px` or calibrated `m`; velocity follows the position unit per second. Metric results require a valid scale matching the admitted configuration. Results are limited to 50000 points and 8 MiB by default, with at most 1000 repetitions. Invalid/nonfinite values fail the job.

Lists project metadata only, use bounded SQL pagination and ID tie-breakers. `GET /api/v1/analyses/{id}/result?maxPoints=1000&repetition=1` returns a bounded series; `maxPoints` is 2–5000. Sampling preserves endpoints and selects evenly spaced indices, so it is for display, not recomputing peaks. `GET /api/v1/analyses/compare?leftId=...&rightId=...` optionally selects a repetition on each side, checks both owners, requires `video.analysis.compare`, and rejects different units, calibration modes, methods or engine/model versions with `ANALYSIS_INCOMPATIBLE`. Pixel-space comparison is only directly meaningful for equivalent camera framing; the API does not infer physical equivalence from pixels.

## Verification and operations

Unit tests cover container/size rejection, unavailable engine, calibration, incompatible comparisons, bounded sampling and Storage HTTP behavior. `MediaAnalysisPostgresTests` creates isolated databases on real PostgreSQL, runs both initial migrations, and tests ownership, upload quota races, cleanup retries, transactional pin rollback, idempotency/quota races, atomic claiming, lease recovery/fencing, cancellation and actual worker execution with a test-only adapter. Set `TRAINFLOW_TEST_DATABASE` to a disposable instance with CREATE DATABASE permission; never use production. Missing configuration marks these integration tests skipped explicitly.

The in-process HTTP adapter tests do not establish live Supabase compatibility. `MediaSupabaseTests` is opt-in with `TRAINFLOW_TEST_SUPABASE_URL` and `TRAINFLOW_TEST_SUPABASE_SERVICE_KEY`, and refuses non-loopback URLs. It creates its own private bucket and verifies signed upload, rejected overwrite, inspected bytes, signed read and cleanup. Run this local test before deployment; no production Supabase data was read or changed during implementation. A real ML engine remains an external missing dependency.

Metrics meter `TrainFlow.VideoAnalysis`: completed, failed and lease_lost counters. Structured worker logs contain job ID, attempt and server-selected failure code only. Monitor Queued age, expired leases, Failed counts, Deleting age and worker liveness alongside API DB readiness. No worker means jobs remain durable Queued; API acceptance is not a claim that computation has started. HTTP rate limits are host-level/per-instance unless the host adds a shared limiter; explicitly configured DB capacity limits here are global.

Verified references: [Supabase signed upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [official Storage HTTP client source](https://github.com/supabase/storage-js/blob/master/src/packages/StorageFileApi.ts). The changelog Markdown endpoint was unavailable during this check; no assumption of live cloud verification is made.

## Local queue troubleshooting

API readiness does not start the separate analysis worker. Store `ConnectionStrings:WorkerDatabase` in .NET User Secrets for `workers/TrainFlow.Worker` (ID `trainflow-worker-development`), then run the script above. The script defaults to Development, where secrets override local JSON; environment variables and command-line arguments still take precedence. Testing never reads local secrets. User Secrets are outside the repository but are not encrypted. Media cleanup failures are logged and retried without starving queued analysis claims. Never substitute the API/migration login for the worker or mark jobs completed without processing.

On 2026-10-08, the owner authorized resetting only the dedicated worker password. Its new credential was stored in User Secrets, the old connection removed from project-local JSON, and authenticated queue reads and worker startup were verified. PostgreSQL tests independently verified job admission, lease/cancellation fencing and actual execution with a test-only adapter; this does not claim the user's uploaded videos were processed.

Web comparison shows one speed chart per phase, aligned to that phase�s start; the phase-time bars retain the full repetition. Speed charts use the magnitude of the stored signed velocity, preserve missing/occluded samples as gaps and never substitute displacement for missing speed. Stored analyzer results remain unchanged.

Comparison retains bar path and height charts. Height zero approximates chest position using lifting onset (or the lowest tracked position without a lifting phase); signed displacement is retained. Chart headers expose explanatory information tooltips.

Hover guides mark the tooltip position and comparison samples; each comparison row includes its measured sample time. API owns result validation, authorization, media ownership, idempotency and transactional persistence. The browser coordinates local jobs and uploads; inference, repetition/phase detection and measurements run in the local companion. Client results are validated input, not independently verified inference.

Repeated phase kinds are preserved: comparison aligns occurrence N with occurrence N and labels repeated phases by ordinal. API accepts chronological repeated phase kinds (up to its existing phase budget). Limitation: the current MotionTrace MovementRep detector still models one lowering/lifting pair and does not identify a complete clean-and-jerk or snatch sequence as a multi-stroke repetition. UI support is not proof of compound-lift detection.

Private comparison queries terminate on failure instead of rendering indefinite loading. Inaccessible (403/404) resources use a neutral not-found state with no retry or API detail; transient failures offer an explicit retry. Ownership remains enforced by API queries, and intentional shared-link access retains its existing contract.

Analyzer 1.5 supersedes the single-pair limitation above for unspecified movements: it tracks the whole clip bidirectionally and measures directional sequences with repeated phases and pauses. Cycles separate on return to initial height; technique and semantic completion are not classified. Existing results are not rewritten. Explicit bench/squat/deadlift paths retain MotionTrace parity.

Runtime deletion requires DELETE on video_analysis.jobs for trainflow_api (not the worker); keep infra/runtime-grants.sql applied after migrations. AnalysisLibrary retains owner/version checks, cascading shares and media cleanup. Verified against the development runtime role using a failed job inside a rolled-back transaction.

Analyzer 1.6 preserves model inputs/results while reducing prefix spool I/O and batching tiny GPU-to-CPU observations. Completed stage caches survive failures within a 24-hour / 512 MiB retention budget, with hash validation before reuse. This saves repeated work, not partial GPU-inference state. See the local analyzer README.

Analyzer 1.7 reuses verified GPU weights in a private sequential worker, with new recurrent state for every video. Strict meta/mapped loading avoids duplicate CPU weights; idle residency defaults to 30 seconds and is configurable. Cold and warm timing plus full trajectory/phase parity evidence are recorded in the local analyzer README.
