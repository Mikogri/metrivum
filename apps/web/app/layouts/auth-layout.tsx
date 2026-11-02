import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Outlet, Link as RouterLink, useLocation } from "react-router";
import { LightRays, Segment, SegmentedControl } from "@metrivum/ui-web";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { Logo } from "~/modules/marketing/components/Logo";
import "./night-theme.css";
import styles from "./auth-layout.module.css";



/**
 * Sign-in, registration and onboarding: one glossy card under soft beams of light from the top. The card
 * is keyed by the page, so switching between sign-in and registration plays the entrance again.
 */
export default function AuthLayout() {
  const m = useT();
  const { locale, setLocale } = useAppLocale();
  const { pathname } = useLocation();
  // Setting up the profile holds more fields: a wider card.
  const wide = pathname === "/onboarding";
  // The night palette also applies to menus rendered in portals.
  useEffect(() => {
    document.documentElement.setAttribute("data-public-theme", "night");
    return () => document.documentElement.removeAttribute("data-public-theme");
  }, []);
  const home = locale === "pl" ? "/pl" : "/";
  return (
    <div className={styles.page} data-public-theme="night">
      <div className={styles.backdrop} aria-hidden="true">
        {/* React Bits "Light Rays" from the top: soft neutral white; it does not react to the pointer. */}
        <LightRays className={styles.light} raysColor="#ffffff" lightSpread={0.85} rayLength={1.2} intensity={0.65} glow={0.3} haze={0.2}
            atmosphere={0} saturation={0} raysSpeed={0.45} followMouse={false} cursorShadow={false} clickPulse={false} opacity={0.8} />
        <span className={styles.grid} />
      </div>
      <header className={styles.top}>
        <RouterLink to={home} className={styles.brand} aria-label={m.auth.backToSite}>
          <Logo />
        </RouterLink>
        <div className={styles.topEnd}>
          <RouterLink to={home} className={styles.back}>
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
        </div>
      </header>
      <main id="main" className={styles.main} data-wide={wide || undefined}>
        <div className={styles.card} key={pathname}>
          <Outlet />
        </div>
      </main>
      <p className={styles.tagline}>{m.auth.brandLine}</p>
    </div>
  );
}
