import { MailCheck } from "lucide-react";
import { CodeInput } from "../components/CodeInput";
import { useEffect, useState, type FormEvent } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Spinner, toast } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import {
  useSessionManager,
  useSessionState,
} from "~/shared/session/SessionProvider";
import { useTurnstile } from "../components/Turnstile";
import { AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import styles from "./verify.module.css";
import { authErrorText } from "../lib/authErrors";
import {
  callbackUrl,
  onboardingUrl,
  registrationRole,
  slotParam,
} from "../lib/urls";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Confirm email — Metrivum");

/** Seconds before another email may be requested (Supabase also rate-limits emails). */
const RESEND_WAIT = 60;

/**
 * After sign-up (type=signup) or a passwordless sign-in request (type=email): the person opens the link from the
 * email, which /auth/callback completes. Opened in another tab of this browser, this page notices the new session
 * and continues by itself. Entering the code from the email stays available as a fallback.
 */
export default function Verify() {
  const m = useT();
  const t = m.auth.verify;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const email = params.get("email") ?? "";
  const type = params.get("type") === "email" ? "email" : "signup";
  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));
  const returnTo =
    type === "signup"
      ? onboardingUrl(params.get("role"))
      : sanitizeReturnTo(params.get("returnTo"));
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendAt, setResendAt] = useState(
    () => Date.now() + RESEND_WAIT * 1000,
  );
  const [now, setNow] = useState(() => Date.now());
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const [error, setError] = useState<string | null>(null);

  const captcha = useTurnstile(
    `resend:${params.toString()}:${state.generation}`,
  );

  // The link was opened in another tab: that tab signed this slot in, so continue here too.
  const confirmed =
    slot !== null &&
    state.accounts.some(
      (account) =>
        account.slot === slot &&
        (!email || account.email?.toLowerCase() === email.toLowerCase()),
    );
  useEffect(() => {
    if (!confirmed || slot === null) return;
    manager.activate(slot);
    navigate(returnTo, { replace: true });
  }, [confirmed, slot, manager, navigate, returnTo]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- restart only when the countdown starts or ends

  if (slot === null) return <Alert tone="warning" title={m.auth.login.full} />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = code.replace(/\s/g, "");
    if (pending) return;
    if (!email || token.length < 6 || slot === null) {
      setError(m.auth.errors.invalidCode);
      return;
    }
    setPending(true);
    setError(null);
    const client = manager.client(slot, captcha.isCurrent, { email });
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({
        email,
        token,
        type,
      });
      if (!captcha.isCurrent()) return;
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("No session");
      await manager.completeSignIn(slot, data.session, captcha.isCurrent);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      setError(authErrorText(m, caught));
    } finally {
      await client.auth.dispose?.();
      if (captcha.isCurrent()) setPending(false);
    }
  }

  async function resend() {
    if (!email || slot === null || resending || wait > 0) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    setResending(true);
    setError(null);
    try {
      const client = manager.client(slot);
      const { error: resendError } =
        type === "signup"
          ? await client.auth.resend({
              type: "signup",
              email,
              options: {
                ...captchaOptions,
                emailRedirectTo: callbackUrl(slot, returnTo, email),
              },
            })
          : await client.auth.signInWithOtp({
              email,
              options: {
                ...captchaOptions,
                shouldCreateUser: false,
                emailRedirectTo: callbackUrl(slot, returnTo, email),
              },
            });
      if (!captcha.isCurrent()) return;
      if (resendError) throw resendError;
      toast({ tone: "success", title: t.resent });
      setResendAt(Date.now() + RESEND_WAIT * 1000);
      setNow(Date.now());
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      setError(authErrorText(m, caught));
    } finally {
      if (captcha.isCurrent()) setResending(false);
    }
  }

  return (
    <>
      <span className={styles.icon} aria-hidden="true">
        <MailCheck />
      </span>
      <AuthHeader
        title={t.title}
        subtitle={
          email
            ? type === "email"
              ? t.loginBody(email)
              : t.body(email)
            : t.bodyNoEmail
        }
      />
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <p className={styles.waiting} role="status">
        <Spinner size="sm" />
        {t.waiting}
      </p>
      <p className={styles.hint}>{t.spamHint}</p>
      {captcha.widget}
      <div className={form.row}>
        <Button
          variant="ghost"
          size="sm"
          onPress={resend}
          loading={resending}
          isDisabled={!email || wait > 0 || !captcha.ready}
        >
          {wait > 0 ? t.resendIn(wait) : t.resend}
        </Button>
        <RouterLink
          className={form.link}
          to={
            type === "signup"
              ? `/auth/register?role=${registrationRole(params.get("role"))}`
              : "/auth/login"
          }
        >
          {t.wrongEmail}
        </RouterLink>
      </div>
      {showCode ? (
        <form
          className={`${form.form} ${styles.codeForm}`}
          onSubmit={onSubmit}
          noValidate
        >
          <CodeInput label={t.code} autoFocus value={code} onChange={setCode} />
          <Button type="submit" variant="primary" block loading={pending}>
            {t.submit}
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className={form.textButton}
          onClick={() => setShowCode(true)}
        >
          {t.haveCode}
        </button>
      )}
    </>
  );
}
