# TrainFlow

ASP.NET Core backend for a coach's personal training workspace. PostgreSQL stores application data; Supabase provides Auth and private Storage. Business tables are never accessed through the Supabase Data API.

The v1 scope covers profiles/onboarding, feature access, shared exercises, private training documents/templates/formulas, CSV/PDF, private videos and a durable analysis queue. No frontend or client-management system is included. **A real video analyzer is not bundled:** analysis requests report `ANALYZER_NOT_CONFIGURED` until an adapter is installed.

## Start locally

Requirements: .NET SDK from `global.json`, PostgreSQL 17, and a local/test Supabase for real Auth/Storage. Node 22+ is needed only to regenerate TypeScript contracts. You can run PostgreSQL with `infra/compose.yaml` or use an existing disposable instance. The compose service is PostgreSQL only; it does not provide Supabase Auth/Storage.

```powershell
dotnet tool restore
dotnet restore --locked-mode
```

1. As the database administrator, run `infra/bootstrap-roles.sql`. Set distinct passwords for `trainflow_migrator`, `trainflow_api`, and `trainflow_worker` through `psql \password` or your secret manager. The script creates only application roles/schemas.
2. Set environment variables below with your **local/test** values. `.env.example` documents names but is not automatically loaded. Alternatively use .NET user-secrets or ignored `appsettings.Local.json`.

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__MigrationDatabase = 'Host=127.0.0.1;Port=54322;Database=trainflow;Username=trainflow_migrator;Password=<local-secret>'
dotnet run --project apps/api/TrainFlow.Api -- --migrate
# Run infra/runtime-grants.sql as administrator/migration owner after migrations.
$env:ConnectionStrings__Database = 'Host=127.0.0.1;Port=54322;Database=trainflow;Username=trainflow_api;Password=<local-secret>;Maximum Pool Size=20'
$env:Supabase__Auth__ProjectUrl = 'http://127.0.0.1:54321'
dotnet run --project apps/api/TrainFlow.Api -- --urls http://localhost:5080
```

The ordinary API startup does not migrate. Production requires trusted TLS (`SSL Mode=VerifyFull`), explicit CORS/AllowedHosts and separate Supabase credentials. See [Supabase setup](docs/architecture/supabase-setup.md) and [security](docs/architecture/security.md).

Sign in through Supabase Auth and send its access token as `Authorization: Bearer ...`. Start with `GET /api/v1/me`, then `PUT /api/v1/me/onboarding`. The API rejects anonymous Supabase sessions. `/health/live` and DB `/health/ready` are public; `/openapi/v1.json` requires a user token.

For video storage, configure `Storage__Url`, `Storage__SecretKey`, `Storage__Bucket` and a private bucket. Remote Storage also requires explicit `Storage__AllowRemoteStorage=true`. Run the worker in a separate terminal with the same Storage settings and its restricted DB credential:

```powershell
$env:DOTNET_ENVIRONMENT = 'Development'
$env:ConnectionStrings__WorkerDatabase = 'Host=127.0.0.1;Port=54322;Database=trainflow;Username=trainflow_worker;Password=<local-secret>'
dotnet run --project workers/TrainFlow.Worker
```

See [media/analysis](docs/features/media-analysis.md) for limits, upload finalization, cleanup, leases and the analyzer adapter contract. Never use production credentials for local tests.

## Verify and regenerate contracts

```powershell
# This disposable PostgreSQL account needs CREATE DATABASE; some tests create isolated databases.
$env:TRAINFLOW_TEST_DATABASE = '<disposable PostgreSQL administrator connection>'
dotnet build
dotnet test --logger trx --results-directory TestResults
dotnet format whitespace --verify-no-changes
npm.cmd ci --ignore-scripts # On macOS/Linux, use npm.
./infra/export-contracts.ps1
```

Run the explicit migration command on the base test database before integration tests. Missing PostgreSQL configuration marks DB tests skipped. Live local Supabase tests are separately opt-in and explicitly skipped when credentials are absent; in-process JWT/HTTP tests are not a substitute for those live checks. CI uses real PostgreSQL and checks build, tests, formatting, generated contracts and dependency vulnerabilities.

`contracts/generated/openapi.json`, `api.d.ts` and the feature catalog are generated artifacts. Regenerate them after endpoint/DTO changes; do not hand-edit them. Published revisions are private immutable snapshots, not public sharing.

## Find your way around

- [Repository structure](docs/STRUCTURE.md): project boundaries and where new code belongs.
- [Security model](docs/architecture/security.md): identities, ownership, database roles and actual RLS scope.
- [Feature access](docs/features/access.md): default configuration, overrides, flags, limits and admin operations.
- [Exercise catalog](docs/features/exercise-catalog.md): normalization, dictionaries, revisions and favorites.
- [Training](docs/features/training.md): document schema, formulas, concurrency and CSV/PDF.
- [Change log](CHANGELOG.md) and [verification record](docs/verification.md): changes and actual validation.
