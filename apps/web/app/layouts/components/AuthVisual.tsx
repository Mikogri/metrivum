import { usePublicMessages } from "~/modules/marketing/messages";
import styles from "./AuthVisual.module.css";

/**
 * The left panel of the sign-in pages: calm and static. The logo, the site's headline with its
 * status line, and the product in four facts along the bottom, over a faint grid of cycle days.
 */
export function AuthVisual() {
  const h = usePublicMessages().home;
  return (
    <div className={styles.wrap}>
      <div className={styles.days} />
      <img src="/brand/trainflow-logo.png" alt="" width={548} height={96} className={styles.logo} />
      <div className={styles.copy}>
        <p className={styles.badge}>
          <span />
          {h.hero.badge}
        </p>
        <p className={styles.title}>{h.hero.title}</p>
        <p className={styles.lead}>{h.hero.lead}</p>
      </div>
      <dl className={styles.facts}>
        {h.facts.map((fact) => (
          <div key={fact.value}>
            <dt>{fact.value}</dt>
            <dd>{fact.label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
