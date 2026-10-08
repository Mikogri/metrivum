import { ArrowLeft } from "lucide-react";
import { Outlet, Link as RouterLink } from "react-router";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { AuthVisual } from "./components/AuthVisual";
import styles from "./auth-layout.module.css";

export default function AuthLayout() {
  const m = useT();
  const { locale, setLocale } = useAppLocale();
  return (
    <div className={styles.page}>
      <aside className={styles.visual} aria-hidden="true">
        <AuthVisual />
      </aside>
      <div className={styles.side}>
        <header className={styles.top}>
          <RouterLink to={locale === "pl" ? "/pl" : "/"} className={styles.back}>
            <ArrowLeft aria-hidden="true" />
            {m.auth.backToSite}
          </RouterLink>
          <SegmentedControl
            size="sm"
            aria-label={m.common.languageLabel}
            selectedKeys={[locale]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (typeof next === "string") setLocale(next);
            }}
          >
            <Segment id="en">EN</Segment>
            <Segment id="pl">PL</Segment>
          </SegmentedControl>
        </header>
        <main id="main" className={styles.main}>
          <img src="/brand/trainflow-logo.png" alt="TrainFlow" width={548} height={96} className={styles.logo} />
          <div className={styles.card}>
            <Outlet />
          </div>
          <p className={styles.tagline}>{m.auth.brandLine}</p>
        </main>
      </div>
    </div>
  );
}
