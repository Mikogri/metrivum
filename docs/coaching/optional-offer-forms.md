# Optional application forms and free offers

An offer revision can have a null `applicationFormVersionId`. The application freezes that choice with its offer terms; later offer edits do not change an existing application. Clients still submit explicitly, Team consent remains mandatory, and the coach still accepts or rejects.

Without a form, `ApplicationDetailDto.formVersion` is null, answers must be `{}`, and profile-field updates are rejected. No synthetic form or submission is created. Database constraints preserve this invariant. Form-backed applications retain validation and matching-submission checks. Invitations and chat shares support either kind of offer.

Free pricing is the existing server-owned zero amount, not a new billing model. Billing settles it automatically after acceptance and retains the normal immutable order, validity and plan-delivery records. Free recurring dues do not require a payment method. Clients cannot supply or override the price.

Deploy migrations `Offers/20261012161026_OptionalApplicationForm` and `Coaching/20261012161041_OptionalApplicationForm` before enabling the updated API. Existing form-backed rows are unchanged. Older clients retain the same request shape for form-backed offers, but must be updated before opening no-form offers because form responses can now be null. Web and native consumers have been updated together; generated contracts come from `infra/export-contracts.ps1`.

Regression coverage includes direct and invited no-form intake, chat sharing, rejected unexpected answers/profile updates, authorization, retries, free validity, free plan copies and recurring free settlement. Browser fixtures cover offer creation with zero/one published form and mandatory Team consent on both desktop and phone.

Verified 2026-10-12: 52 PostgreSQL integration scenarios on an isolated loopback test cluster (51 passed together, the corrected share-header test passed on rerun), 278 web unit tests, 10 browser cases, web/native TypeScript checks, ESLint and production web build. Both migrations were applied to the previously confirmed TrainFlow development project `atclvdkpbccafakzpwls`; column nullability and EF history were checked afterward. Restart the API to load the new code.
