# Change log

## 0.1.0 - 2026-10-05

- Implement the .NET 10 API and six modules: Accounts, Access, ExerciseCatalog, Training, Media and VideoAnalysis.
- Add Supabase JWT validation, coach onboarding, server-owned roles, configurable feature access and resource ownership checks.
- Add exercise revisions, private training documents/templates, immutable snapshots, bounded formulas and CSV/PDF import/export.
- Add private signed video uploads, verified finalization and a durable analysis worker with leases, cancellation and retries. A real analyzer remains an external dependency.
- Add schema migrations, separate database roles, generated OpenAPI/TypeScript contracts and PostgreSQL-backed CI.
- Document local setup, security boundaries, module structure and actual verification results. Cloud migration/deployment remains a separate operational step.
