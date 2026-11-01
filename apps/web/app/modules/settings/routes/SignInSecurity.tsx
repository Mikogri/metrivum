import { useState, type FormEvent } from "react";
import { Alert, Button, Card, TextField, toast } from "@metrivum/ui-web";
import { authErrorText, changePassword, isValidEmail, normalizeEmail, passwordProblem, requestEmailChange, securityErrorCode, verifyPassword } from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { useActiveAccount, useSessionManager } from "~/shared/session/SessionProvider";
import { useAccountContext } from "~/shared/session/AccountScope";
import styles from "./settings.module.css";

/** Settings → Sign-in and security: the account's email (changed after confirmation by link) and its password. */
export function SignInSecurity() {
  return <div className={styles.stack}>
    <EmailChange />
    <PasswordChange />
  </div>;
}

function EmailChange() {
  const m = useT();
  const t = m.settings.security;
  const account = useActiveAccount();
  const manager = useSessionManager();
  const { lifecycle } = useAccountContext();
  const current = account?.email ?? "";
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The address waiting for confirmation: from this form, or from Supabase when the page is opened later.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const waiting = sentTo ?? account?.session.user.new_email ?? null;
  const address = normalizeEmail(email);
  const problem = !isValidEmail(email) ? m.auth.errors.emailInvalid : address === current.toLowerCase() ? t.sameEmail : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (problem || !account || !lifecycle.isCurrent()) return;
    setPending(true);
    setError(null);
    try {
      await requestEmailChange(manager.client(account.slot), account.slot, address, account.userId);
      if (!lifecycle.isCurrent()) return;
      setSentTo(address);
      setEmail("");
      setSubmitted(false);
    } catch (caught) {
      if (!lifecycle.isCurrent()) return;
      setError(securityErrorCode(caught) === "email_exists" ? m.auth.errors.userExists : authErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  return <Card as="section" padding="lg" aria-labelledby="email-title">
    <h2 id="email-title" className={styles.title}>{t.emailTitle}</h2>
    <p className={styles.hint}>{t.emailBody}</p>
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <TextField label={t.current} value={current} isReadOnly />
      {sentTo ? <Alert tone="success" title={t.emailSent(sentTo)} live="polite" /> : waiting ? <Alert tone="info" title={t.emailPending(waiting)} /> : null}
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      <TextField label={t.newEmail} placeholder={m.common.ph.email} type="email" autoComplete="email" value={email} onChange={setEmail} isRequired
        isInvalid={submitted && Boolean(problem)} errorMessage={problem ?? undefined} />
      <div><Button type="submit" variant="primary" loading={pending} isDisabled={!email.trim()}>{t.changeEmail}</Button></div>
    </form>
  </Card>;
}

function PasswordChange() {
  const m = useT();
  const t = m.settings.security;
  const account = useActiveAccount();
  const manager = useSessionManager();
  const { lifecycle } = useAccountContext();
  // Accounts made with a sign-in link or a provider have no password yet: they set one without the current one.
  const hasPassword = account?.session.user.identities?.some(identity => identity.provider === "email")
    ?? account?.session.user.app_metadata.providers?.includes("email") ?? true;
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [wrongCurrent, setWrongCurrent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = account?.email ?? "";
  const weak = passwordProblem(m, password, email);
  const problems = { current: hasPassword && !currentPassword, next: weak, repeat: repeat !== password };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setWrongCurrent(false);
    if (problems.current || problems.next || problems.repeat || !account || !lifecycle.isCurrent()) return;
    setPending(true);
    setError(null);
    try {
      // A slot can be reused while password verification is pending.
      const client = manager.client(account.slot);
      const verified = !hasPassword || await verifyPassword(email, currentPassword);
      if (!lifecycle.isCurrent()) return;
      if (!verified) { setWrongCurrent(true); return; }
      await changePassword(client, hasPassword ? currentPassword : null, password);
      if (!lifecycle.isCurrent()) return;
      toast({ tone: "success", title: t.passwordChanged });
      setCurrentPassword(""); setPassword(""); setRepeat(""); setSubmitted(false);
    } catch (caught) {
      if (!lifecycle.isCurrent()) return;
      const code = securityErrorCode(caught);
      if (code === "current_password") setWrongCurrent(true);
      else setError(code === "same_password" ? t.samePassword : authErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  return <Card as="section" padding="lg" aria-labelledby="password-title">
    <h2 id="password-title" className={styles.title}>{t.passwordTitle}</h2>
    <p className={styles.hint}>{hasPassword ? t.passwordBody : t.setPasswordBody}</p>
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
      {/* The account's email for password managers, which pair the new password with it. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {hasPassword ? <TextField label={t.currentPassword} type="password" autoComplete="current-password" value={currentPassword} onChange={value => { setCurrentPassword(value); setWrongCurrent(false); }} isRequired
        isInvalid={wrongCurrent || (submitted && problems.current)} errorMessage={wrongCurrent ? t.wrongCurrent : m.auth.errors.passwordShort} /> : null}
      <TextField label={t.newPassword} placeholder={m.common.ph.newPassword} type="password" autoComplete="new-password" value={password} onChange={setPassword} isRequired
        description={m.auth.register.passwordHint} isInvalid={submitted && Boolean(problems.next)} errorMessage={weak ?? undefined} />
      <TextField label={t.repeatPassword} placeholder={m.common.ph.confirmPassword} type="password" autoComplete="new-password" value={repeat} onChange={setRepeat} isRequired
        isInvalid={submitted && problems.repeat} errorMessage={t.mismatch} />
      <div><Button type="submit" variant="primary" loading={pending} isDisabled={!password}>{hasPassword ? t.changePassword : t.setPassword}</Button></div>
    </form>
  </Card>;
}
