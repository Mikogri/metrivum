# Turnstile Auth protection

Web Auth renders a Cloudflare Managed widget with dark theme, flexible size, interaction-only appearance and the active English/Polish locale. Select **Managed** in the Cloudflare widget settings too. Tokens stay in component memory, are consumed before one request, and are invalidated by expiry (conservatively 290 seconds), errors, timeout, account/form changes and unmount. Retries generate a fresh challenge.

Signup also presents the same verification flow for fresh addresses, explicit existing-account errors and identities-free existing-account responses; it no longer reveals registered addresses through a distinct error/link. Supabase project email-confirmation settings must preserve its server-side anti-enumeration behavior.

## SDK and server boundary

Installed `@supabase/supabase-js` **2.117.2** forwards `options.captchaToken` as `gotrue_meta_security.captcha_token` for `signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail` and `resend`. Tests exercise the actual installed SDK transport for each method. Web signup, password/OTP login, reset and confirmation resend pass it, including Settings password-reset, email-change resend and the temporary password-verification client.

Supabase Auth must have Turnstile CAPTCHA enabled and owns server verification with the private secret. Browser gating alone cannot prevent direct Auth calls. Do not perform a separate API Siteverify request: that consumes the token before Supabase can verify it.

`verifyOtp` has a deprecated CAPTCHA option. Email token-hash verification, PKCE exchange, authenticated `updateUser` and MFA methods have no supported CAPTCHA enforcement contract. They retain the existing single-use email/code, PKCE, session/MFA checks and Supabase rate limits. CAPTCHA protects OTP issuance/resend; do not claim it protects completion endpoints.

## Configuration

Cloudflare Pages public build variables:

- `VITE_TURNSTILE_SITE_KEY`: public widget key only.
- `VITE_AUTH_CAPTCHA_REQUIRED=true`: required verification; production also defaults to required when missing. Missing keys and Cloudflare dummy keys fail closed in production.
- `VITE_AUTH_CAPTCHA_REQUIRED=false`: explicit initial rollout override, only with an empty site key and **before** Supabase enforcement. A configured key always activates the widget. The override cannot disable Supabase enforcement.

Put the **private secret only in Supabase** Dashboard / Authentication / Attack Protection / CAPTCHA and select Turnstile. Never put it in VITE variables, logs, storage or source. Confirm the exact project and dashboard settings during the separately approved provider change. No production changes were made.

Restrict the production widget to actual deployed hostnames (`metrivum.com`, and `www.metrivum.com` if served). Use a separate preview widget and test Supabase project. Do not allow localhost on the production widget. Keep `https://challenges.cloudflare.com` in CSP **script-src** and **frame-src**. Do not add wildcard origins or disable CSP. The existing partial repository policy has no script/frame restrictions; any hardened policy must include these allowances. Pre-clearance is not needed.

## Testing

Development may omit both variables only against a separate Supabase environment with CAPTCHA disabled. For server enforcement testing, use a disposable Auth environment with CAPTCHA enabled and Cloudflare documented test key pairs. Public passing site key: `1x00000000000000000000AA`; failing site key: `2x00000000000000000000AB`. Configure the matching documented private test key outside the repository. Never use test keys in production.

Unit/component tests cover missing configuration/tokens, single consumption, expiry/error/retry and stale account/form callbacks. SDK tests check actual request serialization. Browser tests intercept the widget script and Auth responses, verifying desktop/mobile wiring without sending email or contacting production. These are not evidence of live server enforcement.

Successful Auth responses also need an account-lifetime boundary: the installed SDK persists sessions before resolving its promise. Password/signup, OTP completion, callbacks and MFA now use disposable candidate clients whose storage adapter checks the current lifetime and expected identity before writing the slot. Candidates retain the slot's PKCE namespace, reject a slot replaced by another account, and forward only accepted session events to the slot's existing broadcast channel. Disposal stops the candidate without clearing an accepted session. Regression tests use the installed SDK, including an older primary-client refresh racing an accepted sign-in, and desktop/mobile browser navigation while a successful login is pending.

Required separate live acceptance: all five flows in real desktop/mobile browsers; slow script and network errors; retry and expiry; direct Auth calls with absent/invalid tokens; spent-token replay; email links, MFA and account switching. Confirm Supabase denies invalid CAPTCHA requests and check Cloudflare validation analytics. Never log tokens/request bodies.

## Production rollout and rollback

1. Inventory every client using the Auth project, including cached web versions and native mobile. **Native mobile currently does not send CAPTCHA tokens.** Project-wide enforcement will break its signup/login/OTP/reset/resend. Implement and release a reviewed native challenge flow or explicitly retire incompatible supported clients before enabling enforcement.
2. Create the Managed production widget and hostname allowlist. Keep Supabase CAPTCHA disabled. Deploy the compatible web build with the public key and `VITE_AUTH_CAPTCHA_REQUIRED=true`; verify widget loading/CSP and all flows, retries and account switching. Supabase accepts the extra field before enforcement is enabled.
3. Verify real enforcement in the separate test environment, compatible native rollout and old-client retirement. Obtain separate approval for the provider change.
4. Configure Turnstile and its private secret in production Supabase CAPTCHA settings. Smoke-test a controlled small set of valid flows and direct missing/invalid/replayed tokens. Monitor CAPTCHA failures, email abuse/rate limits and Turnstile analytics. Retain Auth rate limits and WAF protection.
5. Rollback with enforcement active must retain CAPTCHA-compatible web/native releases. If disabling enforcement is necessary, obtain separate approval, disable CAPTCHA in Supabase **before** restoring incompatible clients, retain Auth rate limits and record the temporary protection gap. Never roll back frontend compatibility first. The frontend staging override cannot reverse server enforcement.

## Primary references

- [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Cloudflare widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
- [Cloudflare CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [Cloudflare testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)

Enumeration boundary: signup UI now presents the same verification destination for existing and new accounts. Supabase still owns the public Auth response contract; generic UI is not proof that direct provider responses/timing are indistinguishable. Verify that behavior and its rate/CAPTCHA controls against the actual configured project.
