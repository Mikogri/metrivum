# Operations and recovery

The architecture verification used disposable local PostgreSQL. The coordinated release step subsequently applied reviewed `20261011165625_UnifiedConversationConsent` SQL to the confirmed DEV database and verified migrator ownership, API privileges, denied anonymous/authenticated table reads, and a real restricted-runtime insert/update/select transaction rolled back without residue. See the final report for the complete rollout evidence; database application does not activate an API, web or mobile release.

Release units remain DB migrations, API, legacy worker, web bundle, mobile native runtime, compatible mobile JS bundle, model files/manifests and configuration. A Git push or a successful Metro export does not activate those units. No new local ML runtime, store release or automatic deployment is claimed.

## Safe export and CI

Run `./infra/export-contracts.ps1 -NoBuild` after a stable API build. The API selects isolated Testing composition for `--export-contracts`, ignores local/deployment configuration, uses an inert loopback database target, and registers no business workers. It uses loopback HTTP only to obtain OpenAPI. `--export-contracts --migrate` is rejected. The script restores the caller's prior output variable.

Backend CI retains locked restore, real PostgreSQL, migration/runtime privilege tests, contract drift, secret scanning and dependency checks. Frontend CI additionally has an explicit mobile job: typecheck, mobile-core tests and Metro export for iOS and Android using public placeholders. Native compilation, permissions, recording, background lifecycle and real ML device parity remain release checks outside that job.

## Dependency gate

The 11 October npm audit reports 31 affected dependency nodes (20 high, 11 moderate), arising from four advisories. The existing `npm audit --audit-level=moderate` gate remains failing; successful application tests and bundles do not mean the release security checks are green. No advisory suppression or incompatible forced override was added.

| Advisory | Observed path and remaining action |
|---|---|
| [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Nested-pattern denial of service in tooling dependencies; current latest 3.0.3 remains affected. Await a compatible patched dependency and keep untrusted patterns out of build tooling. |
| [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Expo tooling dependency; current latest 1.4.0 remains affected. No patched release was available at this checkpoint. Tooling reachability is not proof of application authentication exposure. |
| [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | xcode uses uuid 7 and calls v4; the advisory concerns buffer use in v3/v5/v6. This narrows observed exposure but does not clear the dependency gate. Await a compatible upstream upgrade. |
| [decode-uri-component malformed-input denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Expo Router → query-string 7 → 0.2.2. Fixed 0.5 is ESM and cannot safely replace this CommonJS dependency by a blind override. Existing tested native-intent handling maps external input to a static route; other parser entry points remain upstream work. |

Re-run audit after a compatible upstream patch; dependency counts and latest versions are dated evidence, not permanent guarantees. The local audit JSON is preserved in the ignored verification directory.

## Read-only diagnostics

Use a restricted diagnostic/runtime connection with SELECT on the inspected private tables. Supply credentials through existing `PGSERVICE`/`PG*` configuration, not command arguments or a tracked file:

```sh
psql -X -v ON_ERROR_STOP=1 --file infra/diagnostics/consistency.sql
```

Require all ten result rows and final rollback. Nonzero error counts require investigation of the source/audit; warnings identify aged asynchronous work. Permission errors or timeouts mean incomplete verification. This does not assert Storage object availability or all possible invariants. Health readiness checks `SELECT 1`; run `DatabasePrivilegeTests`/representative authorized read-write checks separately when validating a release, in an isolated fixture environment.

## Isolated restore rehearsal

1. Identify the exact source backup/recovery point and a disposable destination. Record application commit, EF histories, role configuration and model manifest versions. Keep the destination inaccessible to real clients and deny external delivery endpoints.
2. Before any app starts, set `Workers__Enabled=false` for API and separate worker, and `Notifications__ExpoPush__Enabled=false`. The API skips Billing, Notifications and CheckIns hosted services together; the separate worker exits before DB/analysis/Media cleanup. The normal default remains enabled, so restoring data alone is insufficient. This switch does not block user-initiated API mutations; isolated ingress is still required.
3. Restore PostgreSQL, then reconcile grants and Auth/user-ID mapping using the recorded environment procedure. Apply only compatible reviewed EF migrations. Do not reuse a production JWT authority with an unverified restored identity mapping.
4. Restore private Storage objects independently and compare object manifests, not only Media metadata. Restore required secrets and role passwords from the approved secret store, outside Git. Supabase database backups contain Storage metadata, not the objects themselves; custom role credentials also require recovery handling. See [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).
5. Run the read-only scan, authentication and foreign-user denial, private document, private/Team collaboration, immutable financial history and contract checks. Confirm all remote effects remain disabled.
6. Reconcile pending notifications, settlements and schedules against provider/operation identities before explicitly resuming each host. A backup predating a provider effect does not prove the effect never happened. Leave legacy server ML disabled for the local-ML product path.
7. Record wall-clock restore/verification duration, newest recovered source timestamp, missing-object count and observed data-loss window. RPO/RTO and retention targets require a measured rehearsal and business approval; none is guaranteed here.

A complete backup/Storage/Auth restore has **not been executed** in this pass. The startup guard and read-only database scan are independently testable safeguards, not a substitute for that rehearsal.

## Monitoring and retention

The SQL scan is an immediate local/dev operational view of delivery/schedule/dissolution/legacy-lease age. It does not persist metrics or send alerts. Existing .NET HTTP/EF/Npgsql diagnostics and the legacy analysis Meter are available; a retained collector, dashboards and alerts still need operational configuration. Measure SQL count and pool wait separately from HTTP duration; never put IDs, token-bearing URLs or message/form contents into metric tags. API pools cap at 20 connections and the separate worker at 10 **per process**; size the replica budget against the actual pooler/project capacity.

| Data class | Current recovery/retention decision |
|---|---|
| Financial history, consent and published source versions | Preserve; no new expiry or automatic deletion. Business/legal policy remains separate. |
| Executions, forms and private documents | Preserve with current access rules; deletion/backup lifecycle needs an approved class-specific policy. |
| Outbox/inbox/idempotency identities | Preserve until a maximum replay window is approved; deleting dedupe keys can permit duplicate effects. |
| Unfinished upload / unreferenced media | Existing Media cleanup only; keep worker off during recovery. Any extension needs activity/reference/lease checks, bounded dry run and audit. |
| Derived cache/thumbnail | Rebuildable only if source still exists; no new cleanup job added without measured storage pressure. |
| Local draft | Account-specific persistence and existing logout behavior; never restore another account's draft. |
| Local model/frame resources | No real target model runtime activated. Size/cache cleanup policy must be verified with that actual runtime. |

No blanket retention period, paid infrastructure or destructive repair is introduced.
