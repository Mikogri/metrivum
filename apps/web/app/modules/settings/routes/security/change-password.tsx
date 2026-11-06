import { useState } from "react";
import { Alert, Button, Card } from "@metrivum/ui-web";
import { EMAIL_RESEND_SECONDS, authErrorText, callbackUrl, hasPassword, useCooldown, useTurnstile } from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { SecurityPage, Steps, useSecurityAccount } from "./shared";
import styles from "./security.module.css";

export const meta = () => privateMeta("Change password — Metrivum");

/**
 * Changing a password works exactly like a forgotten one: a link to the account's verified address, then the shared
 * /auth/reset-password form. There is no current/new password form in the app.
 */
export default function ChangePassword() {
  const m = useT();
  const t = m.accountSecurity.password;
  const { account, slot, client, user, lifecycle } = useSecurityAccount();
  const email = account.email ?? "";
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, startWait] = useCooldown();
  const set = !hasPassword(user);
  const captcha = useTurnstile(`password:${slot}:${account.userId}`);

  async function send() {
    if (!email || pending || wait > 0) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    setPending(true);
    setError(null);
    try {
      const { error: sendError } = await client.auth.resetPasswordForEmail(email, { ...captchaOptions, redirectTo: callbackUrl(slot, "/auth/reset-password", email) });
      if (sendError) throw sendError;
      if (!lifecycle.isCurrent()) return;
      setSent(true);
      startWait(EMAIL_RESEND_SECONDS);
    } catch (caught) {
      if (lifecycle.isCurrent()) setError(authErrorText(m, caught));
    } finally {
      if (lifecycle.isCurrent()) setPending(false);
    }
  }

  return (
    <SecurityPage title={set ? t.setTitle : t.title} description={t.description}>
      <Card as="section" padding="lg" className={styles.section} aria-label={set ? t.setTitle : t.title}>
        <Steps steps={t.steps} current={sent ? 1 : 0} label={t.title} />
        <div className={styles.target}>
          <small>{t.sendTo}</small>
          <strong>{email}</strong>
        </div>
        {set ? <Alert tone="info" title={t.noPassword} /> : null}
        {error ? <Alert tone="danger" title={error} live="assertive" /> : null}
        {sent ? (
          <Alert tone="success" title={t.sentTitle} live="polite">
            {t.sent(email)} {t.sameBrowser}
          </Alert>
        ) : null}
        {captcha.widget}
        <div className={styles.actions}>
          <Button variant={sent ? "secondary" : "primary"} loading={pending} isDisabled={!email || wait > 0 || !captcha.ready} onPress={() => void send()}>
            {wait > 0 ? t.resendIn(wait) : sent ? t.resend : t.send}
          </Button>
        </div>
        <p className={styles.quiet}>{sent ? t.spam : t.signedOutNote}</p>
      </Card>
    </SecurityPage>
  );
}
