# Repository structure

- `apps/api/TrainFlow.Api`: HTTP host, JWT, ProblemDetails, CORS, health and OpenAPI.
- `backend/BuildingBlocks`: small shared technical primitives and database registration.
- `backend/modules`: Accounts, Access, ExerciseCatalog, Training, Media and VideoAnalysis. Each owns its schema and migrations; only `.Contracts` projects are shared with other modules.
- `workers/TrainFlow.Worker`: durable analysis queue consumer; no HTTP request performs ML work.
- `contracts/generated`: generated OpenAPI and feature catalog for a future TypeScript client.
- `tests`: unit, real PostgreSQL integration and architecture tests.
- `infra`: local environment, role bootstrap and operational commands.
- `docs/architecture`: decisions and security; `docs/features`: document/CSV/formula contracts.

Within a module, `Domain` contains framework-independent rules, `Features` contains operations, and `Infrastructure` contains persistence/adapters. `ModuleRegistration` explicitly wires services and routes. Add comments for a non-obvious invariant or security boundary; do not narrate self-explanatory code.
