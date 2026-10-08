import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, TextField, toast } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager } from "~/shared/session/SessionProvider";
import { AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText } from "../lib/authErrors";
import { callbackUrl, onboardingUrl, registrationRole, slotParam } from "../lib/urls";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Confirm email — TrainFlow");

/**
 * Code entry for email confirmation (type=signup) or passwordless sign-in (type=email).
 * Links in the same emails are handled by /auth/callback instead.
 */
export default function Verify() {
  const m = useT();
  const t = m.auth.verify;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const navigate = useNavigate();
  const email = params.get("email") ?? "";
  const type = params.get("type") === "email" ? "email" : "signup";
  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));
  const returnTo = type === "signup" ? onboardingUrl(params.get("role")) : sanitizeReturnTo(params.get("returnTo"));
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (slot === null) return <Alert tone="warning" title={m.auth.login.full} />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = code.replace(/\s/g, "");
    if (!email || token.length < 6 || slot === null) {
      setError(m.auth.errors.invalidCode);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { data, error: verifyError } = await manager.client(slot).auth.verifyOtp({ email, token, type });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("No session");
      await manager.completeSignIn(slot, data.session);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setPending(false);
    }
  }

  async function resend() {
    if (!email || slot === null) return;
    setResending(true);
    setError(null);
    try {
      const client = manager.client(slot);
      const { error: resendError } =
        type === "signup"
          ? await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl(slot, returnTo) } })
          : await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(slot, returnTo) } });
      if (resendError) throw resendError;
      toast({ tone: "success", title: t.resent });
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <AuthHeader title={type === "email" ? m.auth.login.title : t.title} subtitle={email ? t.body(email) : t.bodyNoEmail} />
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <TextField placeholder={m.common.ph.code}
          label={t.code}
          className={form.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(value) => setCode(value.replace(/[^\d\s]/g, "").slice(0, 10))}
          isRequired
          size="lg"
        />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.submit}
        </Button>
      </form>
      <div className={form.row}>
        <Button variant="ghost" size="sm" onPress={resend} loading={resending} isDisabled={!email}>
          {t.resend}
        </Button>
        <RouterLink className={form.link} to={type === "signup" ? `/auth/register?role=${registrationRole(params.get("role"))}` : "/auth/login"}>
          {t.wrongEmail}
        </RouterLink>
      </div>
    </>
  );
}
