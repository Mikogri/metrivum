import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogTrigger, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Link as RouterLink, NavLink, useLocation } from "react-router";
import { Button, IconButton, LinkButton } from "@metrivum/ui-web";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { pageFromPathname, publicPath } from "~/shared/i18n/public-routes";
import { usePublicMessages } from "../messages";
import { Logo } from "./Logo";
import { PublicAccountMenu } from "./PublicAccountMenu";
import styles from "./PublicHeader.module.css";

function LanguageSwitch() {
  const locale = useLocale();
  const m = usePublicMessages();
  const location = useLocation();
  const page = pageFromPathname(location.pathname) ?? "home";
  return (
    <nav aria-label={m.common.languageLabel} className={styles.languages}>
      {(["en", "pl"] as const).map((target) => (
        <RouterLink
          key={target}
          to={publicPath(page, target)}
          hrefLang={target}
          lang={target}
          aria-current={target === locale ? "true" : undefined}
          className={styles.language}
          title={m.common.languageNames[target]}
        >
          {target.toUpperCase()}
        </RouterLink>
      ))}
    </nav>
  );
}

export function PublicHeader({ hasSession, onSignedOut }: { hasSession: boolean; onSignedOut: () => void }) {
  const m = usePublicMessages();
  const locale = useLocale();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  const links = [
    { to: publicPath("features", locale), label: m.nav.features, end: true },
    { to: publicPath("programBuilder", locale), label: m.nav.programBuilder, end: false },
    { to: publicPath("videoAnalysis", locale), label: m.nav.videoAnalysis, end: false },
    // An anchor on the home page, so it never shows as the current page.
    { to: `${publicPath("home", locale)}#pricing`, label: m.nav.pricing, end: true, anchor: true },
  ];

  const actions = hasSession ? (
    <>
      <LinkButton href="/app" variant="primary" size="sm">
        {m.nav.openApp}
      </LinkButton>
      <PublicAccountMenu onChange={onSignedOut} />
    </>
  ) : (
    <>
      <LinkButton href="/auth/login" variant="ghost" size="sm">
        {m.nav.signIn}
      </LinkButton>
      <LinkButton href="/auth/register" variant="primary" size="sm">
        {m.nav.getStarted}
      </LinkButton>
    </>
  );

  return (
    <>
      <a href="#main" className="tf-skip-link">
        {m.common.skipToContent}
      </a>
      <header className={styles.header}>
        <div className={styles.inner}>
          <RouterLink to={publicPath("home", locale)} className={styles.brand} aria-label={m.nav.home}>
            <Logo />
          </RouterLink>
          <nav aria-label={m.nav.primary} className={styles.nav}>
            {links.map((link) => (
              link.anchor ? (
                <RouterLink key={link.to} to={link.to} className={styles.navLink}>
                  {link.label}
                </RouterLink>
              ) : (
                <NavLink key={link.to} to={link.to} end={link.end} className={styles.navLink}>
                  {link.label}
                </NavLink>
              )
            ))}
          </nav>
          <div className={styles.end}>
            <LanguageSwitch />
            <div className={styles.actions}>{actions}</div>
            <DialogTrigger isOpen={menuOpen} onOpenChange={setMenuOpen}>
              <IconButton className={styles.menuButton} label={m.nav.openMenu} icon={<Menu />} showTooltip={false} />
              <ModalOverlay isDismissable className={styles.sheetOverlay}>
                <Modal className={styles.sheet}>
                  <Dialog className={styles.sheetDialog} aria-label={m.nav.primary}>
                    {({ close }) => (
                      <>
                        <div className={styles.sheetTop}>
                          <Heading slot="title" className="tf-visually-hidden">
                            {m.nav.primary}
                          </Heading>
                          <Logo size="sm" />
                          <Button variant="ghost" size="sm" onPress={close} iconStart={<X />} aria-label={m.nav.closeMenu} />
                        </div>
                        <nav aria-label={m.nav.primary} className={styles.sheetNav}>
                          {links.map((link, i) =>
                            link.anchor ? (
                              <RouterLink key={link.to} to={link.to} className={styles.sheetLink} style={{ "--i": i } as React.CSSProperties}>
                                {link.label}
                              </RouterLink>
                            ) : (
                              <NavLink key={link.to} to={link.to} end={link.end} className={styles.sheetLink} style={{ "--i": i } as React.CSSProperties}>
                                {link.label}
                              </NavLink>
                            ),
                          )}
                        </nav>
                        <div className={styles.sheetActions}>{actions}</div>
                      </>
                    )}
                  </Dialog>
                </Modal>
              </ModalOverlay>
            </DialogTrigger>
          </div>
        </div>
      </header>
    </>
  );
}
