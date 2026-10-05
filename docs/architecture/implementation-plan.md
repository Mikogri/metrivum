# TrainFlow v1 implementation plan

**Goal:** Deliver the coach-only API, database migrations, tests and maintainable English documentation described in the supplied specification.

**Architecture:** Modular monolith with six implementation projects, explicit cross-module contracts, one API host and a separate persistent-queue worker. Relational ownership and metadata; validated versioned JSONB for immutable training revisions and analysis results.

**Stack:** .NET SDK 10.0.401; ASP.NET/EF Core 10.0.12; Npgsql EF 10.0.3. Exact dependencies and lockfiles are committed.

## Constraints and decisions

- No frontend, clients, payments, teams, calendar, chat or speculative modules.
- JWT validation uses configured asymmetric JWKS, issuer and audience. Application roles never come from user-editable claims.
- Each module owns its DbContext and private schema. Only contract projects cross module boundaries.
- Runtime, worker and migration roles are separate. API ownership checks provide tenant isolation; no claim that Npgsql automatically sets auth.uid().
- EF migrations are the single source of schema history. No migration on ordinary application startup.
- Supabase cloud migrations/deployment require separate approval from the user, as specified. Prepare and test locally first.
- The GitHub repository is private by default; initial publication is authorized.
- No analyzer is present. Production reports ANALYZER_NOT_CONFIGURED; simulated results belong only in tests.

## Delivery sequence

- [x] Foundation: projects, shared contracts, ADR, runtime configuration, clean PostgreSQL migration path.
- [x] Identity/access: JWT negative cases, idempotent onboarding, profile constraints, server-owned roles, feature graph and live DB decisions.
- [x] Exercise catalog: normalized uniqueness, revisions, dictionaries, favorites and tag merges.
- [x] Training: typed documents, units, bounded formulas, folders, private templates, ETags and immutable revisions.
- [x] Import/export: bounded CSV preview/map/commit with idempotency, snapshot CSV/PDF exports.
- [x] Media/analysis: private signed uploads, verified finalization, durable lease queue, cancellation, comparison and unavailable analyzer behavior.
- [x] Local acceptance: PostgreSQL concurrency/ownership tests, module dependency checks, generated contracts and CI workflow.
- [ ] External acceptance: real local Supabase Auth/Storage tests; see [verification](../verification.md) for missing dependencies.
- [ ] Cloud setup: provision runtime secrets and apply reviewed migrations only after separate approval.

Each unit starts with behavior tests where practical, then implementation and verification. Module work may proceed independently after the shared contracts are fixed; final verification runs the integrated solution.

## Review focus

Test anonymous Supabase sessions, metadata privilege escalation, simultaneous onboarding, cross-owner resource access, feature bypass through complete document writes, stale ETags, repeated idempotency keys with different bodies, parallel queue reservations, expired leases and file-size/type mismatches.
