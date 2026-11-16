import { KeyRound, LifeBuoy, Mail, Phone, Smartphone } from "lucide-react";
import { Badge, Card, LinkButton, List, ListRow } from "@portable-ui/react";
import { verifiedTotp } from "~/modules/auth";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { SecurityPage, useSecurityAccount } from "./shared";
import styles from "./security.module.css";

export const meta = () => privateMeta("Recovery methods — Metrivum");

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL?.trim() || null;

/**
 * What exists to get back into the account, and what to do in each case. Losing the old inbox is never solved
 * automatically: support handles it after a manual identity check (see docs/security/account-recovery.md).
 */
export default function Recovery() {
  const m = useT();
  const t = m.accountSecurity.recovery;
  const { account, user } = useSecurityAccount();
  const apps = verifiedTotp(user).length;
  const icon = (Icon: typeof Mail) => (
    <span className={styles.rowIcon}>
      <Icon aria-hidden="true" />
    </span>
  );
  return (
    <SecurityPage title={t.title} description={t.description}>
      <Card
        as="section"
        padding="lg"
        className={styles.section}
        aria-labelledby="recovery-methods"
      >
        <h2 id="recovery-methods" className={styles.title}>
          {t.methods}
        </h2>
        <List>
          <ListRow
            leading={icon(Mail)}
            title={t.emailMethod}
            subtitle={t.emailMethodBody(account.email ?? "")}
            trailing={
              <Badge tone="success" dot>
                {m.accountSecurity.enabled}
              </Badge>
            }
          />
          <ListRow
            leading={icon(Smartphone)}
            title={t.authenticators}
            subtitle={t.authenticatorsBody(apps)}
            trailing={
              apps ? (
                <Badge tone="success" dot>
                  {m.accountSecurity.enabled}
                </Badge>
              ) : (
                <LinkButton size="sm" href="/app/settings/security/two-factor">
                  {t.setUp}
                </LinkButton>
              )
            }
          />
          <ListRow
            leading={icon(KeyRound)}
            title={t.backupCodes}
            subtitle={t.backupCodesBody}
            trailing={
              <Badge tone="neutral">{m.accountSecurity.notAvailable}</Badge>
            }
          />
          <ListRow
            leading={icon(Phone)}
            title={t.phone}
            subtitle={t.phoneBody}
            trailing={
              <Badge tone="neutral">{m.accountSecurity.notAvailable}</Badge>
            }
          />
        </List>
      </Card>
      <Card
        as="section"
        padding="lg"
        className={styles.section}
        aria-labelledby="recovery-scenarios"
      >
        <h2 id="recovery-scenarios" className={styles.title}>
          {t.scenarios}
        </h2>
        <dl className={styles.scenarios}>
          <div>
            <dt>{t.forgotTitle}</dt>
            <dd>{t.forgotBody}</dd>
          </div>
          <div>
            <dt>{t.phoneTitle}</dt>
            <dd>{t.phoneBody2}</dd>
          </div>
          <div>
            <dt>{t.emailTitle}</dt>
            <dd>{t.emailBody}</dd>
          </div>
          <div>
            <dt>{t.bothTitle}</dt>
            <dd>{t.bothBody}</dd>
          </div>
        </dl>
      </Card>
      <Card
        as="section"
        padding="lg"
        className={styles.section}
        aria-labelledby="recovery-support"
      >
        <div className={styles.actions}>
          {icon(LifeBuoy)}
          <h2 id="recovery-support" className={styles.title}>
            {t.support}
          </h2>
        </div>
        <p className={styles.hint}>{t.supportBody}</p>
        {SUPPORT_EMAIL ? (
          <div>
            <LinkButton href={`mailto:${SUPPORT_EMAIL}`} variant="secondary">
              {SUPPORT_EMAIL}
            </LinkButton>
          </div>
        ) : null}
      </Card>
    </SecurityPage>
  );
}
