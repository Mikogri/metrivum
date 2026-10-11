# TrainFlow quality audit

## Scope

Preserve the modular monolith, public contracts, existing UI, and all prior working-tree changes. No production deployment, data reset, or push. Changes require a demonstrated failure or concrete query-cost improvement.

## Plan

1. Review database reads and analytics: server-side filters, projections, query counts, historical financial values, indexes and query plans.
2. Review authorization and concurrent transitions: disabled accounts, Team/resource ownership, message membership, storage and analysis leases.
3. Review frontend asynchronous boundaries: queued saves, account switches, cache keys and duplicate reads.
4. Reduce notification publication round trips using the existing unique event key; retain preference rules and cross-module transactions.
5. Run focused regressions, PostgreSQL integration, architecture/unit suites, frontend checks and browser scenarios. Review the combined changes and update Graphify once.

## Initial findings

- P1: accepting Team ownership omits the active Coach check used by other Team operations.
- P1: editor callers can observe a completed save while a queued revision remains unsaved; workspace switching can continue after the active account changes.
- P2: reactivating an existing chat membership bypasses the active-member capacity check.
- P2: client name filtering materializes full account-directory entries before filtering; a SQL-backed contract already exists.
- P2: notification publication performs a lock, existence read, preference read and insert despite having a unique recipient/event index.

## Execution notes

Use the current `codex/coaching-stage-01` checkout because the review explicitly includes its uncommitted changes. Preserve focused pre-edit snapshots under ignored `.local/quality-audit`; do not copy secrets into reports. Integration tests run serially against loopback PostgreSQL. No new index is justified until query-plan evidence supports it.

## Outcome

Implemented and independently reviewed the justified fixes; see `docs/architecture/quality-audit-2026-10-09.md` for measurements, test results and remaining limits. Browser verification additionally exposed a shared controlled-dialog dismissal bug; the fix preserves drafts and nested confirmations. Updated stale browser fixtures/selectors without changing the UI. The additive CheckIns migration was applied only to verified DEV. No production deployment, data reset, commit or push.
