import { useState, type FormEvent } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { Alert, Button, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionManager } from "~/shared/session/SessionProvider";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText } from "../lib/authErrors";
import { callbackUrl, EMAIL_PATTERN, slotParam } from "../lib/urls";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Reset password — TrainFlow");

export default function ForgotPassword() {
  const m = useT();
  const t = m.auth.forgot;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!EMAIL_PATTERN.test(email) || slot === null) return;
    setPending(true);
    setError(null);
    try {
      const { error: resetError } = await manager.client(slot).auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl(slot, "/auth/reset-password", email),
      });
      if (resetError) throw resetError;
      // Same message whether or not the account exists, to avoid account enumeration.
      setSent(true);
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={t.title} subtitle={t.body} />
      {slot === null ? <Alert tone="warning" title={m.auth.login.full} /> : null}
      {sent ? <Alert tone="success" title={t.sent} live="polite" /> : null}
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      {sent || slot === null ? null : (
        <form className={form.form} onSubmit={onSubmit} noValidate>
          <TextField placeholder={m.common.ph.email}
            label={m.auth.email}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            isRequired
            isInvalid={submitted && !EMAIL_PATTERN.test(email)}
            errorMessage={m.auth.errors.emailInvalid}
            size="lg"
          />
          <Button type="submit" variant="primary" size="lg" block loading={pending}>
            {t.submit}
          </Button>
        </form>
      )}
      <AuthFooter>
        <RouterLink to="/auth/login">{t.backToLogin}</RouterLink>
      </AuthFooter>
    </>
  );
}
