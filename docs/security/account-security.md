# Account security: password, email, two-factor and recovery

Supabase Auth owns every credential. Metrivum adds screens, step-up checks and one API rule. It has no password
store, reset tokens or TOTP code of its own.

## Pages

| Page | Route | What happens |
| --- | --- | --- |
| Overview | `/app/settings?section=security` | Status only: email (with a pending change), password, two-factor status, recovery methods. Each row links to its page. Recommends two-factor when it is off; the copy for coaches mentions client accounts and payments. |
| Change password | `/app/settings/security/change-password` | Sends a Supabase recovery link to the account's verified address. There is no current/new password form. |
| Set new password | `/auth/reset-password` | The only password form. Used for both a forgotten and a changed password. |
| Change email | `/app/settings/security/change-email` | New address → confirm identity → Supabase secure email change → pending status with resend or start over. |
| Two-factor | `/app/settings/security/two-factor` | TOTP status, apps list, setup (name → QR/key → code), removal. |
| Recovery methods | `/app/settings/security/recovery` | Methods in place, what to do in each loss case, support contact (`VITE_SUPPORT_EMAIL`). |
| Second step at sign-in | `/auth/mfa` | Code from an authenticator app. |

## Flows

### Password (forgotten or changed)

1. `resetPasswordForEmail(address, { redirectTo: /auth/callback?slot&nonce&next=/auth/reset-password })`.
   - The public form answers the same whether or not the account exists.
   - A 60-second wait applies between sends; Supabase limits sending on its side too.
2. `/auth/callback` checks the browser-held nonce and the slot, then exchanges the PKCE code.
   - It also checks that the session's email is the one the link was requested for.
   - It records a tab-scoped recovery marker for that account, valid for one hour.
3. `/auth/reset-password` opens only with that marker.
   - A signed-in session alone cannot set a password from the app.
   - Without the marker it explains the link is invalid, expired or opened elsewhere, and offers a new link.
4. An account with a verified second factor first enters a code; the link proves the inbox, not the phone.
5. After `updateUser({ password })`:
   - the marker is cleared;
   - `signOut({ scope: "others" })` ends every other session;
   - a success page is shown.

Links point to `window.location.origin`, so each environment (local, preview, production) gets its own links. Its
callback URL must be on the Supabase redirect allowlist.

### Email (secure email change)

1. Enter the new address. It cannot be the current one.
2. Confirm identity:
   - **Password accounts:** the current password, checked with a throwaway client that keeps no session. The check runs before the code is used.
   - **Accounts with two-factor:** also a fresh authenticator code.
   - **Code-only accounts:** the confirmation sent to the current address is the proof.
3. `updateUser({ email }, { emailRedirectTo: /auth/callback?flow=email-change&slot&nonce })`. Supabase sends links to both addresses.
4. Pending status shows both addresses:
   - "Resend links" calls `resend({ type: "email_change" })`.
   - "Use a different address" restarts the change; a new request replaces the pending one.
5. `/auth/callback` confirms each link against the signed-in account and nonce. The first link shows "one more link to open". The second completes the change and refreshes the session.

Rules:
- The user id never changes.
- `auth.users.email` is never written by Metrivum.
- The API stores no email, so an unconfirmed address never reaches business data.

### Two-factor (TOTP, Supabase MFA)

**Setup:**
1. Earlier unfinished setups are removed.
2. `mfa.enroll({ factorType: "totp", friendlyName, issuer: "Metrivum" })` returns the QR code and key. They are shown once and never stored or logged by Metrivum.
3. `mfa.challengeAndVerify` with the code. Supabase verifies the factor, raises the session to `aal2` and signs out other sessions.

**Sign-in:**
- `AccountGate` sends any session at `aal1` of an account with a verified factor to `/auth/mfa` before anything private loads.
- This covers password, email code and link sign-ins.
- `/auth/mfa` refreshes the session once, so factors and level come from Auth.

**More apps:** up to Supabase's limit. More than one app is the recommended backup.

**Removal:**
- Needs a fresh code, plus the current password on password accounts.
- Supabase itself requires `aal2` to unenroll a verified factor.
- Removing the last app turns two-factor off.

**API enforcement** (`Supabase:Auth:RequireSecondFactorWhenEnrolled`, default `false`):
- For tokens whose `aal` is not `aal2`, the API asks Auth's own records through `accounts.auth_session_meets_second_factor`. If the account has a verified factor, it answers `401` with `code: "MFA_REQUIRED"`.
- `aal2` tokens skip the lookup.
- The web app opens `/auth/mfa` on that code.
- Turn it on only after applying `infra/auth-second-factor.sql`. Regression probe: `infra/diagnostics/test-auth-second-factor.sql`.

## What to configure

### Supabase dashboard

These are remote settings; the application does not change them.

- **Authentication → Sign In / Providers → Email:**
  - keep **Secure email change** on;
  - keep email confirmation on;
  - optionally turn on **Secure password change**. Recovery sessions are recent sign-ins, so the reset form keeps working.
- **Authentication → Multi-Factor:** enable **TOTP** (enroll and verify).
  - Leave phone/SMS MFA off.
  - Recovery codes are experimental in supabase-js and not used yet.
- **Authentication → URL Configuration:**
  - site URL;
  - an exact redirect allowlist per environment, for example `http://localhost:5173/auth/callback` and `https://app.metrivum.com/auth/callback`.
- **Authentication → Rate Limits:** emails per hour, token verifications, sign-ins. Enable **CAPTCHA** for sign-up, sign-in and reset before public release.
- **Authentication → Emails → SMTP Settings (Resend):**
  - host `smtp.resend.com`, port `465` (or `587`), user `resend`;
  - password: a Resend API key with sending access only;
  - sender `noreply@metrivum.com`, name `Metrivum`.
  - The key is entered only in the Supabase dashboard; never in the repository or a `VITE_*` variable.
  - Verify `metrivum.com` in Resend (SPF, DKIM, DMARC) first.
- **Authentication → Emails → Templates:** paste the files from `infra/supabase/email-templates/` (see its README).
- **Security notifications:** turn on password changed, email changed, MFA method added and MFA method removed.
- **Access-token lifetime:** keep it short (for example 15 minutes). The API validates tokens locally between session checks.

### Database (Supabase SQL editor, as the database administrator)

- Apply `infra/auth-second-factor.sql`, then set `Supabase__Auth__RequireSecondFactorWhenEnrolled=true` for the API.

### Web

- `VITE_SUPPORT_EMAIL`: optional. Shown on Recovery methods.

## Security events

Supabase Auth records sign-ins, password and email changes, factor enrolment and removal in its audit log (Authentication → Logs), and sends the notification emails above. The API logs `Refused a first-level session for user {UserId}` when it refuses an `aal1` session. Passwords, codes, TOTP secrets, tokens and links are never logged.

## Deferred, by design

### Recovery without the old email

Supabase has no flow that skips the old address based on a TOTP code, and a code alone must not authorize an address change. Until the procedure below is built, recovery without the old inbox goes through support. Support may refuse when identity cannot be confirmed reliably.

Planned procedure (needs its own threat model, implementation and tests before release):

1. The person signs in with their current method and passes the second factor (`aal2`, fresh within minutes).
2. They request recovery to a new address, which must prove ownership through a one-time link sent to that new address.
3. The backend records the request:
   - a security notice goes to the old address with a cancel link;
   - a waiting period (for example 72 hours) starts, during which any sign-in from the old address can cancel it.
4. Extra checks:
   - no recent password reset or factor change;
   - rate limits per account and per IP;
   - optional manual review for coach accounts that hold client payments.
5. Only then does a server-side job call the Supabase Admin API (`auth.admin.updateUserById`) with the service key. The key stays on the backend, and the call is audited.
6. All sessions are revoked and both addresses are notified.

No endpoint may change an email from a session alone. The Admin API must never be reachable from the browser.

### Phone / SMS

- A phone number is never required.
- The settings model has room for an optional phone factor: `verifiedFactors` already counts `phone`, and Recovery methods lists it as "not available yet".

Before enabling it:
- choose an SMS provider with a cost cap;
- verify the number with a code;
- block a newly added number from recovery or sign-in alone for a waiting period;
- notify the email address;
- keep TOTP as the recommended method. SMS is weaker: SIM swap, interception.

### Backup codes

- supabase-js offers `mfa.recoveryCodes` behind an experimental flag. It needs the server feature turned on.
- Add it once Supabase marks it stable: generate at `aal2` after TOTP setup, show once, show remaining count on Recovery methods.

Email confirmation is authoritative in Supabase Auth (`email_confirmed_at`), not an editable profile flag. Web session admission, restoration, auth events, revalidation and token access reject unconfirmed accounts. The API session predicate in `infra/auth-session-validation.sql` also requires confirmation; apply this reviewed helper update separately as the database administrator. Keep Supabase Email provider **Confirm email** enabled: disabling it auto-confirms new users, so no application timestamp check can distinguish that from confirmation by email. Do not clear confirmation timestamps of existing users automatically.
