import { useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { Alert, Button, TextField } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import {
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { useTurnstile } from "../components/Turnstile";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText } from "../lib/authErrors";
import { EMAIL_RESEND_SECONDS } from "../lib/assurance";
import { callbackUrl, slotParam } from "../lib/urls";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { useCooldown } from "../lib/useCooldown";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Reset password — Metrivum");

export default function ForgotPassword() {
  const m = useT();
  const t = m.auth.forgot;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [wait, startWait] = useCooldown();
  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));

  const captcha = useTurnstile(
    `reset:${params.toString()}:${state.generation}:${normalizeEmail(email)}`,
  );

  async function send() {
    if (!isValidEmail(email) || slot === null || pending || wait > 0) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    const address = normalizeEmail(email);
    setPending(true);
    setError(null);
    try {
      const { error: resetError } = await manager
        .client(slot)
        .auth.resetPasswordForEmail(address, {
          ...captchaOptions,
          redirectTo: callbackUrl(slot, "/auth/reset-password", address),
        });
      if (!captcha.isCurrent()) return;
      if (resetError) throw resetError;
      // Same message whether or not the account exists, to avoid account enumeration.
      setSent(true);
      startWait(EMAIL_RESEND_SECONDS);
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      setError(authErrorText(m, caught));
    } finally {
      if (captcha.isCurrent()) setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    void send();
  }

  return (
    <>
      <AuthHeader title={t.title} subtitle={t.body} />
      {slot === null ? (
        <Alert tone="warning" title={m.auth.login.full} />
      ) : null}
      {sent ? (
        <Alert tone="success" title={t.sent} live="polite">
          {m.accountSecurity.password.sameBrowser}
        </Alert>
      ) : null}
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      {captcha.widget}
      {slot === null ? null : sent ? (
        <div className={form.row}>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => void send()}
            loading={pending}
            isDisabled={wait > 0 || !captcha.ready}
          >
            {wait > 0 ? t.resendIn(wait) : t.resend}
          </Button>
          <button
            type="button"
            className={form.textButton}
            disabled={pending}
            onClick={() => {
              setSent(false);
              setSubmitted(false);
              setError(null);
            }}
          >
            {t.otherEmail}
          </button>
        </div>
      ) : (
        <form className={form.form} onSubmit={onSubmit} noValidate>
          <TextField
            placeholder={m.common.ph.email}
            label={m.auth.email}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            isDisabled={pending}
            isRequired
            isInvalid={submitted && !isValidEmail(email)}
            errorMessage={m.auth.errors.emailInvalid}
          />
          <Button
            type="submit"
            variant="primary"
            block
            loading={pending}
            isDisabled={wait > 0 || !captcha.ready}
          >
            {wait > 0 ? t.resendIn(wait) : t.submit}
          </Button>
        </form>
      )}
      <AuthFooter>
        <RouterLink to="/auth/login">{t.backToLogin}</RouterLink>
      </AuthFooter>
    </>
  );
}
