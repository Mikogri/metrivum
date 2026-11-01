# Supabase Auth email templates

Sent by Supabase Auth through Resend SMTP as `Metrivum <noreply@metrivum.com>`. Edit `build.py`, run
`python infra/supabase/email-templates/build.py`, then paste each file into Supabase Dashboard → Authentication →
Emails. Keep `{{ .ConfirmationURL }}`: it carries the redirect with the slot and the browser-held nonce that
`/auth/callback` requires; never build callback URLs by hand.

| Supabase template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Confirm your Metrivum email |
| Magic Link | `magic-link.html` | Your Metrivum sign-in code |
| Reset Password | `reset-password.html` | Set a new Metrivum password |
| Change Email Address | `change-email.html` | Confirm your Metrivum email change |
| Reauthentication | `reauthentication.html` | Your Metrivum confirmation code |
| Password changed (notification) | `notification-password-changed.html` | Your Metrivum password was changed |
| Email address changed (notification) | `notification-email-changed.html` | Your Metrivum email address was changed |
| MFA method added (notification) | `notification-mfa-enrolled.html` | A two-factor method was added to your Metrivum account |
| MFA method removed (notification) | `notification-mfa-unenrolled.html` | A two-factor method was removed from your Metrivum account |

With secure email change on, Supabase sends `change-email.html` to both the current and the new address. Set the SMTP
password (a Resend API key with sending access only) in the dashboard only. See
[account security](../../../docs/security/account-security.md) for the full configuration list.
