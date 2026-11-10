# Exercise editors

`ExerciseEditor` is a server-managed Accounts role. It grants `catalog.exercises.edit` only. Existing `CatalogAdmin` also satisfies that permission. Neither client-supplied metadata nor public Coach/Client role activation can grant it. Runtime role-provisioning restrictions remain unchanged.

Exercise owners retain their existing update/archive access. Editors can update descriptions/instructions of any non-archived exercise, including imported entries; they cannot archive another author's entry or manage muscle/movement dictionaries or Access settings. Editors still require catalogue browsing access; their administrative edit permission is independent of authoring subscription plans and does not grant creation. Ordinary owner feature gates, optimistic version checks and immutable revisions still apply. Author attribution never changes. The detail response adds optional-compatible `canEdit`; UI uses it while retaining an owner fallback for older APIs.

Apply the additive Accounts `ExerciseEditorRole` migration before assigning this role with an administrator-owned database connection. Never expose role assignment through the browser or the runtime database role. Remove the role to revoke access on subsequent requests. Deploy API/contracts before the web client.

HTTP/PostgreSQL coverage checks foreign edits, ownership flags, stale versions, restricted administration and immediate revocation.

Catalogue search matches every normalized keyword against exercise names or worked-muscle labels, regardless of word order. Filtering runs in PostgreSQL before pagination and also applies to MCP searches.
