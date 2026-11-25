# Read efficiency and horizontal scaling

Reviewed 2026-10-20. This describes current code, not a certified production capacity.

## Reads and pagination

Main programs/templates, folders, formulas, exercise catalogue, forms, media, coaching, payments and training-delivery lists already paginate in SQL. Message history uses cursors. List authorization and filtering must run before pagination, with an ID tie-breaker for deterministic ordering.

Added optional paging without breaking existing array responses:

| Resource | Modern web request | Compatibility |
| --- | --- | --- |
| Team clients and outgoing/incoming transfers | `page`, `pageSize=25` | Omitted parameters retain the old maximum of 1000 |
| Team member rows | `page`, `pageSize=25` | Omitted parameters retain the complete reference roster |
| Conversation sidebar | `page`, `limit=25` | Existing limit/default retained |
| Legacy message requests | Optional `page`, `limit` | Omitted parameters retain maximum 100 |

Array endpoints do not return totals: a full page enables Next; an empty final page still allows Previous. Old no-parameter contracts remain available for installed clients and reference selectors. Conversation membership and Team coach-reference selectors can still load complete reference sets; they are not claimed to be universally paged. The shell's existing 100-conversation recovery snapshot also remains bounded and its unread badge is not a global aggregate.

The Forms library uses `/api/v1/forms/summaries`: PostgreSQL returns metadata and counts questions inside JSONB without transferring or deserializing the draft. Existing full list/detail endpoints remain compatible; editors still receive full definitions.

Analyze detail tabs load lightweight `/context` metadata and only their own section data. Clients also needs acquisition; Check-ins also needs messaging. Previous-period reads preserve comparisons. Overview intentionally retains the aggregate endpoint. Cold detail tabs can issue more HTTP requests than the old aggregate; the improvement is less database/aggregation work, not a claimed latency percentage.

Measured reader commands in the authenticated disposable PostgreSQL fixture with empty personal aggregates and stubbed access checks:

| View | Cold HTTP requests | SQL readers including account/scope |
| --- | --- | --- |
| Old aggregate / Overview | 1 | 36 |
| Finance | 3 | 19 |
| Clients | 4 | 22 |
| Check-ins | 4 | 17 |
| Training | 2 | 18 |

These fixture counts are not production timings or worst-case bounds. Real filters/data can add work.

## Loading and cache

- Route navigation and default TabPanel behavior mount selected content only. Team roster queries are enabled only for Members/Clients. Tests assert zero hidden-panel requests and server-page cache reuse.
- Analyze keys include account, section, Team/member and filters. Detail results and shared metadata stay fresh for 60 seconds; completed Overview seeds its actual metadata into that cache. No cross-section or cross-ownership placeholder data is fabricated.
- AbortSignals cancel obsolete section requests. Existing account-lifetime cancellation/removal still owns all private cache. No private cache is persisted to disk or shared globally between users.
- Group mutations invalidate their dependent Analyze filters/sections as well as group/client views, without refetching offers. Other mutation dependencies retain their existing coverage.

## Durable worker wakeups

- Notifications and check-in generation read the next eligible deadline, then wait for that deadline, a local signal, or a one-minute recovery scan. Mobile push deadlines include retries and receipts. Check-in deadlines respect the later of release time and retry time.
- New notifications and schedule changes signal the local worker only after the database transaction commits. Restart and changes made on another instance are covered by the recovery scan. Existing database locks, eligibility rules and batch limits still govern processing.
- Idle notification scheduling checks the database once per minute instead of claiming a batch every three seconds. Cross-instance notification delivery can wait until the next recovery scan.

## Transfer reduction (2026-11-25)

- Check-in lists and the client summary select only fields used in their response. PostgreSQL omits private coach notes from both reads and returns assignment-group metadata only to the owning coach. The detail endpoint retains its existing separate access rules.
- Check-in summaries use two reads of the requests table instead of five, excluding authorization. One query calculates the counts and next due date, and the other selects the latest visible check-in.
- Shared analysis detail, result and video requests filter metadata by analysis ID in PostgreSQL. Result and video requests reuse the owner from the authorized row. The workout list reuses references to the same execution and set within one request.
- Resolving a linked set selects only that set and the fields used in the reference. It does not transfer sibling sets or log comments.

## Transfer reduction (2026-11-01)

- `training/analysis-set-options` accepts optional `includeSets` (default `true`) and `executionId`.
  Existing callers retain the full response. Summary mode keeps the same workout metadata with an empty
  `exercises` array and performs no exercise/set reads. Detail mode projects picker fields in SQL;
  comments, prescriptions and other unused execution fields are not transferred from PostgreSQL.
- The web picker loads summaries, filters a selected relationship on the server and fetches sets only
  for an expanded execution. Query keys include account, relationship, execution and date range;
  closing cancels pending reads, switching filters clears the selected set, and sets stay fresh for 30 seconds.
- Healthy Messaging realtime disables periodic history reloads. Reconnect/deletion/membership events
  retain their existing invalidation paths. Offline polling remains at 15 seconds, including older pages:
  replacing it with a new-message-only delta would miss deletions while disconnected.
- API compression opts in authenticated GET JSON only for dictionaries, analysis-set options and assignment
  lists. Standard gzip/Brotli negotiation uses the fastest level, preserves `no-store` and varies on encoding.
  Auth, message content, signed URLs, writes and media stay outside this reviewed list.

Actual wire bytes against an isolated API host using development demo records, with background workers disabled:

| Request | Bytes |
| --- | ---: |
| Legacy full picker, identity | 122,049 |
| Initial summaries, identity | 11,595 |
| Initial summaries, gzip | 2,285 |
| One expanded workout, gzip | 1,553 |
| Exercise dictionaries, gzip | 5,383 |

The initial picker transfers 98.1% fewer bytes in this fixture. Network timings included cold startup,
authorization and remote database round trips; they are not a controlled latency benchmark. No remote
migration or live API restart was required. Large analysis-result storage remains unchanged: splitting
its JSON requires separate evidence and a versioned storage/backfill design.

Verification: 42 PostgreSQL/HTTP integration tests and 157 web tests passed. Coverage includes summary SQL
projection, legacy response compatibility, foreign/missing execution IDs, compressed content equivalence
over HTTPS, MIME/method/auth exclusions, lazy set loading/cache reuse, filter selection reset, cancellation,
account lifetime, pagination, realtime deletion and reconnect recovery. OpenAPI was regenerated using
`infra/export-contracts.ps1`; both new parameters are optional. No physical device or production CDN test.

## Horizontal deployment

**Current supported starting point: one API process, shared PostgreSQL/object storage, independently provisioned analysis workers.**

Before multiple API replicas:

1. Provide cross-instance delivery for both Messaging and Notifications SignalR hubs. They currently use local lifetime managers. A notification worker on B can mark its durable record delivered while the user's socket is on A; local SendAsync cannot detect that missing recipient. Polling recovers persisted state, but sticky sessions alone do not solve cross-instance publication.
2. Enforce the intended user/IP/MCP/concurrency budgets centrally. Native HTTP, abuse, hub and MCP limiters are process-local; adding replicas multiplies allowances. Shared counters or an enforcing edge must preserve the existing policies.
3. Size total database pools across API/worker replicas and test routing, reconnect, failover and message delivery with two actual replicas. No such deployment test has been performed.

Already database-backed: cross-module transactions, version/idempotency checks, upload reservations, contact quotas and analysis claims/leases with fenced completion. Notifications already have durable deduplicated records; do not add a second outbox to fix local socket delivery. MCP transport is stateless. Media uses object storage; each analysis worker needs its runtime/models and private temporary workspace.

Remaining throughput boundary: upload admission serializes a global aggregate under an advisory lock. Introduce a reservation aggregate only if measured concurrent upload traffic warrants it. Additional API replicas do not reduce database query cost.

Reference: [SignalR hosting and scale-out](https://learn.microsoft.com/en-us/aspnet/core/signalr/scale?view=aspnetcore-10.0). Backend facts above were verified in module registrations, realtime dispatchers, workers, `AbuseProtection`, `ModuleTransaction` and `AnalysisQueue`.

## Verification

Disposable loopback PostgreSQL: 38 pagination/Messaging/Team tests, 8 Forms tests and 8 Analytics tests passed. Architecture: 8 passed. All 587 Vitest tests across 120 files passed with `npm test -- --maxWorkers=2`; web TypeScript and changed-file ESLint passed. Analyze browser tests: 16 passed across desktop/mobile. The final low-concurrency run avoids CPU contention with browser/graph extraction; Vitest assertions and deadlines were unchanged. Browser bootstrap waits account for cold Vite startup. A pre-existing missing metadata export on the Anatomy redirect was corrected after the full-suite check caught it.

OpenAPI and shared TypeScript contracts were regenerated through `infra/export-contracts.ps1`; existing array/full-detail contracts remain available. No schema migration was needed; no remote database change, deployment or commit was made. API processes must be restarted to serve the new endpoints. Large production datasets, real multi-replica delivery and end-to-end production latency were not tested.
