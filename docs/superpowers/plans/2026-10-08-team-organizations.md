# Stage 6: Team organizations

Approved source: `C:/Users/Mikolaj/Downloads/trainflow_codex_stage_06_team_organizations.md`.

## Audit and dependencies

Existing Team rows live in Billing and have neither paid capacity nor roles. Extend this model. Billing already owns simulated orders, dues, settlements and durable renewals. Coaching owns unique coach/client relationships; downstream resources are private to their original participants. Never broaden those historical permissions through membership.

Development project: `atclvdkpbccafakzpwls`, confirmed in `infra/development-target.json`. Current development data has no teams/memberships/Team subscriptions. Existing data defaults to Personal. Preserve the dirty working tree and do not publish/deploy production.

## Verified slices

1. Billing: distinct organizational subscription, frozen seat quotes, immutable credit source, confirmation idempotency and calendar-period proration. Reuse settlement; block currency mismatch and excess credit pending an explicit residual-credit policy. Individual cancellation preserves paid access.
2. Membership: Owner/Admin/Member authorization, paid seat allocation under transaction locks, one current membership, invitations, recent-authenticated ownership acceptance, scheduled dissolution and durable transitions. Accounts.Contracts provides a narrow Team access boundary.
3. Coaching: separate organizational cases/assignment history and explicit client consent. Preserve personal resource history. Reject transfers with unresolved personal service obligations; use module contracts only.
4. UI: existing Subscription, Team and Analyze routes, authoritative allowed actions, quote review and explicit simulated confirmation, invitations, members, clients and dissolution consequences. No second application.
5. Integrate ownership-aware analytics and future resource operations; never aggregate current members' private records as Team data.
6. Generate EF migrations and OpenAPI; test clean/existing databases, apply only to verified development, refresh graph and document exact delivery gaps.

## Verification

Baseline: 18 billing integration tests and 148 frontend tests passed. Add PostgreSQL races for last seat, duplicate payment/credit, consent and dissolution. Verify 100 PLN paid Pro at half-period + 300 PLN Team = 50 PLN credit / 250 PLN due. Negative tests cover nonmembers, member vs admin, expired Teams, historical private data and cross-team access. Preserve immutable settlement attribution and separate currencies. Run backend regression, frontend types/tests/build and browser Team/checkout smoke scenarios before reporting completion.

## Delivery

All six slices completed within the documented conservative resource policies. Seven migrations applied to the confirmed development project; existing data fingerprints and restricted runtime write/read verified. Final results: 188 unit, 234 integration and 2 architecture tests passed (2 optional external fixtures skipped), 148 frontend tests and 50 browser scenarios passed. See [Team organizations](../../coaching/team-organizations.md) for exact migrations, API map, verification and blocked financial policies. No production deployment or Git publication.
