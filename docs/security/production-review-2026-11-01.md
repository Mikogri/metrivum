# Production preparation review — 2026-11-01

Scope: current working tree, preserving existing unrelated edits. This is a focused improvement pass, not production deployment or a guarantee that every UI workflow has been exercised.

## Changes

- Security settings reuse the existing account lifetime boundary around asynchronous reauthentication and email/password results. A password operation captures its slot client before waiting and refuses to continue after switching accounts. Deferred-response tests cover both retained and replaced account lifetimes. Browser password verification remains a UX check; production Supabase must enforce the password-change policy server-side.
- Notification dispatch loads enabled devices once per batch instead of once per notification. Push transport batches devices, notification metadata, preferences and active recipients; source-module delivery policies remain authoritative. A device must belong to the notification recipient. No shared cross-account cache or parallel work on a module transaction was added.
- Training activity returns scalar planned-set counts from PostgreSQL instead of transferring complete immutable workout prescriptions. The newly expanded activity contract still needs a bounded third query for logged rows; tests assert its count and prohibit selecting full prescription JSON. Null/empty segment lists count as one set; segmented sets count each segment.
- Additive Notifications migration `20261101130000_PushDeliveryPollingIndex` indexes `AvailableAt` only for Pending/Receipt deliveries. Terminal delivery history stays outside this polling index. Existing indexes are retained. Applied to disposable loopback PostgreSQL only; remote Supabase rollout remains pending.
- Update Storybook to 10.6.5 and Vite to 8.3.5; resolve compatible transitive security fixes. Align seven Expo modules with SDK 57 patch recommendations, retaining pinned versions. No forced SDK downgrade or global incompatible Zod/minimatch replacement.

## Evidence and limits

- Full rebuilt PostgreSQL integration run: 438 passed, 0 failed, 2 skipped. Unit tests: 410 passed. Architecture: 8 passed. Full Vitest run: 741 passed; two additional security-settings regression cases passed separately. Web/mobile TypeScript checks passed; Expo SDK 57 compatibility check and Android production bundle export passed. No physical-device run was performed.
- Secret-pattern scan: 2117 tracked/untracked source files passed; private local configuration is ignored. This does not cover all historical Git blobs or certify local secret storage.
- .NET dependency audit reported no vulnerable packages. npm audit fell from 32 findings (including 1 critical/5 high) to 29 (0 critical/3 high/24 moderate/2 low). Remaining incompatible dependency chains include Expo CLI/Zod, glob/minimatch and deepmerge; see the local audit artifact before production. A zero-advisory claim would be incorrect.
- Real development Supabase logins checked five coaches: own identity matches, another coach's plan returns 404, modified JWT returns 401, anonymous profile access returns 401. Secrets/tokens were not logged. These probes target the running development API, while integration tests exercise the rebuilt code.
- Regression tests cover batched push query count, inactive recipients, disabled devices, open-conversation suppression, account revocation, authentication, cross-owner access, quotas and simulated subscription transitions. No real payment provider, local Supabase Storage instance, physical-device push delivery or complete interactive UI matrix is claimed.
- Synthetic PostgreSQL queue (100,000 rows, 50 pending) used the partial index: 50 results, two local buffer accesses. This proves planner suitability for that distribution, not a production latency gain.

Detailed command output stays in ignored `.local/production-review-*` files. Before release, resolve remaining dependency advisories, run the skipped real Auth/Storage/device cases, review/apply the migration to the intended environment, and complete deployment-specific TLS, secrets, backups and multi-instance checks described in the existing architecture documents.

Security-settings email confirmation (both links, cancelled attempts and concurrent slot replacement) still needs dedicated disposable-account end-to-end testing. The source scan does not establish the remote Auth policy configuration. The complete interactive feature-by-plan UI matrix and horizontal production load have not been certified by these tests.

Advisory references: [Storybook origin validation](https://github.com/advisories/GHSA-f2ph-cmg5-wxc8), [undici TLS options](https://github.com/advisories/GHSA-2m5v-pch6-74hx).
