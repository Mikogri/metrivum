import { useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router";
import { Alert, Button, Card, TextField, toast } from "@metrivum/ui-web";
import {
  EMAIL_RESEND_SECONDS, SecondFactorForm, authErrorText, emailChangeUrl, hasPassword, isValidEmail, normalizeEmail, requestEmailChange,
  securityErrorCode, useCooldown, useTurnstile, verifiedTotp, verifyPassword,
} from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { SecurityPage, Steps, useSecurityAccount } from "./shared";
import styles from "./security.module.css";

export const meta = () => privateMeta("Change email — Metrivum");

/**
 * Supabase secure email change: the new address is only requested here; Auth sends a link to the current and the
 * new address and switches the email after both are opened (handled on /auth/callback). The account id never
 * changes and nothing in Metrivum uses the new address before Auth confirms it.
 */
export default function ChangeEmail() {
  const m = useT();
  const t = m.accountSecurity.email;
  const { account, slot, client, user, lifecycle, sync } = useSecurityAccount();
  const current = account.email ?? "";
  const [requested, setRequested] = useState<string | null>(null);
  // Auth keeps the unconfirmed address apart from the account's email until both links are opened.
  const pendingAddress = user.new_email ?? requested;
  const [step, setStep] = useState<"address" | "verify" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, startWait] = useCooldown();
  const passwordAccount = hasPassword(user);
  const factors = verifiedTotp(user);
  const address = normalizeEmail(email);
  const problem = !isValidEmail(email) ? m.auth.errors.emailInvalid : address === current.toLowerCase() ? t.sameEmail : null;
  // Without an explicit restart, an open change shows its status first.
  const view = step ?? (pendingAddress ? "pending" : "address");

  const captcha = useTurnstile(`email:${slot}:${account.userId}:${view}:${pendingAddress ?? ""}`);

  async function checkPassword(): Promise<string | null> {
    if (!passwordAccount) return null;
    if (!password) return t.wrongPassword;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return captcha.unavailable;
    return await verifyPassword(current, password, captchaOptions) ? null : t.wrongPassword;
  }

  /** Runs once the person is confirmed; Supabase sends both links. */
  async function request(): Promise<string | void> {
    if (!lifecycle.isCurrent()) return captcha.unavailable;
    try {
      await requestEmailChange(client, slot, address, account.userId);
      if (!lifecycle.isCurrent()) return;
      setRequested(address);
      await sync();
      setStep(null);
      setPassword("");
      startWait(EMAIL_RESEND_SECONDS);
    } catch (caught) {
      return securityErrorCode(caught) === "email_exists" ? m.auth.errors.userExists : authErrorText(m, caught);
    }
  }

  async function onVerifyWithoutCode(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const refused = await checkPassword();
      if (!lifecycle.isCurrent()) return;
      if (refused) { setError(refused); return; }
      const failed = await request();
      if (failed) setError(failed);
    } catch (caught) {
      if (lifecycle.isCurrent()) setError(authErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  async function resend() {
    if (!pendingAddress || wait > 0 || pending) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    setPending(true);
    setError(null);
    try {
      const { error: resendError } = await client.auth.resend({ type: "email_change", email: pendingAddress, options: { ...captchaOptions, emailRedirectTo: emailChangeUrl(slot, pendingAddress, account.userId) } });
      if (!lifecycle.isCurrent()) return;
      if (resendError) throw resendError;
      toast({ tone: "success", title: t.resent });
      startWait(EMAIL_RESEND_SECONDS);
    } catch (caught) {
      if (lifecycle.isCurrent()) setError(authErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  const passwordField = passwordAccount ? (
    <>
      <input type="email" name="username" autoComplete="username" value={current} readOnly hidden />
      <TextField label={t.password} type="password" autoComplete="current-password" value={password} onChange={setPassword} isRequired autoFocus />
    </>
  ) : <p className={styles.hint}>{t.noPasswordNote}</p>;

  return (
    <SecurityPage title={t.title} description={t.description}>
      <Card as="section" padding="lg" className={styles.section} aria-label={t.title}>
        <Steps steps={t.steps} current={view === "address" ? 0 : view === "verify" ? 1 : 2} label={t.title} />
        {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
        {captcha.widget}
        {view === "pending" && pendingAddress ? (
          <>
            <Alert tone="info" title={t.pendingTitle} live="polite">{t.pendingBody(current, pendingAddress)}</Alert>
            <div className={styles.actions}>
              <Button loading={pending} isDisabled={wait > 0 || !captcha.ready} onPress={() => void resend()}>{wait > 0 ? m.accountSecurity.password.resendIn(wait) : t.resend}</Button>
              <Button variant="ghost" onPress={() => { setStep("address"); setError(null); }}>{t.startOver}</Button>
            </div>
            <p className={styles.quiet}>{t.expiredHint}</p>
          </>
        ) : view === "address" ? (
          <form className={styles.section} noValidate onSubmit={(event) => { event.preventDefault(); setSubmitted(true); if (!problem) { setError(null); setStep("verify"); } }}>
            <TextField label={t.current} value={current} isReadOnly />
            <TextField label={t.newEmail} placeholder={m.common.ph.email} type="email" autoComplete="email" value={email} onChange={setEmail} isRequired autoFocus
              isInvalid={submitted && Boolean(problem)} errorMessage={problem ?? undefined} />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" isDisabled={!email.trim()}>{t.next}</Button>
              {pendingAddress ? <Button variant="ghost" onPress={() => setStep(null)}>{m.common.cancel}</Button> : null}
            </div>
          </form>
        ) : (
          <div className={styles.section}>
            <div>
              <h2 className={styles.title}>{t.verifyTitle}</h2>
              <p className={styles.hint}>{t.verifyBody(address)}</p>
            </div>
            {factors.length ? (
              <SecondFactorForm slot={slot} factors={factors} check={checkPassword} onVerified={request} submitLabel={t.submit} block={false}>
                {passwordField}
              </SecondFactorForm>
            ) : (
              <form className={styles.section} onSubmit={onVerifyWithoutCode} noValidate>
                {passwordField}
                <div><Button type="submit" variant="primary" loading={pending}>{t.submit}</Button></div>
              </form>
            )}
            <div><Button variant="ghost" size="sm" onPress={() => setStep("address")}>{t.change}</Button></div>
          </div>
        )}
      </Card>
      <p className={styles.hint}>{t.lostAccess} <RouterLink to="/app/settings/security/recovery">{t.lostAccessLink}</RouterLink></p>
    </SecurityPage>
  );
}
