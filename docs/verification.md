# Verification record

Verified on 2026-10-05 with .NET SDK 10.0.401 and a disposable local PostgreSQL 17.11. The cloud database was subsequently migrated with explicit authorization; see the [deployment record](architecture/cloud-deployment.md).

## Executed checks

| Check | Result |
| --- | --- |
| `dotnet build TrainFlow.slnx --no-restore` | Passed; 0 warnings, 0 errors |
| `dotnet test TrainFlow.slnx --no-build --logger trx --results-directory TestResults` | 142 passed, 2 skipped, 0 failed |
| Test breakdown | Unit: 73; architecture: 2; PostgreSQL/HTTP integration: 67 passed, 2 skipped |
| `dotnet format whitespace --no-restore --verify-no-changes` | Passed |
| `./infra/export-contracts.ps1 -NoBuild` twice | Identical files; 52 OpenAPI paths, 89 schemas, TypeScript and feature contracts |
| `dotnet package list --vulnerable --include-transitive --format json` | No vulnerable packages reported |
| `npm audit --audit-level=moderate` | 0 vulnerabilities reported |
| PDF visual inspection | All 5 pages rendered and inspected: Polish characters, long values, advanced sets and page breaks are readable |

PostgreSQL coverage includes clean migrations under the migration role, restricted runtime-role permissions, real HTTP onboarding, ownership, immutable revisions, stale ETags, feature revocation, import rollback/idempotency, quota concurrency and queue lease recovery. JWT tests cover signatures, claims, unknown keys and actual JWKS cache/rotation behavior. Independent code review findings have regression coverage.

The two skipped tests exercise real Supabase password authentication and private Storage. They require a **local disposable** Supabase instance with asymmetric signing, `TRAINFLOW_TEST_SUPABASE_URL`, `TRAINFLOW_TEST_SUPABASE_SERVICE_KEY`, and the migrated `TRAINFLOW_TEST_DATABASE`. Run `dotnet test --filter "FullyQualifiedName~SupabaseAuthTests|FullyQualifiedName~MediaSupabaseTests"` after configuring them. They create and remove their own Auth user or Storage bucket; do not point them at production.

GitHub Actions repeats the PostgreSQL checks on Linux and rejects generated-contract drift. See the repository's Actions page for the result tied to a particular commit.

## External dependencies

- The Super Team / Metrivum project was discovered successfully. Its live public JWKS endpoint exposes ES256. This read-only check does not prove successful real-user Auth or Storage flows.
- No local Supabase instance is available on this Windows host (Docker/WSL are not installed). Live Auth/Storage tests are opt-in and must be run against a local/test instance before deployment. No production credentials or data are used by tests.
- Runtime PostgreSQL role passwords and the private Storage backend secret have not been provisioned for the cloud project. MCP administrative access does not replace runtime credentials.
- No ML engine or model was supplied. The durable analysis infrastructure is tested using an adapter confined to tests. Production reports `ANALYZER_NOT_CONFIGURED`.
- Cloud database migrations are applied and verified. Application deployment remains pending; API startup never applies migrations automatically.
