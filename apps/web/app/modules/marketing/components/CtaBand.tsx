import { LinkButton } from "@metrivum/ui-web";
import { usePublicMessages } from "../messages";
import { usePublicSession } from "../usePublicSession";
import { RevealHeading } from "./RevealHeading";
import styles from "./CtaBand.module.css";

export function CtaBand() {
  const m = usePublicMessages();
  const hasSession = usePublicSession();
  return (
    <section aria-labelledby="cta-title" className={styles.wrap}>
      <div className={styles.band}>
        <div className={styles.copy}>
          <RevealHeading
            id="cta-title"
            title={m.home.finalCta.title}
            className={styles.title}
          />
          <p className={styles.body}>{m.home.finalCta.body}</p>
        </div>
        <div className={styles.actions}>
          {hasSession ? (
            <LinkButton href="/app/dashboard" variant="primary" size="lg">
              {m.home.hero.openApp}
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/auth/register" variant="primary" size="lg">
                {m.home.hero.primary}
              </LinkButton>
              <LinkButton href="/auth/login" variant="secondary" size="lg">
                {m.home.hero.secondary}
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
