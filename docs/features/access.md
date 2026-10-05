# Feature access

Module registration defines each stable feature key, UI translation keys, dependencies and associated quota keys. `FeatureCatalog` rejects duplicate definitions, unknown dependencies and cycles at startup. `contracts/generated/features.json` and `features.ts` are generated from these definitions; add a key in its owning module, not in the generated files.

The explicit migration command initializes versioned configuration `v1-default` with the registered v1 coach features. This grants no administrative role. A user can be assigned another named configuration; per-user overrides can grant or deny a key. Deny wins, operational flags can block execution, and all dependencies must pass. Unknown keys fail closed. Reads of a small live DB configuration avoid multi-instance cache invalidation issues.

`GET /api/v1/me/access` returns a decision version, feature decisions and actual limits/usage. Reasons include `available`, `not_granted`, `explicit_deny`, `operationally_disabled`, `dependency_unavailable`, `limit_reached`. Usage is informational; admission reserves resources under database transactions to enforce limits across API instances. A full quota does not prevent reading existing resources.

Administrators with `AccessAdmin` use `/api/v1/admin/access` to read configurations/flags and `/users/{id}` to read assignments/overrides. PUT configuration, assignment, flag and override requests include `expectedVersion` (0 for a new record). A stale version conflicts. Changes and their actor are recorded in `access.audit`. Catalog administration uses the separate `CatalogAdmin` role. Use `infra/bootstrap-admin.sql` for initial grants.

An entitlement is not an ownership grant. Every private operation still checks the owner and resource state. Editing whole plan documents, copying, and importing use the same advanced-set/custom-formula checks. Published content is preserved after revocation.
