import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { LocaleProvider } from "~/shared/i18n/LocaleContext";
import { localeFromPathname } from "~/shared/i18n/locale";
import { PublicFooter } from "~/modules/marketing/components/PublicFooter";
import { PublicHeader } from "~/modules/marketing/components/PublicHeader";
import { PublicMessagesProvider } from "~/modules/marketing/messages";
import { hasStoredSessionHint } from "~/shared/session/storage-keys";
import "./night-theme.css";
import styles from "./public-layout.module.css";

export default function PublicLayout() {
  const location = useLocation();
  const locale = localeFromPathname(location.pathname);
  // Rendered as "signed out" in static HTML; upgraded after hydration if a session exists locally.
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => setHasSession(hasStoredSessionHint()), []);
  // Menus and dialogs render in portals outside the shell, so the night palette goes on <html> too.
  useEffect(() => {
    document.documentElement.setAttribute("data-public-theme", "night");
    return () => document.documentElement.removeAttribute("data-public-theme");
  }, []);

  return (
    <LocaleProvider locale={locale}>
      <PublicMessagesProvider locale={locale}>
        <div className={styles.shell} data-public-theme="night">
          <PublicHeader hasSession={hasSession} onSignedOut={() => setHasSession(hasStoredSessionHint())} />
          <main id="main" className={styles.main} tabIndex={-1}>
            <Outlet context={{ hasSession }} />
          </main>
          <PublicFooter />
        </div>
      </PublicMessagesProvider>
    </LocaleProvider>
  );
}
