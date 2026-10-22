import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Outlet, Link as RouterLink } from "react-router";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { PublicMessagesProvider } from "~/modules/marketing/messages";
import { AuthVisual } from "./components/AuthVisual";
import "./night-theme.module.css";
import styles from "./auth-layout.module.css";

export default function AuthLayout() {
  const m = useT();
  const { locale, setLocale } = useAppLocale();
  // The sign-in pages continue the public site: same night palette, also for menus rendered in portals.
  useEffect(() => {
    document.documentElement.setAttribute("data-public-theme", "night");
    return () => document.documentElement.removeAttribute("data-public-theme");
  }, []);
  return (
    <div className={styles.page} data-public-theme="night">
      {/* A drawn product preview with the site's headline: decorative here, the form is the page. */}
      <aside className={styles.visual} aria-hidden="true">
        <PublicMessagesProvider locale={locale === "pl" ? "pl" : "en"}>
          <AuthVisual />
        </PublicMessagesProvider>
      </aside>
      <div className={styles.side}>
        <header className={styles.top}>
          <RouterLink to={locale === "pl" ? "/pl" : "/"} className={styles.back}>
            <ArrowLeft aria-hidden="true" />
            {m.auth.backToSite}
          </RouterLink>
          {/* On a phone the left panel is gone: the logo takes the place of the back link and leads home. */}
          <RouterLink to={locale === "pl" ? "/pl" : "/"} className={styles.home} aria-label={m.auth.backToSite}>
            <img src="/brand/trainflow-logo.png" alt="TrainFlow" width={548} height={96} />
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
          <div className={styles.card}>
            <Outlet />
          </div>
        </main>
        <p className={styles.tagline}>{m.auth.brandLine}</p>
      </div>
    </div>
  );
}
