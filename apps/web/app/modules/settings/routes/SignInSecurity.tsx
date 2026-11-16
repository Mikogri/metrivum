import { KeyRound, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, Badge, Card, LinkButton } from "@portable-ui/react";
import { useProfile } from "~/modules/accounts";
import { hasPassword, verifiedTotp } from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { useSecurityAccount } from "./security/shared";
import styles from "./settings.module.css";

/**
 * Settings → Sign-in and security: what is set up, at a glance, with the way to each change. No forms here: every
 * change runs on its own page with its own steps (settings/security/*).
 */
export function SignInSecurity() {
  const m = useT();
  const t = m.accountSecurity.hub;
  const profile = useProfile();
  const { account, user } = useSecurityAccount();
  const apps = verifiedTotp(user).length;
  const password = hasPassword(user);
  const coach = profile.roles.includes("Coach");
  return (
    <div className={styles.stack}>
      {!apps ? (
        <Alert
          tone="warning"
          title={t.recommendTitle}
          actions={
            <LinkButton
              size="sm"
              variant="primary"
              href="/app/settings/security/two-factor"
            >
              {t.recommendAction}
            </LinkButton>
          }
        >
          {coach ? t.recommendCoach : t.recommendClient}
        </Alert>
      ) : null}
      <Card as="section" padding="lg" aria-labelledby="security-title">
        <h2 id="security-title" className={styles.title}>
          {t.title}
        </h2>
        <p className={styles.hint}>{t.body}</p>
        <ul className={styles.securityRows} role="list">
          <SecurityRow
            icon={<Mail />}
            title={t.email}
            value={account.email ?? "—"}
            body={user.new_email ? t.emailPending(user.new_email) : t.emailBody}
            status={
              user.new_email ? (
                <Badge tone="warning" dot>
                  {m.accountSecurity.email.pendingTitle}
                </Badge>
              ) : null
            }
            action={
              <LinkButton size="sm" href="/app/settings/security/change-email">
                {t.changeEmail}
              </LinkButton>
            }
          />
          <SecurityRow
            icon={<KeyRound />}
            title={t.password}
            body={password ? t.passwordBody : t.noPasswordBody}
            action={
              <LinkButton
                size="sm"
                href="/app/settings/security/change-password"
              >
                {password ? t.changePassword : t.setPassword}
              </LinkButton>
            }
          />
          <SecurityRow
            icon={<ShieldCheck />}
            title={t.twoFactor}
            body={apps ? t.twoFactorOn(apps) : t.twoFactorOff}
            status={
              <Badge tone={apps ? "success" : "neutral"} dot>
                {apps ? m.accountSecurity.enabled : m.accountSecurity.disabled}
              </Badge>
            }
            action={
              <LinkButton
                size="sm"
                variant={apps ? "secondary" : "primary"}
                href="/app/settings/security/two-factor"
              >
                {t.manage}
              </LinkButton>
            }
          />
          <SecurityRow
            icon={<LifeBuoy />}
            title={t.recovery}
            body={t.recoveryBody(1 + apps)}
            action={
              <LinkButton size="sm" href="/app/settings/security/recovery">
                {t.view}
              </LinkButton>
            }
          />
        </ul>
      </Card>
    </div>
  );
}

function SecurityRow({
  icon,
  title,
  value,
  body,
  status,
  action,
}: {
  icon: ReactNode;
  title: string;
  value?: string;
  body: string;
  status?: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className={styles.securityRow}>
      <span className={styles.securityIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.securityText}>
        <div className={styles.securityHead}>
          <h3>{title}</h3>
          {status}
        </div>
        {value ? <p className={styles.securityValue}>{value}</p> : null}
        <p className={styles.hint}>{body}</p>
      </div>
      <div className={styles.securityAction}>{action}</div>
    </li>
  );
}
