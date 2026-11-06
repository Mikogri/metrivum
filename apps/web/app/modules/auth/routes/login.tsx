import { useState, type FormEvent } from "react";
import { Navigate, Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, TextField } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AddAccountSwitch } from "../components/AddAccountSwitch";
import { useTurnstile } from "../components/Turnstile";
import { AuthFooter, AuthFormError, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorField, authErrorText, isEmailNotConfirmed, isUnknownAccount } from "../lib/authErrors";
import { callbackUrl, slotParam } from "../lib/urls";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Sign in — Metrivum");

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
  const [error, setError] = useState<{ text: string; field: "email" | "password" | null; unconfirmed?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const captcha = useTurnstile(`login:${params.toString()}:${state.generation}:${mode}:${normalizeEmail(email)}`);

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

  const emailInvalid = submitted && !isValidEmail(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (pending || !isValidEmail(email) || (mode === "password" && !password) || slot === null) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    const address = normalizeEmail(email);
    setPending(true);
    setError(null);
    const client = manager.client(slot, captcha.isCurrent, { email: address });
    try {
      if (mode === "code") {
        const { error: otpError } = await client.auth.signInWithOtp({
          email: address,
          options: { ...captchaOptions, shouldCreateUser: false, emailRedirectTo: callbackUrl(slot, returnTo, address) },
        });
        if (!captcha.isCurrent()) return;
        // "No such account" looks exactly like "code sent": the form must not reveal who is registered.
        if (otpError && !isUnknownAccount(otpError)) throw otpError;
        navigate(`/auth/verify?type=email&slot=${slot}&email=${encodeURIComponent(address)}&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      const { data, error: signInError } = await client.auth.signInWithPassword({ email: address, password, options: captchaOptions });
      if (!captcha.isCurrent()) return;
      if (signInError) throw signInError;
      if (!data.session) throw new Error("No session");
      await manager.completeSignIn(slot, data.session, captcha.isCurrent);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      const field = authErrorField(caught);
      setError({ text: authErrorText(m, caught), field: field === "password" && mode !== "password" ? "email" : field, unconfirmed: isEmailNotConfirmed(caught) });
    } finally {
      await client.auth.dispose?.();
      if (captcha.isCurrent()) setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={adding ? t.addingTitle : t.title} subtitle={adding ? t.addingSubtitle : t.subtitle} back={adding ? { to: "/app", label: m.common.back } : undefined} />
      {adding ? <AddAccountSwitch current="login" slot={slot} /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <TextField placeholder={m.common.ph.email}
          label={m.auth.email}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(value) => { setEmail(value); if (error?.field) setError(null); }}
          isDisabled={pending}
          isRequired
          isInvalid={emailInvalid || error?.field === "email"}
          errorMessage={emailInvalid ? m.auth.errors.emailInvalid : error?.text}
        />
        {mode === "password" ? (
          <TextField placeholder={m.common.ph.password}
            label={m.auth.password}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(value) => { setPassword(value); if (error?.field) setError(null); }}
            isDisabled={pending}
            isRequired
            isInvalid={(submitted && !password) || error?.field === "password"}
            errorMessage={submitted && !password ? m.auth.errors.required : error?.text}
            labelAside={
              <RouterLink className={form.link} to={`/auth/forgot-password?slot=${slot}`}>
                {t.forgot}
              </RouterLink>
            }
          />
        ) : null}
        {captcha.widget}
        <Button type="submit" variant="primary" block loading={pending} isDisabled={!captcha.ready}>
          {mode === "password" ? t.submit : t.sendCode}
        </Button>
        {error && (!error.field || error.unconfirmed) ? (
          <AuthFormError>
            {error.field ? null : error.text}
            {error.unconfirmed ? <RouterLink to={`/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(email)}`}>{m.auth.verify.title}</RouterLink> : null}
          </AuthFormError>
        ) : null}
        <button type="button" className={form.textButton} disabled={pending} onClick={() => setMode(mode === "password" ? "code" : "password")}>
          {mode === "password" ? t.useCode : t.usePassword}
        </button>
      </form>
      {adding ? null : (
        <AuthFooter>
          {t.noAccount} <RouterLink to={`/auth/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>{t.register}</RouterLink>
        </AuthFooter>
      )}
    </>
  );
}
