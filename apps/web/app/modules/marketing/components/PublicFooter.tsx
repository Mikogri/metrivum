import { Link as RouterLink } from "react-router";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { publicPath } from "~/shared/i18n/public-routes";
import { usePublicMessages } from "../messages";
import { Logo } from "./Logo";
import styles from "./PublicFooter.module.css";

// Rendered at build time; the year updates with each deployment.
const YEAR = new Date().getFullYear();

export function PublicFooter() {
  const m = usePublicMessages();
  const locale = useLocale();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Logo size="sm" />
          <p className={styles.tagline}>{m.footer.tagline}</p>
        </div>
        <nav aria-label={m.footer.product} className={styles.column}>
          <p className={styles.heading}>{m.footer.product}</p>
          <RouterLink to={publicPath("features", locale)}>
            {m.nav.features}
          </RouterLink>
          <RouterLink to={publicPath("programBuilder", locale)}>
            {m.nav.programBuilder}
          </RouterLink>
          <RouterLink to={publicPath("videoAnalysis", locale)}>
            {m.nav.videoAnalysis}
          </RouterLink>
          <RouterLink to={`${publicPath("home", locale)}#pricing`}>
            {m.nav.pricing}
          </RouterLink>
        </nav>
        <nav aria-label={m.footer.account} className={styles.column}>
          <p className={styles.heading}>{m.footer.account}</p>
          <RouterLink to="/auth/register">{m.footer.register}</RouterLink>
          <RouterLink to="/auth/login">{m.footer.signIn}</RouterLink>
        </nav>
      </div>
      <div className={styles.bottom}>
        <p>{m.footer.copyright(YEAR)}</p>
        <p className={styles.legal}>{m.footer.legalPending}</p>
      </div>
    </footer>
  );
}
