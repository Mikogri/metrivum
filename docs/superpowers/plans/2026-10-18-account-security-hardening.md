# Account identity and API hardening — implementation plan

> Executed natively in the session that wrote it (the request asked for implementation, not a plan review).

**Goal:** Close the concrete gaps found in the 2026-10-18 review of accounts, auth flows and recent offer/coaching changes without changing architecture or business behaviour.

**Architecture:** Modular monolith stays. Rules live in the owning module (`Accounts` domain for identity, `Offers` for deletion); the API host only adds rate-limit policies. Database constraints back the application rules.

**Tech stack:** ASP.NET Core 10 minimal APIs, EF Core + Npgsql (PostgreSQL 17), Supabase Auth (credentials, email, sessions), React Router 7 web client.

## Findings driving the work (evidence in the review notes of each task)

| ID | Severity | Finding |
|---|---|---|
| A1 | Medium | Username rule is shape-only: reserved names (`admin`, `support`, `trainflow…`), leading/trailing/double underscores and digit-first names are accepted. |
| A2 | Medium | Display name accepts control, bidi-override and zero-width characters (spoofing in chats, invitations, search). No Unicode normalisation; length is checked before trimming. |
| A3 | Low | Username/display-name rules exist only in application code; the database accepts anything that fits the column. A unique-index race returns a generic conflict code. |
| A4 | Low | Validation message for usernames is mojibake (`3â€“32`). |
| A5 | Medium | Identity-sensitive endpoints (onboarding, people search) share only the global 120/min limiter, so username probing and directory scraping are cheap. |
| W1 | Medium | Passwordless sign-in reveals whether an email has an account (error vs. "code sent"); sign-up reveals existing accounts (`user_already_exists`). |
| W2 | Low | Client email check is `^[^\s@]+@[^\s@]+\.[^\s@]+$`: no length limits, accepts control characters, no trimming. |
| O1 | High | Offer deletion (added 2026-10-15) tried to delete published revisions, which database triggers forbid, and the runtime role has no DELETE on offers: every delete returned 503. Deleting published offers would also have raced with new applications. |

Out of scope (reported, not changed): Supabase Auth project settings (CAPTCHA, leaked-password protection, password policy, auth rate limits) are remote configuration and need the owner's approval; forwarded-header handling depends on the hosting proxy.

## Tasks

### Task 1: Central account identity policy (A1, A2, A4)
- Create `backend/modules/Accounts/TrainFlow.Accounts/Domain/AccountIdentityPolicy.cs` with
  `UsernameError? CheckUsername(string)`, `string NormalizeDisplayName(string)` (throws `ApiException` 400 `DISPLAY_NAME_INVALID`).
- Username: 3–32 chars, `[A-Za-z0-9_]`, starts with a letter, no leading/trailing `_`, no `__`, not a reserved name, not starting with `trainflow`; error code `USERNAME_INVALID` / `USERNAME_RESERVED`.
- Display name: NFC, trim, collapse whitespace runs to one space, reject C0/C1 controls, line/paragraph separators, bidi controls (U+202A–U+202E, U+2066–U+2069, U+200E/F, U+061C), zero-width characters except ZWJ, private use and lone surrogates; 1–100 chars after normalisation.
- `AccountRules.ValidateOnboarding/ValidateSettings` delegate to it; onboarding and PATCH store the normalised value. Existing usernames stay valid (they are immutable after onboarding).
- Unit tests in `tests/Unit/TrainFlow.UnitTests/AccountIdentityPolicyTests.cs`: accepted/rejected tables, every reserved name in any case, bidi/zero-width/control samples, NFC equivalence, whitespace collapse.

### Task 2: Database constraints and conflict code (A3)
- EF migration `AccountIdentityConstraints` on `accounts.profiles`: CHECK username shape (`^[A-Za-z0-9_]{3,32}$`), CHECK `NormalizedUsername = upper(Username)`, CHECK a trimmed display name of at most 100 characters ("onboarded means named" stays in code: fixture and legacy rows break it); CHECK `user_roles.Role` in the four known roles. `Down` drops them. Shape-only CHECKs, so existing rows created through the API satisfy them; the migration fails loudly (no data change) if a hand-edited row does not.
- Onboarding maps the unique-index violation to 409 `USERNAME_TAKEN`.
- Integration tests: invalid usernames via direct API → 400 with code; same username from two users in parallel → one 200, one 409 `USERNAME_TAKEN`; raw SQL inserts breaking each CHECK are rejected by the database.

### Task 3: Rate limits for identity endpoints (A5)
- Named policies in the API host: `account-identity` (10/min per user) for onboarding and coach onboarding; `account-directory` (30/min per user) for `/api/v1/accounts/people`. 429 carries `Retry-After`.
- Integration test: 11th onboarding attempt within a minute → 429 `RATE_LIMIT_EXCEEDED`.

### Task 4: Offer deletion only for never-published drafts (O1)
- `OffersService.DeleteAsync` deletes only offers without revisions; published ones return 409 `OFFER_PUBLISHED` (archive instead). Drafts cannot have applications or invitations, so there is no intake race.
- `infra/runtime-grants.sql`: `DELETE ON offers.offers` for `trainflow_api` (revisions stay without DELETE and behind triggers).
- Offer page: Delete only for never-published offers; otherwise Archive with the reason.

### Task 5: Web auth flows and validation (W1, W2, client side of A1/A2)
- `apps/web/app/modules/auth/lib/email.ts`: `normalizeEmail` (trim) and `isValidEmail` (≤254, local ≤64, no controls/whitespace, one `@`, dotted domain with valid labels). Used by login, register, forgot-password, verify.
- Passwordless sign-in: account-not-found errors continue to the "code sent" step. Sign-up: existing-account errors continue to the verification step with neutral copy.
- Onboarding: client-side username check mirrors Task 1 and server codes `USERNAME_*` / `DISPLAY_NAME_INVALID` map to field errors.
- Tests: email validator table, enumeration-safe flows, onboarding error mapping.

### Task 6: Documentation and verification
- `docs/architecture/security.md`: identity rules, DB constraints, rate limits, enumeration stance, Supabase settings to enable. Regenerate OpenAPI/TS contracts.
- Run: backend build, unit, architecture, integration (disposable local PostgreSQL), web typecheck/lint/tests.

## Review focus
1. Existing accounts whose usernames break the new rules must keep working (the rules apply to new onboarding only; DB CHECK is shape-only).
2. Display names with legitimate non-Latin text and emoji (incl. ZWJ sequences) must still be accepted.
3. Parallel onboarding with one username must yield exactly one owner.
4. Rate limiting must not affect normal flows (one onboarding call, typing in search with debounce).
5. Neutral sign-in/sign-up responses must still let a real user finish verification.
