import { useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import {
  Alert,
  Button,
  Checkbox,
  Option,
  Select,
  TextField,
} from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import {
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AddAccountSwitch } from "../components/AddAccountSwitch";
import { useTurnstile } from "../components/Turnstile";
import {
  AuthFooter,
  AuthFormError,
  AuthHeader,
} from "../components/AuthHeader";
import form from "../components/form.module.css";
import {
  authErrorField,
  authErrorText,
  isExistingAccount,
  passwordProblem,
} from "../lib/authErrors";
import {
  callbackUrl,
  onboardingUrl,
  registrationRole,
  slotParam,
  type RegistrationRole,
} from "../lib/urls";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Create account — Metrivum");

/** The version of the terms a new account accepts; onboarding records the same version. */
const TERMS_VERSION = "v1";

export default function Register() {
  const m = useT();
  const t = m.auth.register;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const adding = params.get("add") === "1" || state.accounts.length > 0;
  const navigate = useNavigate();
  const [role, setRole] = useState<RegistrationRole>(() =>
    registrationRole(params.get("role")),
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<{
    text: string;
    field: "email" | "password" | null;
  } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const captcha = useTurnstile(
    `register:${params.toString()}:${state.generation}:${normalizeEmail(email)}`,
  );

  if (!supabaseConfigured()) {
    return (
      <Alert tone="danger" title={m.shell.notConfiguredTitle}>
        {m.shell.notConfiguredBody}
      </Alert>
    );
  }
  // A new account never takes a slot that already holds someone: a requested slot is used only when free.
  const requested = slotParam(params.get("slot"));
  const slot = manager.slotForNewSignIn(
    requested !== null && !state.accounts.some((a) => a.slot === requested)
      ? requested
      : undefined,
  );
  if (slot === null) return <Alert tone="warning" title={m.auth.login.full} />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (
      pending ||
      !isValidEmail(email) ||
      passwordProblem(m, password, email) ||
      !accepted ||
      slot === null
    )
      return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    const address = normalizeEmail(email);
    setPending(true);
    setError(null);
    const client = manager.client(slot, captcha.isCurrent, { email: address });
    try {
      const { data, error: signUpError } = await client.auth.signUp({
        email: address,
        password,
        options: {
          ...captchaOptions,
          emailRedirectTo: callbackUrl(slot, onboardingUrl(role), address),
          data: {
            terms_version: TERMS_VERSION,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });
      if (!captcha.isCurrent()) return;
      // Existing and fresh addresses share the same outward flow; Auth alone decides whether to send email.
      if (signUpError && !isExistingAccount(signUpError)) throw signUpError;
      if (data?.session) {
        // Email confirmation disabled in this environment: continue straight to onboarding.
        await manager.completeSignIn(slot, data.session, captcha.isCurrent);
        navigate(onboardingUrl(role), { replace: true });
        return;
      }
      navigate(
        `/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(address)}&role=${role}`,
      );
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      setError({
        text: authErrorText(m, caught),
        field: authErrorField(caught),
      });
    } finally {
      await client.auth.dispose?.();
      if (captcha.isCurrent()) setPending(false);
    }
  }

  return (
    <>
      <AuthHeader
        title={adding ? t.addingTitle : t.title}
        subtitle={adding ? t.addingSubtitle : t.subtitle}
        back={adding ? { to: "/app", label: m.common.back } : undefined}
      />
      {adding ? <AddAccountSwitch current="register" slot={slot} /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <Select
          label={t.accountType}
          selectedKey={role}
          onSelectionChange={(key) => setRole(registrationRole(String(key)))}
          isDisabled={pending}
        >
          <Option id="Client">{t.client}</Option>
          <Option id="Coach">{t.coach}</Option>
        </Select>
        <TextField
          placeholder={m.common.ph.email}
          label={m.auth.email}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (error?.field) setError(null);
          }}
          isDisabled={pending}
          isRequired
          isInvalid={
            (submitted && !isValidEmail(email)) || error?.field === "email"
          }
          errorMessage={
            submitted && !isValidEmail(email)
              ? m.auth.errors.emailInvalid
              : error?.text
          }
        />
        <TextField
          placeholder={m.common.ph.newPassword}
          label={m.auth.password}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (error?.field) setError(null);
          }}
          isDisabled={pending}
          isRequired
          description={t.passwordHint}
          isInvalid={
            (submitted && Boolean(passwordProblem(m, password, email))) ||
            error?.field === "password"
          }
          errorMessage={
            (submitted ? passwordProblem(m, password, email) : null) ??
            error?.text
          }
        />
        <div className={form.terms}>
          <Checkbox
            isSelected={accepted}
            onChange={setAccepted}
            isInvalid={submitted && !accepted}
            isDisabled={pending}
          >
            {t.acceptPrefix}{" "}
            <a href="/terms" target="_blank" rel="noreferrer">
              {t.termsLink}
            </a>{" "}
            {t.acceptAnd}{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              {t.privacyLink}
            </a>
          </Checkbox>
          {submitted && !accepted ? (
            <p className={form.fieldError}>{t.termsRequired}</p>
          ) : null}
        </div>
        {captcha.widget}
        <Button
          type="submit"
          variant="primary"
          block
          loading={pending}
          isDisabled={!captcha.ready}
        >
          {t.submit}
        </Button>
        {error && !error.field ? (
          <AuthFormError>{error.text}</AuthFormError>
        ) : null}
      </form>
      {adding ? null : (
        <AuthFooter>
          {t.haveAccount} <RouterLink to="/auth/login">{t.signIn}</RouterLink>
        </AuthFooter>
      )}
    </>
  );
}
