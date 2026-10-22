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
