import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Option, Select, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AddAccountSwitch } from "../components/AddAccountSwitch";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText, isExistingAccount, passwordProblem } from "../lib/authErrors";
import { callbackUrl, onboardingUrl, registrationRole, slotParam, type RegistrationRole } from "../lib/urls";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Create account — Metrivum");

export default function Register() {
  const m = useT();
  const t = m.auth.register;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const adding = params.get("add") === "1" || state.accounts.length > 0;
  const navigate = useNavigate();
  const [role, setRole] = useState<RegistrationRole>(() => registrationRole(params.get("role")));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!supabaseConfigured()) {
    return <Alert tone="danger" title={m.shell.notConfiguredTitle}>{m.shell.notConfiguredBody}</Alert>;
  }
  // A new account never takes a slot that already holds someone: a requested slot is used only when free.
  const requested = slotParam(params.get("slot"));
  const slot = manager.slotForNewSignIn(requested !== null && !state.accounts.some((a) => a.slot === requested) ? requested : undefined);
  if (slot === null) return <Alert tone="warning" title={m.auth.login.full} />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!isValidEmail(email) || passwordProblem(m, password, email) || slot === null) return;
    const address = normalizeEmail(email);
    setPending(true);
    setError(null);
    try {
      const { data, error: signUpError } = await manager.client(slot).auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: callbackUrl(slot, onboardingUrl(role), address) },
      });
      // An address that already has an account continues like a new one, so this form cannot be used to
      // find out who is registered. The owner gets no code and can sign in or reset the password instead.
      if (signUpError && !isExistingAccount(signUpError)) throw signUpError;
      if (data?.session) {
        // Email confirmation disabled in this environment: continue straight to onboarding.
        await manager.completeSignIn(slot, data.session);
        navigate(onboardingUrl(role), { replace: true });
        return;
      }
      navigate(`/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(address)}&role=${role}`);
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={adding ? t.addingTitle : t.title} subtitle={adding ? t.addingSubtitle : t.subtitle} />
      {adding ? <AddAccountSwitch current="register" slot={slot} /> : null}
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <Select label={t.accountType} selectedKey={role} onSelectionChange={(key) => setRole(registrationRole(String(key)))} isDisabled={pending}>
          <Option id="Client">{t.client}</Option>
          <Option id="Coach">{t.coach}</Option>
        </Select>
        <TextField placeholder={m.common.ph.email}
          label={m.auth.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          isRequired
          isInvalid={submitted && !isValidEmail(email)}
          errorMessage={m.auth.errors.emailInvalid}
          size="lg"
        />
        <TextField placeholder={m.common.ph.newPassword}
          label={m.auth.password}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          isRequired
          description={t.passwordHint}
          isInvalid={submitted && Boolean(passwordProblem(m, password, email))}
          errorMessage={passwordProblem(m, password, email) ?? undefined}
          size="lg"
        />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.submit}
        </Button>
      </form>
      <Alert tone="info" title={t.termsPending} />
      {adding ? (
        <AuthFooter>
          <RouterLink to="/app">{m.common.cancel}</RouterLink>
        </AuthFooter>
      ) : (
        <AuthFooter>
          {t.haveAccount} <RouterLink to="/auth/login">{t.signIn}</RouterLink>
        </AuthFooter>
      )}
    </>
  );
}
