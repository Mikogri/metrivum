import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Option, Select, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useSessionManager } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AuthFooter, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorText } from "../lib/authErrors";
import { callbackUrl, EMAIL_PATTERN, onboardingUrl, registrationRole, slotParam, type RegistrationRole } from "../lib/urls";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Create account — TrainFlow");

export default function Register() {
  const m = useT();
  const t = m.auth.register;
  const [params] = useSearchParams();
  const manager = useSessionManager();
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
  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));
  if (slot === null) return <Alert tone="warning" title={m.auth.login.full} />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!EMAIL_PATTERN.test(email) || password.length < 8 || slot === null) return;
    setPending(true);
    setError(null);
    try {
      const { data, error: signUpError } = await manager.client(slot).auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl(slot, onboardingUrl(role), email) },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        // Email confirmation disabled in this environment: continue straight to onboarding.
        await manager.completeSignIn(slot, data.session);
        navigate(onboardingUrl(role), { replace: true });
        return;
      }
      navigate(`/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(email)}&role=${role}`);
    } catch (caught) {
      setError(authErrorText(m, caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={t.title} subtitle={t.subtitle} />
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
          isInvalid={submitted && !EMAIL_PATTERN.test(email)}
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
          isInvalid={submitted && password.length < 8}
          errorMessage={m.auth.errors.passwordShort}
          size="lg"
        />
        <Button type="submit" variant="primary" size="lg" block loading={pending}>
          {t.submit}
        </Button>
      </form>
      <Alert tone="info" title={t.termsPending} />
      <AuthFooter>
        {t.haveAccount} <RouterLink to="/auth/login">{t.signIn}</RouterLink>
      </AuthFooter>
    </>
  );
}
