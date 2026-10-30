# Security and quality review — 2026-10-18

Scope: account identity (registration, onboarding, profile edits), web/mobile sign-in flows, API host limits, and the offer/coaching changes made on 2026-10-15. Builds on the [2026-10-14 review](security-audit-2026-10-14.md); areas it covered (JWT validation, MCP, uploads, decoder isolation, secrets, private schemas) were re-checked for regressions, not re-audited. Architecture is unchanged (modular monolith, same module boundaries).

## Findings and corrections

| ID | Severity | Finding (evidence) | Correction |
| --- | --- | --- | --- |
| O1 | High | `DELETE /api/v1/offers/{id}` (added 2026-10-15) deleted published revisions, which `immutable_offer_revision` triggers forbid, and `trainflow_api` had no DELETE on `offers.offers`: every delete returned 503. A new integration test reproduced it. | Only never-published drafts can be deleted; published offers return 409 `OFFER_PUBLISHED` and are archived. `runtime-grants.sql` grants DELETE on `offers.offers` only; revisions keep no DELETE grant and their triggers. Verified as the real `trainflow_api` role. |
| A1 | Medium | Usernames were shape-only (`[A-Za-z0-9_]{3,32}`): `admin`, `support`, `trainflow…`, `_x`, `a__b`, digit-first names were accepted; the web form allowed 30, the API 32. | `AccountIdentityPolicy`: starts with a letter, no leading/trailing or double `_`, reserved list and `trainflow*` refused (`USERNAME_INVALID` / `USERNAME_RESERVED`). Web form mirrors it with `maxLength` 32. Existing usernames remain valid. |
| A2 | Medium | Display names accepted control characters (except NUL), bidi overrides (U+202E), zero-width characters and line breaks, enabling spoofed names in chats, invitations and search; length was checked before trimming. | NFC, trim, whitespace collapse, refusal of control/format/separator/private-use/surrogate code points (ZWJ allowed for emoji); 1–100 after normalisation; `DISPLAY_NAME_INVALID`. Same rule for onboarding and `PATCH /api/v1/me`, web onboarding and settings. |
| A3 | Low | Identity rules existed only in code; a lost unique-index race returned the generic `CONFLICT`. | Migration `AccountIdentityConstraints`: CHECK username shape, `NormalizedUsername = upper(Username)`, trimmed display name ≤ 100, closed role set. Race returns 409 `USERNAME_TAKEN`. |
| A5 | Medium | Onboarding (username probing) and people search (directory scraping) had only the global 120/min limit. | Per-user 10/min for onboarding and coach onboarding, 30/min for people search, `Retry-After` on 429. |
| W1 | Medium | Passwordless sign-in for an unknown address showed an error while a known one continued; sign-up showed "account exists". Both reveal who is registered. Mobile sign-up had the same message. | Both cases continue exactly like the success path (web and mobile). Password reset was already neutral. |
| W2 | Low | Web email check `^[^\s@]+@[^\s@]+\.[^\s@]+$`: no length limits, controls/invisible characters accepted, no trimming. Passwords had no upper bound although bcrypt ignores bytes after 72. | `isValidEmail`/`normalizeEmail` (RFC 5321 lengths, label rules, no controls/bidi/zero-width), used by login, registration and reset; passwords 8–72 bytes with a specific message. |
| A4 | Low | Username error message was mojibake (`3â€“32`). | Rewritten. |

Checked without changes: JWT validation (asymmetric algorithms, issuer/audience/lifetime, session and non-anonymous claims), fallback authorization policy, strict JSON binding (unknown fields rejected — no overposting), 2 MiB body limit, ProblemDetails without internals, `no-store`/`nosniff`, explicit CORS origins, parameterised SQL only (no string-built queries found), SSRF guards on the OAuth consent proxy, analysis subprocess environment, no `dangerouslySetInnerHTML` with untrusted data, `window.open` with `noopener`. CSRF does not apply: the API authenticates with bearer headers, not cookies.

## Database change

`accounts` migration `20261017222349_AccountIdentityConstraints` adds four CHECK constraints and drops them in `Down`. They describe invariants every row already satisfied, so no data is rewritten: applied to a database holding the data of 360+ prior integration tests, reverted and re-applied. If a hand-edited row violates them the migration fails without changing data; fix the row, then re-run. Apply `infra/runtime-grants.sql` again after migrating (new `DELETE ON offers.offers`).

## Verification

Disposable local PostgreSQL 17 (`initdb` in a temporary directory, roles from `infra/bootstrap-roles.sql`, migrations through `--migrate`, `infra/runtime-grants.sql`).

- Integration (real HTTP pipeline + PostgreSQL): **374 passed, 0 failed, 2 skipped** (local Supabase tests). Baseline before the changes: 350 passed, 11 failed for test-environment reasons (repository root and worker binary not found from a temporary build output), all passing once built inside the repository.
- New integration tests: invalid/reserved usernames through the API, display-name normalisation and refusal on PATCH, case-insensitive concurrent username claims (one owner, one `USERNAME_TAKEN`), raw-SQL bypass rejected by each CHECK, per-user onboarding rate limit with `Retry-After`, draft deletion by owner only with version check, published and used offers refused.
- Unit: 316 passed (incl. 51 new identity-policy cases). Architecture: 8 passed.
- Web/mobile: 543 tests passed (new: email validator, identity rules, enumeration-safe sign-in/sign-up, onboarding error mapping); typecheck and lint for all workspaces clean.
- Dependencies: NuGet vulnerable-package check clean for 39 projects; `npm audit` 0 vulnerabilities. Whitespace formatting verified for changed C# files.

## Not changed / open

- **Supabase Auth settings** (remote, needs the project owner): enable CAPTCHA, leaked-password protection, password rules, secure email change and Auth rate limits — listed in [security.md](security.md#account-identity-rules). Sign-in brute force and credential stuffing are bounded by these settings, not by the API.
- **Rate limits are per API instance** and keyed by user (`sub`) or connection IP. Behind a reverse proxy, anonymous requests share the proxy's IP; configure forwarded headers for the real deployment. Only health and OAuth metadata endpoints are anonymous.
- **CORS `AllowCredentials`** is enabled although authentication uses bearer tokens; removing it needs a check of SignalR client settings first.
- Onboarded profiles without a username exist in fixtures and possibly legacy data; "onboarded means named" stays an application rule rather than a database constraint.
- Not exercised: live Supabase email flows, native devices, production deployment. No remote configuration or data was changed.
