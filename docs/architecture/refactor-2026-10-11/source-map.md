# Sources and ownership

RaceTrace reference: sibling `racetrace-api/docs/architecture/RACETRACE_ARCHITECTURE.md`, source audit dated 10 October and publication note dated 11 October 2026. It is not evidence of TrainFlow runtime behavior; this work did not modify that repository.

| Reference | Useful mechanism | TrainFlow evidence / decision |
|---|---|---|
| 5.3, 14.2 | Reuse source inputs and screen-specific reads | Existing module analytics projections and Training Progress reader; retain EF/Npgsql and explicit owners. No universal query service or copied PostgREST package. |
| 6.1, 6.9 | Shared definitions and calculation identity | Analyze already calls owning-module contracts. Generator has recipe/dataset identity; full Progress provenance remains incomplete. |
| 7–9 | Separate source facts, derived artifacts, result caches and publication guards | No measured need for new TrainFlow cache/SingleFlight. Historical payments remain facts. |
| 10 | Backend DTO → generated client and external-boundary validation | Existing export and shared client retained; export isolation and CI strengthened. Runtime schemas remain partial. |
| 11.2 | Durable leases and stale-writer rejection | Existing legacy analysis queue uses DB-clock token guards. Do not infer the same mechanism exists in every scheduler or enable server video analysis. |
| 12 | Measure layers separately | Existing EF/Npgsql surfaces are the correct SQL boundary. No Supabase HTTP timer copied. Local diagnostics count consistency/lag, not throughput. |
| 13.2, 13.6 | Client scopes and feature boundaries | AST import guard closes relative/dynamic import blind spots; mobile chat invalidation avoids unrelated reports. |
| 15, 17, 18 | Honest rollout, tests and operational limitations | TrainFlow already has CI, restricted roles and health endpoints. Restore worker opt-out and mobile bundles improve this repository's actual gaps. |

Architecture tests, restore controls, administrative consistency scan, client edit lifecycle and device model management are TrainFlow requirements from the specification, not claims about RaceTrace.

## Current responsibility map

| Owner | Source of truth and public boundary |
|---|---|
| Accounts / Access | Supabase verified identity plus private profile/role/session policies; account/session and feature contracts. Editable metadata is not authorization. |
| Coaching / Offers / Forms | Relationship/application/service state and consent; immutable offer/form versions and form submissions. Public module contracts own cross-module operations. |
| Training / ExerciseCatalog | Plans/revisions, assignments, occurrences and actual executions; generator consumes catalog snapshots. `ITrainingProgressReader` provides Progress to Analyze. |
| Billing | Simulated settlement ledger, historical amounts, currency, plans and Team lifecycle. Personal, organization and platform contexts stay distinct. |
| CheckIns / Calendar | Versioned requests, recurrence and calendar projections; scheduler uses existing Training/Coaching contracts. |
| Messaging / Notifications | Durable messages/access boundaries and content-free delivery records. REST is authoritative; sockets are delivery hints. |
| Media / ClientDocumentation / VideoAnalysis | Private object metadata and document policy; local-analysis result persistence. Legacy analysis queue is not the active mobile/browser engine. |
| Analytics | Authorized orchestration through module-owned aggregate contracts; no foreign DbContext. SQL performs aggregation in each owning module. |
| `packages/api-client-web` | Shared generated wire types and account-aware fetch transport used by both clients; historical package name retained for compatibility. |
| `ui-web` / `ui-mobile` | Platform-specific presentation primitives. No app/session/API/database imports. DOM is not shared with native UI. |
| API / separate worker | Composition, configuration, health and module workers; worker opt-out controls autonomous side effects during isolated recovery. |

EF module migration histories are the schema authority. `ModuleTransaction` coordinates a shared physical Npgsql connection across module contexts. Never parallelize those context operations with `Task.WhenAll`. API pool cap is 20; the separate worker cap is 10 per process, so replica counts still determine aggregate connection demand.

Older documents have dated statements: `docs/coaching/analytics.md` describes training as unavailable, while current `AnalysisService` consumes `ITrainingProgressReader`. Treat current code plus current tests as authoritative; old audit query counts/test totals are historical.
