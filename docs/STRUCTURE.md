# Repository structure

- `docs/coaching/plan-entitlements.md`: canonical five-plan catalog, explicit quota scopes, simulated subscription lifecycle and metered-job boundaries.
- `docs/coaching/discovery.md`: opt-in coach discovery, canonical English specializations owned by Coaching, privacy filters and relevance-first paid ranking.
- `docs/features/workout-review.md`: optional session feedback, frozen Planned vs Actual comparisons and progress observations.
- `docs/coaching/transaction-history.md`: one paginated history over Billing's existing obligations, attempts, payments and refunds.

- `apps/web/app/modules/anatomy`: lazy BodyParts3D viewer embedded in Exercises, shared muscle filter and attribution. `infra/anatomy` prepares verified assets and additive catalogue data; see [Anatomy Explorer](features/anatomy.md).

- `apps/api/Metrivum.Api`: HTTP host, JWT, ProblemDetails, CORS, health and OpenAPI.
- `backend/BuildingBlocks`: small shared technical primitives, database registration and shared-connection ModuleTransaction.
- `backend/modules`: Accounts, Access, Coaching, ExerciseCatalog, Training, Media, VideoAnalysis, Forms, Offers, Billing, CheckIns, Calendar, Messaging, Notifications and Analytics. Persistent modules own their schema and migrations; only `.Contracts` projects are shared with other modules. Analytics aggregates through module-owned query contracts and has no shadow database.
- `tools/Metrivum.DevFixtures`: explicit, guarded development-only Coaching scenario; no HTTP activation endpoint.
- `infra/diagnostics/seed-development-demo.mjs`: additive twenty-account demo through the local API; see [development demo data](development-demo.md). Credentials and resume checkpoints stay in ignored `.local/demo/`.
- `docs/coaching/stage-04.md`: durable notifications, platform subscriptions, Analyze and verification. `infra/export-stage04.ps1` exports the additive Stage 3A upgrade; `infra/test-stage04-migrations.ps1` verifies clean installation and preservation of existing rows.
- `docs/coaching/stage-02.md`: intake, frozen forms/offers, services, simulated Billing, scheduled CheckIns and guarded migration exports. Billing/CheckIns durable workers run inside the API host.
- `docs/coaching/stage-01.md`: account compatibility, relationship/group API, access matrix and verified deployment.
- `workers/Metrivum.Worker`: durable analysis queue consumer; no HTTP request performs ML work.
- `tools/Metrivum.LocalAnalyzer`: opt-in loopback companion for desktop web analysis using the existing MotionTrace Python/Core bridge; see its README for pairing, offline dependencies and limits.
- `tools/Metrivum.AnalyzerSetup`: per-user Windows installer for hash-pinned, relocatable local-analysis runtimes. Generated downloads are ignored; completed videos/results use the existing Media and VideoAnalysis modules.
- `contracts/generated`: generated OpenAPI and feature catalog, consumed by the web client through `packages/api-client-web`.
- `apps/web`: React Router site â€” pre-rendered public pages, `/auth`, `/onboarding` and the `/app` SPA. Feature code lives in `app/modules/<name>` with a public `index.ts`; `app/shared` holds only cross-cutting infrastructure (session, http, access, i18n).
- `packages/ui-web`: Metrivum component library (tokens, styles, accessible components); knows nothing about the API or users.
- `apps/ui-catalog`: Storybook for `ui-web` (developer tool, not deployed).
- `docs/frontend`: frontend architecture, design reference, API integration map, API gaps and hosting rules.
- `backend/modules/Integrations`: per-client AI consent, draft receipts and human-approved messages; the API hosts `/mcp` using owning-module contracts. See [MCP setup and verification](integrations/mcp.md).
- `apps/web/app/modules/coaching`: role-aware coach/client workflows; see `docs/frontend/coaching.md`. `apps/web/e2e-coaching` tests the screens against explicit browser fixtures.
- `tests`: unit, real PostgreSQL integration and architecture tests.
- `apps/web/app/modules/messaging`: conversation UI, private attachments/WAV recording, inline conversation approval, durable coaching cards, group controls and account-scoped SignalR. See `docs/frontend/messaging.md`.
- `infra`: local environment, role bootstrap and operational commands.
- `infra/diagnostics`: reproducible query-plan, restricted-runtime and explicitly confirmed development Auth probes; fixtures are rolled back or removed.
- `docs/architecture`: decisions and security; `docs/features`: document/CSV/formula contracts.
- `docs/architecture/query-performance.md`: query budgets, request-scoped authorization reads, realtime polling and measured index changes; `infra/query-performance.sql` is the atomic development upgrade.
- `docs/architecture/read-efficiency-and-scaling.md`: current SQL pagination, active-tab reads, cache dependencies and remaining multi-instance deployment blockers.
- `docs/architecture/performance-security-audit-2026-10-08.md`: current audit results, coverage, performance measurements and unresolved product rules.
- `docs/api-endpoints.md` and `docs/api-types.md`: endpoint behavior, request/response fields and client examples.

Within a module, `Domain` contains framework-independent rules, `Features` contains operations, and `Infrastructure` contains persistence/adapters. `ModuleRegistration` explicitly wires services and routes. Add comments for a non-obvious invariant or security boundary; do not narrate self-explanatory code.

Training `Delivery` owns assignments, dated occurrences, frozen prescriptions and actual records; `Generation` creates ordinary drafts using reviewed ExerciseCatalog metadata. `Training.Contracts` exposes aggregate progress to Analytics. `ClientDocumentation` owns relationship records and authorizes private files through `Media.Contracts.IDocumentMedia`. No module reads another module's DbContext. See [Stage 5](coaching/stage-05.md).

Training also owns client exercise maxes and frozen formula inputs per assignment. The advanced web editor shares column geometry, previews one authorized client without assigning, and leaves recalculation explicit. See [client-aware formulas](features/training-client-formulas.md).

Web `training/delivery` contains assignment, workout and progress screens; `training/generator` opens generated drafts in the existing editor. `client-documentation` supplies both client shared records and the coach's client-profile tab. Imports across frontend modules use their public `index.ts`.

`Messaging` owns durable conversation/message history and SignalR delivery. Coaching synchronizes linked memberships through contracts and a shared transaction; Media authorizes private attachments. See [Messaging](coaching/messaging.md) and `contracts/messaging-events.ts` for REST/realtime integration.

Direct conversations are open by default. `Messaging` owns the opt-in approval preference and returns send/upload capabilities to both clients. Pending introductions live in ordinary conversations. `Coaching.Contracts` supplies invitation/form-share entries in the business transaction, so every creation surface produces the same durable chat message. The UI never creates a second synthetic invitation message.

CheckIns obtains assigned cycle dates through `Training.Contracts`; it does not read Training tables. Cycle schedules follow effective assignment versions, local release time and the assignment timezone. Already issued requests retain their original form and timing snapshot.

The [2026-10-11 review](architecture/refactor-2026-10-11/plan.md) records the current hardening scope and evidence. `infra/diagnostics/consistency.sql` is bounded and read-only. Contract export does not load local credentials or start workers; `Workers:Enabled=false` disables background processing while inspecting a restored environment.

## Calendar and workspace switching

`backend/modules/Calendar` owns events, attendee responses and immutable audit in the private `calendar` schema. `apps/web/app/modules/calendar` renders the calendar; `shared/session/WorkspaceScope.tsx` owns the Coach/Client UI mode. Check-in projections stay in CheckIns. See [calendar](coaching/calendar.md).

Billing owns Team roles/memberships, organizational subscriptions, frozen quotes, legacy credit history and durable transitions. Current Team/Studio checkout buys a workspace bundle without proration. Coaching owns Team cases, assignments, client consent and scoped groups; downstream modules consume contracts only. Web `modules/team` is shared by coach/client views. See [Team organizations](coaching/team-organizations.md), [plan entitlements](coaching/plan-entitlements.md) and `infra/export-stage06.ps1`. Server currency conversion remains in `Infrastructure/PlatformCurrencyConverter.cs`.

## Native mobile

`apps/mobile` contains Expo native routes, daily feature screens and account-scoped infrastructure. `packages/ui-mobile` owns mobile-only semantic tokens, controls and charts; it has no business/API dependencies. The existing `packages/api-client-web` exposes a platform-neutral transport and generated contracts to both frontends. `apps/mobile/modules/metrivum-voice` is a reproducible Android PCM WAV Expo module. Generated native projects and private local configuration remain ignored. See [mobile architecture and setup](mobile/README.md) and its verification matrix.

Application abuse policies and durable resource reservations are documented in [Security stage 1](security/stage-01.md), with the registered REST policy map and reproducible local load test.

Web Auth CAPTCHA integration, Supabase server-enforcement prerequisites and compatible-client rollout/rollback are documented in [Turnstile](security/turnstile.md).

Security preparation for public MCP: [hardening and deployment gates](security/public-mcp-hardening.md), [Auth Turnstile](security/turnstile.md), and [distributed admission](security/distributed-abuse.md).

Independent security audit: [findings, evidence and readiness gates](security/independent-redteam-2026-11-05.md), [all MCP permissions](security/redteam-mcp-matrix.md).

Training program/template deletion and retained-history rules: [document lifecycle](features/training-document-deletion.md).
