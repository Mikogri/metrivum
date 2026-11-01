# Stage 02 verification — 2026-10-07

## Implemented

Forms, Offers, Coaching intake/services, CheckIns and simulated Billing are integrated with the existing account/feature/relationship policies. The web app includes coach/client navigation, forms and offer editors, applications, invitations, services, schedules, responses/reviews, payments, earnings and currency preferences. [UI guide](../frontend/coaching.md).

## Tested

| Command/check | Result |
| --- | --- |
| `dotnet test Metrivum.slnx -c Release --no-restore -m:1` with loopback `TRAINFLOW_TEST_DATABASE` | 228 passed: 104 unit, 122 PostgreSQL/HTTP integration, 2 architecture; 2 external Supabase Auth/Storage tests skipped |
| `dotnet test tests/Integration/Metrivum.IntegrationTests -c Release --filter "FullyQualifiedName~CheckInTests\|FullyQualifiedName~DatabasePrivilegeTests"` after index migration | 10 passed, no skips |
| `powershell -NoProfile -File infra/test-stage02-migrations.ps1` | Clean database and stage 1 roll-forward passed; 11 owned schemas, 22 EF histories, expected constraints/indexes/grants; 10 seeded rows preserved |
| Existing DevFixtures console with `--stage 2` | Two runs as restricted local `trainflow_api`; identical IDs/counts: 3 forms, 1 offer, 2 applications/services/orders/payments, 1 invitation, 2 schedules, 3 requests, 1 reviewed response and 1 provider transaction |
| `npm run typecheck` | All workspace checks passed |
| `npm test` | 99 tests passed across 20 files |
| `npm run lint` | Passed |
| `npm run build` | Production client/server build and public prerender passed |
| `npm run e2e:coaching` | 8 desktop/mobile browser tests passed; subsequent four editor/screenshot checks passed |
| `dotnet format whitespace Metrivum.slnx --no-restore --verify-no-changes` | Passed after formatting |
| `powershell -NoProfile -File infra/scan-secrets.ps1`, plus equivalent tracked/untracked source scan | Passed; ignored runtime credentials remain outside Git |
| `git diff --check` | Passed |

Browser tests use explicit mock Auth and intercepted API fixtures; backend workflows use real PostgreSQL. They do not establish live browser-to-Supabase authentication or Storage coverage. Desktop/mobile form and schedule screenshots were inspected locally. Independent source reviews covered module boundaries, ownership, financial concurrency, snapshots, recurrence and UI dirty-state/permission handling.

## Migrations created

Accounts: `ProfileSystemFields`; Access: `StageTwoFeatures`; Forms: `InitialForms`; Offers: `InitialOffers`, `OfferDefinitionGuards`; Coaching: `CoachingIntake`, `GuardServiceRelationshipClient`; Billing: `InitialBilling`, `FinancialAuditGuards`; CheckIns: `InitialCheckIns`, `IndexCheckInForeignKeys`.

## Applied to dev

Confirmed project: Super Team / Metrivum, `atclvdkpbccafakzpwls`. Supabase history records:

- `20261006222821_coaching_stage02_offers_forms_leads_checkins_billing` — ten EF migrations plus explicit grants.
- `20261006223048_coaching_stage02_checkin_foreign_key_indexes` — five covering FK indexes and one EF history entry.

Existing counts remained 9 profiles, 482 exercises, 4 plans and zero relationships/groups. New module tables remained empty after deployment. A direct TLS connection as `trainflow_api` verified profile bootstrap, form/version insert-update-read and new module reads inside a rolled-back transaction. Runtime has no schema CREATE. API restarted; `/health/ready` returned 200/ready and an unauthenticated forms request returned 401.

Post-deployment advisors report no unindexed FKs. New/low-traffic unused-index notices remain informational. The existing Auth leaked-password protection warning remains a separate project setting; see [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No Auth settings were changed.

## Not applied

No production deployment or Git push. No synthetic Auth users or persistent fixtures were added to Supabase. Stage 1 and existing frontend work remain in the current checkout.

## Blocked

FileAttachment questions remain unavailable until Media supports private attachment authorization for the coach/client workflow. Two live local Supabase Auth/Storage tests require their opt-in test environment.

## Deferred

Real-money providers/card entry, refunds/chargebacks, notification delivery, calendar, chat, program assignment/execution and marketplace search. External settlements use an explicit zero-fee policy; future commission policy is not inferred.
