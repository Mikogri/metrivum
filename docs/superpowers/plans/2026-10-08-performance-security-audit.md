# Performance and Security Audit Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for each independently owned task. Run heavy verification sequentially on this Windows host.

**Goal:** Reduce unnecessary database and HTTP work, repair demonstrated security defects, and record tested boundaries and unresolved product rules.

**Architecture:** Preserve the modular monolith and contract boundaries. Use real PostgreSQL regression tests for data access and transactions, component tests for request lifecycles, and browser tests for user flows. Add indexes only for an identified query shape.

**Tech Stack:** .NET 10, EF Core, PostgreSQL/Supabase, React, TanStack Query, SignalR, Vitest, Playwright.

**Spec:** User request of 2026-10-08: optimize database/API access and investigate integration, unusual states, bypasses and security; collect undecided behavior questions at the end.

## Constraints and review focus

- Preserve existing uncommitted work; no publication requested.
- Supabase changes target only the previously confirmed development project.
- Never print credentials or store them in tracked files.
- One request shares a database connection; do not introduce concurrent EF operations.
- Check cross-account/Team identifiers, stale permissions, duplicate/retried writes, malformed uploads, and stale asynchronous UI responses.
- Distinguish real external integration from mocked services and disclose missing coverage.

## Work items

- [x] Frontend: inspect request ownership, polling, invalidation and account changes in `apps/web`; reproduce excessive calls or stale data in behavior tests before fixing.
- [x] SQL: inspect SELECT projections and access paths in Messaging, Notifications, Analytics and ExerciseCatalog; add query-budget regression tests and measured index migrations where warranted.
- [x] Business security: inspect Billing, Coaching, Offers, Forms, CheckIns, Training and Calendar authorization and state transitions; reproduce confirmed failures with PostgreSQL/HTTP tests, then fix.
- [x] API/media security: inspect JWT, anonymous endpoints, uploads, private storage, worker inputs and dependency advisories; reproduce confirmed failures before fixing.
- [x] Verification: build serially, run all backend/frontend tests, run both browser suites, inspect migration upgrades and restricted runtime access, apply justified development migrations.
- [x] Delivery: update concise performance/security documentation with actual results, limitations and product questions; refresh graphify index and run whitespace checks.

## Verification artifacts

Store machine-specific logs, TRX files, plans and temporary data under ignored `.local/audit-20261008`. Human-readable findings and coverage belong in `docs/architecture/performance-security-audit-2026-10-08.md`.
