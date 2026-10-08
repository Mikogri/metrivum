# Platform subscriptions

Individual Free/Pro subscriptions belong to an authenticated account independently of coaching-service purchases. Both plans expose the same current product features. Roles, resource access and explicit overrides still apply. Team is a separate organization with owner-paid seats; see [Team organizations](team-organizations.md).

## Checkout and currency

The app-bar Plans panel and `/app/subscription` show Free, Pro and Team. Pro checkout creates a server-owned due and explicit confirmation settles through the existing simulator. Successful confirmation starts a full calendar month. Selecting Free or cancelling renewal retains Pro until the paid period ends. Team uses its own frozen quote and organizational checkout; the individual endpoint rejects legacy Team purchases.

Server prices are configured at `Billing:PlatformPlans:{Pro|Team}:{Amount,Currency,PriceVersion,TermsVersion}` in API `appsettings.json`: Pro USD 25/month, Team USD 20/seat/month. Missing configuration blocks purchase. Immutable accepted prices and history survive later price changes. Payments are simulated; no real money moves or card details are collected.

`PlatformCurrencyConverter` uses profile currency and ECB reference rates through Frankfurter. It caches pairs for one hour, validates the date and currency pair, and rounds to two decimals. Rate/date are part of the accepted price version. Unavailable/stale rates stop checkout; no browser-supplied amount is trusted. Supported currencies follow account settings. Team upgrade credit requires matching source/payment currency and does not invent a separate FX policy.

Optional renewal requires explicit consent and an eligible simulated method. Unpaid personal renewal becomes Free at expiry; unpaid Team renewal becomes BillingInactive without deleting the organization. The durable worker starts one valid cycle after an outage rather than charging for missed months. Platform purchases stay outside coaching earnings. Service commissions retain configured Free 10% / Pro 5% and explicit overrides; active Team eligibility uses Pro terms. Historical fee/seller snapshots remain unchanged.

## APIs

All routes require an authenticated bearer token. Prefix: `/api/v1`.

| Route | Request / result |
| --- | --- |
| `GET /subscriptions/plans` | Server plan prices in profile currency, price versions and capabilities |
| `GET /me/platform-subscription` | Individual plan, paid period, pending due and version |
| `POST /me/platform-subscription/checkout` | Pro plan, price version, optional renewal/method; subscription with stored pending due |
| `POST /me/platform-subscription/confirm-payment` | Due ID, idempotency key, optional method; resulting subscription after simulated attempt |
| `POST /me/platform-subscription/change-plan` | Free and current version; scheduled end-of-paid-period downgrade |
| `POST /me/platform-subscription/cancel-renewal` | Current version; retain paid access |
| `POST /me/platform-subscription/renewal` | Version, explicit auto-renew and method |
| `GET /me/platform-subscription/history` | Latest 100 personal plan changes and platform payments |

See the [Team API map](team-organizations.md#api-map) for organizational checkout, seats, invitations, roles and lifecycle. OpenAPI and generated TypeScript are authoritative for fields.

## Verification

Billing integration tests exercise actual PostgreSQL constraints and immutable ledger records, simulated declines/retries, delayed confirmation, expiry and authorization. Currency tests use deterministic responses, including stale and malformed rates. Browser scenarios cover explicit quote review, plan history, mobile and desktop. Current Stage 6 verification and migration status are recorded in [Team organizations](team-organizations.md).
