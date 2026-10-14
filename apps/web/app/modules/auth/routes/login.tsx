import { useState, type FormEvent } from "react";
import { Navigate, Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText, isEmailNotConfirmed } from "../lib/authErrors";
import { callbackUrl, EMAIL_PATTERN, slotParam } from "../lib/urls";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Sign in — TrainFlow");

export default function Login() {
  const m = useT();
  const t = m.auth.login;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const adding = params.get("add") === "1";
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; unconfirmed?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!supabaseConfigured()) {
    return <Alert tone="danger" title={m.shell.notConfiguredTitle}>{m.shell.notConfiguredBody}</Alert>;
  }
  // Already signed in and not adding another account: go straight in.
  if (state.phase === "ready" && state.activeSlot !== null && !adding && slotParam(params.get("slot")) === null) {
    return <Navigate to={returnTo} replace />;
  }

  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));
  if (slot === null) {
    return (
      <>
        <AuthHeader title={t.addingTitle} />
        <Alert tone="warning" title={t.full} />
      </>
    );
  }

  const emailInvalid = submitted && !EMAIL_PATTERN.test(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!EMAIL_PATTERN.test(email) || (mode === "password" && !password) || slot === null) return;
    setPending(true);
    setError(null);
    const client = manager.client(slot);
    try {
      if (mode === "code") {
        const { error: otpError } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: callbackUrl(slot, returnTo, email) },
        });
        if (otpError) throw otpError;
        navigate(`/auth/verify?type=email&slot=${slot}&email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      const { data, error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!data.session) throw new Error("No session");
      await manager.completeSignIn(slot, data.session);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      setError({ text: authErrorText(m, caught), unconfirmed: isEmailNotConfirmed(caught) });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={adding ? t.addingTitle : t.title} subtitle={adding ? t.addingSubtitle : t.subtitle} />
      {error ? (
        <Alert tone="danger" title={error.text} live="assertive">
          {error.unconfirmed ? (
            <RouterLink to={`/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(email)}`}>{m.auth.verify.title}</RouterLink>
          ) : null}
        </Alert>
      ) : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <TextField placeholder={m.common.ph.email}
          label={m.auth.email}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={setEmail}
          isRequired
          isInvalid={emailInvalid}
          errorMessage={m.auth.errors.emailInvalid}
          size="lg"
        />
        {mode === "password" ? (
          <TextField placeholder={m.common.ph.password}
            label={m.auth.password}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            isRequired
            isInvalid={submitted && !password}
            errorMessage={m.auth.errors.required}
            size="lg"
            labelAside={
              <RouterLink className={form.link} to={`/auth/forgot-password?slot=${slot}`}>
                {t.forgot}
              </RouterLink>
            }
          />
        ) : null}
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {mode === "password" ? t.submit : t.sendCode}
        </Button>
        <button type="button" className={form.textButton} onClick={() => setMode(mode === "password" ? "code" : "password")}>
          {mode === "password" ? t.useCode : t.usePassword}
        </button>
      </form>
      {adding ? null : (
        <AuthFooter>
          {t.noAccount} <RouterLink to={`/auth/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>{t.register}</RouterLink>
        </AuthFooter>
      )}
      {adding ? (
        <AuthFooter>
          <RouterLink to="/app/dashboard">{m.common.cancel}</RouterLink>
        </AuthFooter>
      ) : null}
    </>
  );
}
