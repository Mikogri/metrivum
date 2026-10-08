# Registration

- Signup offers Client (default) or Coach. This is an onboarding preference carried in the confirmation URL, code-entry page and resend link; it is not an authorization claim. The authenticated onboarding API validates and assigns the selected role.
- Email confirmation remains enabled in the development Supabase project. Its Resend test sender accepts only the Resend account owner's exact email address. Localhost is supported; a verified sender domain is required to deliver to other recipients. Do not disable confirmation to work around delivery errors.
- Supabase may represent SMTP HTTP 500 responses as `AuthRetryableFetchError`. The UI distinguishes these service failures from requests without a response. Inspect Supabase Auth logs for delivery diagnostics; never display raw SMTP errors or credentials to users.
- Registration tests cover both roles, confirmation-code navigation, resend URLs, immediate-session environments and server/network error classification. They mock Auth and do not send email.
