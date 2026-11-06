# Application abuse protection

The [distributed admission supplement](distributed-abuse.md) updates the important service/HTTP budgets and deployment limits below. Its PostgreSQL-backed coverage supersedes the original per-process rate-window limitation; export concurrency also shares PostgreSQL advisory slots; hub concurrency and anonymous ingress remain process-local.

## Design and coverage

`AbuseProtection` in BuildingBlocks owns bounded native .NET rate/concurrency limiters and low-cardinality metrics. `AbuseProtection:Policies` is typed and validated at startup. Global HTTP admission runs after verified authentication and before named limiters, integration consent and business handlers. Every new REST route inherits a read/write category. Specialized business budgets live in owning services, so switching REST/MCP cannot reset them. No ordinary GET writes a quota row.

The [REST inventory](stage-01-rest-map.csv) contains 327 actual registered method/path pairs, exported by `AbuseRouteInventoryTests` from `EndpointDataSource`. Search and autosave are classified at HTTP but charged by their owning service, avoiding duplicate category charges. Existing account identity/directory enumeration policies remain stricter (10/30 per minute). The [MCP/hub/system map](stage-01-tools-map.csv) covers the other active transports.

Free and Pro use identical protection. Feature grants, commercial prices and authorization are unchanged. A failed limiter never substitutes for ownership, consent, optimistic versions, database uniqueness or payment idempotency.

## Policy map and initial/final settings

No numeric tuning was needed after the controlled tests. All figures below are technical limits, not plan allowances.

| Operation / entry points | Initial = final | Key / additional invariant | Verification |
| --- | --- | --- | --- |
| All HTTP business operations | 600/min | Verified JWT subject; anonymous transport IP | `AbuseHttpTests`, `AbuseProtectionConfigurationTests` |
| Ordinary GET/HEAD / write methods | 300/min / 90/min | Same user across routes/tabs | `AbuseProtectionTests`, `AbuseControlledLoadTests` |
| Exercise and people search, including MCP | 60/min | Shared owning-service search budget; enumeration policies also apply | Catalog/account regression tests and shared policy boundaries |
| Program draft save / MCP draft apply | 120/min | Shared service; does not consume generic write 90/min | Policy boundary, editor 429 recovery |
| Program create/copy/import/generator / MCP create | 30/hour | Shared `CreateInternalAsync`; purchased client copies are system delivery | Shared policy boundary + training integration regressions |
| CSV/PDF export | 20/hour; 2 simultaneous | Owning export service, disposable concurrency lease | Policy boundary/concurrency + existing export tests |
| Message send/request/coaching card / approved MCP send | Refill 30/min, burst 40 | Sender across conversations; identical idempotent retry does not spend a token | `MessagingAbuseTests` |
| New distinct stranger contacts | 5/hour; unestablished 3/24h | Durable sender-locked ledger; active exact coaching pair exempt | `MessagingAbuseTests` concurrency/restart |
| Chat group creation, including linked groups | 20/24h | Durable sender ledger; at most 100 new unique recipients per operation | `MessagingAbuseTests` |
| Collaboration invitation / form share | 15/hour | Coach identity; historical chat replay does not spend message budget | Shared policy boundary + intake regressions |
| Application start | 10/hour | Client identity; ordinary submission validation still applies | Shared policy boundary + application regressions |
| Check-in form creation | 30/hour | Forms service, including MCP | Shared policy boundary + forms regressions |
| Manual check-in schedule targets | 60/hour; max 100 unique clients | Owning service checks expanded group recipients | Shared policy boundary + check-in regressions |
| Check-in answers | 10/hour | Client; exact submitted-answer retry remains read-only | Shared policy boundary + check-in regressions |
| Simulated payment confirmation | 10/min | Common per-user policy across service/platform/team; existing locked/idempotent settlement remains authoritative | Policy boundary + billing concurrency/idempotency regressions |
| Signed downloads | 120/min | Owner/authorized caller; authorization remains required | Media regression tests |
| MCP tool calls | Reads 60/min; writes 15/min | Verified user, shared across authorized integrations (deliberately stricter than a separate allowance per integration) | Shared policy boundaries + MCP integration regressions |
| MCP HTTP transport | 60/min default | Verified user/client plus global budget; before consent DB work | `McpRateLimitTests` |
| MCP input/output | 256 KiB / 1 MiB | Bounded input, timeout, output guard; pagination still required | Existing MCP schema/argument tests |
| SignalR connections / active methods | 5 concurrent / 300 invocations/min | Verified subject; leases released on disconnect or failed connect | `MessagingHubAbuseTests` |
| SignalR typing | 30 effects/min; one effect/2s/conversation across tabs | Bounded expiring coalescing state; authorization still rechecked before suppression | Hub filter and real websocket membership-revocation tests |
| SignalR frames | 16 KiB | One concurrent invocation per connection; files remain in Storage | Hub configuration and existing realtime tests |
| Server analysis queue | 2 queued/running per owner; 100 globally | Durable atomic queue admission; exact retry returns existing job | `MediaAnalysisPostgresTests` |
| Scheduled check-ins/notifications/renewals | Existing bounded worker batches | System work never consumes interactive coach budgets | Existing worker/check-in/billing tests |

An "established" sender has a server-owned active standalone coaching relationship. No age claim or `user_metadata` grants trust. Exact active Team relationships are also exempt when contacting that coach/client; other Team-only senders conservatively retain the 3/day stranger cap. Existing conversations and incoming introductions are not new unsolicited contacts. Group sends count as one message, while adding new unknown recipients consumes contact admission.

All MCP tools registered in `MetrivumTools` inherit the server-owned read/write annotations. Program/form draft creation, saves and approved sends invoke ordinary owning-module services. MCP exposes no separate video enqueue, PDF export, payment or upload tool in this stage; those operations were not invented. HTTP health endpoints are exempt. No external payment webhook is registered in the current API.

## Upload reservations

All video, chat and collaboration-document upload paths use Media admission: 30 starts/hour, 3 pending capabilities, 50 MiB attachment / 500 MiB video, and a 2 GiB rolling-day budget. Unaccepted capabilities charge the bucket maximum, including failed, abandoned and deleted uploads for 24 hours. Verified files settle to actual size; `AcceptedAt` prevents old tickets from escaping acceptance-day accounting. Owner/global advisory transaction locks make admission atomic; storage signing occurs only after the reservation commits.

The global storage budget is 100 GiB, with an 80% alert metric. Each pending signed capability reserves the maximum bucket footprint (500 MiB), including tiny attachments, until its expiry plus a safety margin. Legacy pending tickets conservatively reserve 2 GiB during upgrade. Ready objects retain their actual reservation after expiry. Cleanup processes 25 records per batch and retries failed deletes; deletion cannot revoke a still-live signed capability.

Signing requires a private bucket with a positive numeric `file_size_limit` no higher than 500 MiB ([bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets)). Finalization measures actual Storage bytes and checks exact declared size, MIME and format signature; client filenames and declarations are insufficient. Invalid objects stay reserved until cleanup. Storage/DB failures do not return an unreserved capability.

**Direct-upload boundary:** a Supabase signed upload URL cannot enforce a different byte cap for each ticket. An attachment can temporarily occupy more than its declared 50 MiB before finalization rejects it, up to the bucket cap. Daily and global reservations bound admitted stored-object liabilities, including underdeclared failures; they do not cap network bytes in failed or repeated Storage HTTP requests. This requires immutable, non-upsert tickets and service-only Storage mutations: authenticated clients must not independently overwrite or delete objects. Strict per-ticket network-byte enforcement would require a streaming upload gateway or separate constrained buckets; it is not claimed here.

Admission currently serializes a global aggregate query. This is intentionally simple for the present deployment, not a scalable distributed counter. Replace it with a locked aggregate/reservation store if measured upload traffic warrants it. Alert counters are emitted; routing those metrics to operational alerts remains deployment work.

## Identity, deployment and UX

`TrustedProxies` is empty by default: arbitrary X-Forwarded-For/CF headers cannot reset an IP budget. Only explicitly configured proxy IPs may forward one hop. Do not enable blanket proxy trust. Authenticated people sharing an IP have separate verified-user partitions. Identity admission is capped and cleanup throttled; saturation rejects new identities instead of growing memory without bound.

Rate windows, connection leases and export concurrency are **per process**. The repository has no verified multi-replica API deployment; this stage is suitable for the current local/single-process setup. Before scaling API replicas, use shared counters or an enforcing edge for these budgets. Media reservations, contacts, groups and queue admission already coordinate through PostgreSQL and survive restarts.

429 responses use ProblemDetails with `code`, `traceId` and Retry-After. Hub failures use `RATE_LIMIT_EXCEEDED`; MCP uses a structured `rate_limited` tool error. React query retries exclude 4xx and mutations never retry automatically. Autosave retains the draft and version after 429, shows the existing readable error and allows explicit retry; it does not loop or discard edits. The developer Toast Lab route and navigation item are removed.

## Reproduce and evidence

```powershell
./infra/diagnostics/test-abuse-http.ps1
$env:TRAINFLOW_TEST_DATABASE = 'Host=127.0.0.1;Port=55462;Database=<migrated-disposable-local-db>;Username=<test-role>'
dotnet build workers/Metrivum.Worker --artifacts-path .local/security-stage01 -m:1
dotnet test tests/Unit/Metrivum.UnitTests --artifacts-path .local/security-stage01 -m:1
dotnet test tests/Integration/Metrivum.IntegrationTests --artifacts-path .local/security-stage01 -m:1
```

Use only a disposable loopback PostgreSQL database. The load script does not send traffic to remote API, Auth or Storage. `TRAINFLOW_ABUSE_RESULTS` optionally saves the direct-limiter load report; `TRAINFLOW_ABUSE_HTTP_RESULTS` saves the HTTP report. The [HTTP sample](stage-01-http-measurement.json) records the measured run, including CPU/RAM. These measurements use synthetic TestServer handlers and do not establish production SQL/UI p95.

100 users / 20,000 normal synthetic HTTP requests produced zero 429. Of 1,000 bot GETs, 700 were rejected by the read budget. Baseline/protected p50 was 0.086/0.114 ms and p95 0.204/0.413 ms. Throughput was 57,585/36,797 requests/s. No starting limit was loosened to make tests pass. Direct limiter tests separately exercise 600 global requests with 400 of 1,000 rejected.

Database tests cover admission concurrency/restarts, exact 2 GiB and 30/hour boundaries, finalization spoofing, deletion/refund bypass, global storage capacity, failed signer/DB reservation, cleanup and migration upgrade. All 12 upload-quota cases passed. 348 unit tests and 8 architecture tests passed, including resource cleanup after analyzer cancellation. Eleven web regressions passed, including retained drafts after 429, account scope and navigation; TypeScript and targeted ESLint passed.

Final integration verification on 2026-10-19: 397 passed, 2 skipped, 0 outstanding failures across all 399 cases. Fresh test-host batches bounded memory use after an unrestricted run encountered local PostgreSQL recovery and a heap-capped run exhausted test-host memory. One batch spanned overnight; its one-hour JWT expired, and that case passed when rerun in a fresh process. No authentication rules, assertions or application limits were relaxed. The two skipped cases require real local Supabase Auth/Storage. [Verification counters](stage-01-verification.json) retain batch results and the explicit rerun.

## Operational status and limits

- **IMPLEMENTED:** central policies, owning-service budgets, bounded hub invocation/typing, durable contact/group/upload admission, analysis queue caps, response headers, metrics and Toast Lab removal.
- **TESTED:** controlled local limiter/HTTP load; real local PostgreSQL reservation and messaging cases; existing API regressions and editor 429 retention (see task results for final counts).
- **MIGRATIONS CREATED:** `UploadResourceQuotas`, `MessagingAbuseBudgets`, with runtime-grant support for the private ledger.
- **APPLIED TO DEV:** disposable local PostgreSQL test databases only.
- **NOT APPLIED:** shared Supabase development project and any production database; no push or deployment.
- **DEFERRED:** distributed in-memory budgets, volume DDoS/WAF, CAPTCHA deployment, antivirus/moderation, production metric/alert integration, strict per-ticket upload gateway, production-scale DB/CPU/worker load and real-device/network reconnect soak.
- **BLOCKED / NOT VERIFIED:** current remote Supabase Auth rate-limit settings are not exposed by the connected tools; no remote configuration was changed. Real Supabase Auth/Storage integration tests require a disposable local Supabase instance and its explicit test credentials. They are not replaced by mocks or pointed at the shared project.

Supabase Auth runs outside this API's limiter. Before public deployment, review the project's actual Auth rate limits and enable Turnstile/CAPTCHA for signup and recovery. Configure the real trusted ingress addresses and verify a reconnect/multi-tab soak in the deployment environment. Application-layer quotas do not provide volumetric DDoS protection.

Sources: [ASP.NET rate limiting](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0), [SignalR security](https://learn.microsoft.com/en-us/aspnet/core/signalr/security?view=aspnetcore-10.0), [Supabase Auth limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha).
