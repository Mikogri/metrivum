"""Builds the Supabase Auth email templates from one layout, so every message looks the same.

Run `python infra/supabase/email-templates/build.py` after editing; paste each generated .html into
Supabase Dashboard -> Authentication -> Emails (see README.md for the mapping and subjects).
Go template variables ({{ .ConfirmationURL }}, {{ .Token }}, ...) are filled in by Supabase Auth.
"""
from html import escape
from pathlib import Path

HERE = Path(__file__).parent

LAYOUT = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#141414;color:#ededed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#141414;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 0 20px;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:#ededed;">Metrivum</td></tr>
<tr><td style="background:#181818;border:1px solid #2a2a2a;border-radius:12px;padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:600;color:#ededed;">{title}</h1>
{body}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:#7a7a7a;">{footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
"""

P = '<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#a0a0a0;">{}</p>'
BUTTON = ('<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>'
          '<td style="border-radius:8px;background:#3ee09a;"><a href="{href}" style="display:inline-block;padding:12px 20px;'
          'font-size:15px;font-weight:600;color:#0d1f16;text-decoration:none;">{label}</a></td></tr></table>')
CODE = ('<p style="margin:0 0 20px;font-size:28px;font-weight:600;letter-spacing:0.3em;color:#ededed;'
        'font-family:ui-monospace,Menlo,Consolas,monospace;">{{ .Token }}</p>')
LINK_FALLBACK = P.format('If the button does not work, copy this link into the browser where you asked for it:<br>'
                         '<span style="word-break:break-all;color:#ededed;">{{ .ConfirmationURL }}</span>')
NOT_YOU = "Didn't ask for this? You can ignore this email; nothing changes without it."
ALERT_FOOTER = ("This is a security notice for {{ .Email }}. If this wasn't you, reset your password from the sign-in page "
                "right away and contact Metrivum support.")


def page(title: str, *parts: str, footer: str = NOT_YOU) -> str:
    return LAYOUT.format(title=escape(title), body="\n".join(parts), footer=footer)


TEMPLATES = {
    # Supabase "Confirm signup".
    "confirm-signup.html": page(
        "Confirm your email",
        P.format("Open the link to finish creating your Metrivum account, or enter this code on the page that asked for it:"),
        CODE,
        BUTTON.format(href="{{ .ConfirmationURL }}", label="Confirm email"),
        LINK_FALLBACK,
    ),
    # Supabase "Magic Link" (sign-in code).
    "magic-link.html": page(
        "Your sign-in code",
        P.format("Enter this code to sign in to Metrivum, or open the link in the same browser:"),
        CODE,
        BUTTON.format(href="{{ .ConfirmationURL }}", label="Sign in"),
        P.format("The code works once and expires soon."),
    ),
    # Supabase "Reset Password": used for a forgotten password and for Settings -> Change password alike.
    "reset-password.html": page(
        "Set a new password",
        P.format("Someone asked to set a new password for the Metrivum account {{ .Email }}. "
                 "Open the link in the same browser where you asked for it."),
        BUTTON.format(href="{{ .ConfirmationURL }}", label="Set a new password"),
        P.format("The link works once and expires after an hour. After you save the new password, other devices are signed out."),
        LINK_FALLBACK,
    ),
    # Supabase "Change Email Address": with secure email change it goes to both the current and the new address.
    "change-email.html": page(
        "Confirm the email change",
        P.format('Your Metrivum account is changing its email from <strong style="color:#ededed;">{{ .Email }}</strong> '
                 'to <strong style="color:#ededed;">{{ .NewEmail }}</strong>.'),
        P.format("Open this link to confirm. We sent a link to both addresses; the change happens only after both are opened. "
                 "Until then you keep signing in with {{ .Email }}."),
        BUTTON.format(href="{{ .ConfirmationURL }}", label="Confirm change"),
        LINK_FALLBACK,
        footer="Didn't ask for this? Don't open the link, and change your password: someone may know it.",
    ),
    # Supabase "Reauthentication" (only used if the project requires it for password changes).
    "reauthentication.html": page(
        "Confirm it's you",
        P.format("Enter this code in Metrivum to confirm a security change:"),
        CODE,
    ),
    # Security notifications (Authentication -> Emails -> Security notifications).
    "notification-password-changed.html": page(
        "Your password was changed",
        P.format("The password for your Metrivum account {{ .Email }} was just changed."),
        footer=ALERT_FOOTER,
    ),
    "notification-email-changed.html": page(
        "Your email address was changed",
        P.format("The email for your Metrivum account changed from {{ .OldEmail }} to {{ .Email }}."),
        footer="If this wasn't you, contact Metrivum support right away from any address.",
    ),
    "notification-mfa-enrolled.html": page(
        "Two-factor method added",
        P.format("A new sign-in verification method ({{ .FactorType }}) was added to your Metrivum account {{ .Email }}."),
        footer=ALERT_FOOTER,
    ),
    "notification-mfa-unenrolled.html": page(
        "Two-factor method removed",
        P.format("A sign-in verification method ({{ .FactorType }}) was removed from your Metrivum account {{ .Email }}."),
        footer=ALERT_FOOTER,
    ),
}

if __name__ == "__main__":
    for name, html in TEMPLATES.items():
        (HERE / name).write_text(html, encoding="utf-8", newline="\n")
    print(f"Wrote {len(TEMPLATES)} templates to {HERE}")
