# Dependency remediation — 2026-10-14

Publication scope: this security/dependency commit excludes the separate pending MCP, offer, collaboration-file and UI feature changes. Full-workspace test totals below include those local features. MCP middleware fixes/tests remain with that pending feature; they are not part of this published snapshot.

The four outstanding npm advisories are addressed through three auditable private source forks and an official, scoped `uuid` update. See [mobile dependency review](../mobile/dependency-review.md) and each `vendor/*` provenance file. Expo SDK 57 is preserved; SDK-managed native packages were aligned with its recommended versions. Native dependency changes require rebuilding the development client.

The voice module imports `requireOptionalNativeModule` through Expo's public export instead of relying on an undeclared, accidentally hoisted `expo-modules-core` dependency. A clean installation exposed this assumption; mobile TypeScript and all 53 mobile tests pass with the public import.

Use the root `packageManager` version, npm 11.21.0. Older npm 11.17.0 incorrectly resolves/reports the workspace file overrides. `engine-strict` rejects unsupported installers and CI installs the pinned version before `npm ci --ignore-scripts`. A clean install and 17 security dependency regressions passed; no audit suppressions or forced Expo downgrade were added.

## Integration infrastructure

The full PostgreSQL suite previously exhausted Windows shared-memory reservations under unbounded fixture concurrency; forced database drops and clearing global pools could interrupt unrelated tests. Fixture concurrency is now capped at four. Test-owned connections are disposed before ordinary database deletion; only fixtures relying on implicit EF pools disable their own pooling. Explicit concurrent business-rule tests remain concurrent. No assertion or existing Supabase environment guard was weakened. Vitest similarly caps workers at four to avoid JSDOM process pressure without extending assertion deadlines.

## Verification

- Full unfiltered integration project: **350 total, 348 passed, zero failed, two skipped** on disposable loopback PostgreSQL. No production/shared database was used.
- The two skipped tests require actual local Supabase Auth/JWKS and Storage. Docker, WSL and a local Supabase stack are unavailable; the user confirmed no Docker. These tests remain outstanding and retain their explicit environment checks.
- Backend unit: **223 passed**; architecture: **8 passed**; frontend/native UI tests: **383 passed**; security dependency regressions: **17 passed**.
- Clean npm install and the final npm audit report zero known advisories; NuGet audit reports zero vulnerable packages across 39 projects. Workspace TypeScript, ESLint, the secret guard (1,589 source files) and the production web build passed. Logs, TRX and build evidence are ignored under `.local/dependency-fixes-2026-10-14/`.
- Expo version check, Android/iOS Metro/Hermes exports and the native Android debug APK build passed (520 Gradle tasks; exit 0). APK: `.local/dependency-fixes-2026-10-14/trainflow-mobile-dev.apk`. Gradle/upstream deprecation warnings remain. iOS native compilation and device acceptance were not executed; an APK build does not prove runtime/device behavior.

Reproduce using `npm ci --ignore-scripts`, `npm run test:security-dependencies`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and the documented mobile build helper. Run the unfiltered Integration project with `TRAINFLOW_TEST_DATABASE` set to an explicit disposable local PostgreSQL database; provide the guarded local Supabase environment separately to execute the remaining two tests.

## Published snapshot verification

The isolated staged snapshot (without pending features) passed locked .NET restore, a warning-free solution build, 220 unit tests, eight architecture tests, four artifact/host isolation tests, clean npm installation, all 17 dependency regressions, 357 frontend/mobile tests, TypeScript and ESLint. Full-workspace PostgreSQL evidence above remains separate from these publication checks. Source secret-pattern checks passed; Gitleaks reported two reviewed generic-key heuristics in unchanged public upstream node-forge documentation/code, not application credentials.
