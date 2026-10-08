# Stage 03A execution plan

Specification: `C:/Users/Mikolaj/Downloads/trainflow_codex_stage_03a_messaging_only.md`.

1. Audit current modules and run the existing PostgreSQL test suite.
2. Implement Messaging persistence, commands, queries, historical membership cutoffs, client-group synchronization and SignalR delivery. Cover concurrency and authorization with PostgreSQL tests.
3. Extend private Media uploads to validated image/document/video/audio attachments, expose trusted attachment contracts, and retain existing video behavior.
4. Wire the host, feature defaults, private-schema grants and EF migrations; export OpenAPI and TypeScript contracts.
5. Run fresh/upgrade migration tests, required messaging scenarios, regression tests and independent security review. Apply non-destructive migrations to the owner-confirmed development target and verify restricted runtime access.
6. Update concise endpoint, architecture, storage and verification documentation.

Decisions: no chat frontend in this backend-only specification; retain existing Calendar without extending it. Single API instance SignalR; PostgreSQL is authoritative. Blocking affects direct communication only. Group history is visible through the latest removal cutoff; rejoining restores past history. Suspended/completed relationships remove linked-chat eligibility; manual members remain and explicit exclusions win. No publication or production deployment.

Work remains in the current feature checkout because previous required stages are uncommitted here. Preserve unrelated changes. EF migrations remain the schema source of truth.

Completed 2026-10-07. Results, environment limits and applied development migrations: [verification](messaging-verification.md).
