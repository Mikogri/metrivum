import { ChevronRight, Menu, PanelLeft, Search, X } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useMatches,
  useNavigate,
  useNavigation,
  useNavigationType,
} from "react-router";
import {
  Hint,
  IconButton,
  Kbd,
  PageBackContext,
  useMobileLayout,
  type PageBack,
} from "@metrivum/ui-web";
import { UsageButton, useAccessSnapshot } from "~/shared/access";
import {
  useWorkspace,
  WorkspaceRouteGuard,
} from "~/shared/session/WorkspaceScope";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { useHistoryTrail, useNavigateUp } from "~/shared/lib/navigateUp";
import { TOP_NOTICE_ID } from "~/shared/ui/TopNotice";
import { useT } from "~/shared/i18n/AppLocale";
import { IntegrationMenu } from "~/modules/integrations";
import { NotificationBell, useNotifications } from "~/modules/messaging";
import { AnalyzerMenu, AnalyzerUpdateBanner } from "~/modules/video-analysis";
import { useNavCounts } from "~/modules/coaching";
import { SubscriptionButton } from "~/modules/subscription/SubscriptionPanel";
import { AccountSwitcher } from "./AccountSwitcher";
import { RouteSkeleton } from "./RouteSkeleton";
import { useWarmRoutes } from "~/shared/lib/warmRoutes";
import { CommandPalette } from "./CommandPalette";
import { appNavGroups, pathCrumbs, settingsNavItem } from "./nav";
import type { NavIcon } from "./navIcons";
import styles from "./AppShell.module.css";

import { clientSection } from "~/shared/session/workspace-model";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { MobileNavigation } from "./MobileNavigation";
import { immersiveMobileRoute, mobileViewport } from "./mobile-navigation";
import { BrandMark } from "~/shared/ui/BrandMark";

const COLLAPSED_KEY = "tf.sidebar.collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function Brand() {
  const m = useT();
  return (
    <a href="/" className={styles.brand} aria-label={m.nav.publicSite}>
      <BrandMark className={styles.brandMark} />
      <span className={styles.brandText}>Metrivum</span>
    </a>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
  count,
  tone,
  collapsed,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: NavIcon;
  count?: string;
  tone?: "neutral" | "danger";
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const active =
    pathname === to ||
    pathname.startsWith(`${to}/`) ||
    (to === "/app/clients" && !!clientSection(pathname)) ||
    (to === "/app/programs" && pathname.startsWith("/app/templates"));
  return (
    <li>
      {/* The active state switches in place: no highlight travelling between items. */}
      {/* On the collapsed rail the label lives in a tooltip beside the icon. */}
      <Hint
        label={count ? `${label} · ${count}` : label}
        placement="right"
        delay={150}
        disabled={!collapsed}
      >
        <Link
          to={to}
          prefetch="render"
          aria-current={active ? "page" : undefined}
          className={styles.navLink}
          onClick={onNavigate}
        >
          <Icon aria-hidden="true" strokeWidth={1.5} />
          <span className={styles.navLabel}>{label}</span>
          {count ? (
            <span className={styles.navCount} data-tone={tone}>
              {count}
            </span>
          ) : null}
        </Link>
      </Hint>
    </li>
  );
}

function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const m = useT();
  const { mode } = useWorkspace();
  const groups = [
    ...appNavGroups(m, mode === "coach" ? ["Coach"] : ["Client"]),
    { id: "others", label: m.nav.groups.others, items: [settingsNavItem(m)] },
  ];
  // Running analyses, from the already-loaded access snapshot (no extra request).
  const { unreadMessages } = useNotifications();
  const { pathname } = useLocation();
  const running = useAccessSnapshot().data?.limits.find(
    (limit) => limit.key === "analysis.concurrent",
  )?.used;
  const counts: Record<string, string | undefined> = {
    "/app/messages":
      pathname !== "/app/messages" && unreadMessages > 0
        ? String(unreadMessages > 99 ? "99+" : unreadMessages)
        : undefined,
    "/app/video-analyses": Number(running) > 0 ? String(running) : undefined,
  };
  const waiting = useNavCounts(mode);
  const capped = (value: number) => (value > 99 ? "99+" : String(value));
  return (
    <>
      <WorkspaceSelect collapsed={collapsed} />
      <nav aria-label={m.nav.main} className={styles.nav}>
        {groups.map((group, index) => (
          <div key={group.id} className={styles.navGroup}>
            {index > 0 ? (
              <span className={styles.navGroupSeparator} aria-hidden="true" />
            ) : null}
            <ul className={styles.navList} aria-label={group.label}>
              {group.items.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  count={
                    counts[item.to] ??
                    (waiting[item.to]
                      ? capped(waiting[item.to]!.value)
                      : undefined)
                  }
                  tone={counts[item.to] ? undefined : waiting[item.to]?.tone}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className={styles.user}>
        <div className={styles.userInner}>
          <AccountSwitcher compact={collapsed} />
        </div>
      </div>
    </>
  );
}

function PathCrumbs() {
  const m = useT();
  const { pathname } = useLocation();
  const { mode } = useWorkspace();
  const crumbs = pathCrumbs(m, pathname, mode);
  if (!crumbs.length) return null;
  return (
    <nav aria-label={m.nav.crumbsLabel} className={styles.crumbs}>
      <ol>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              {i > 0 ? (
                <ChevronRight aria-hidden="true" className={styles.crumbSep} />
              ) : null}
              <li>
                {last ? (
                  <span aria-current="page" className={styles.crumbCurrent}>
                    {crumb.label}
                  </span>
                ) : crumb.href ? (
                  <Link
                    to={crumb.href}
                    prefetch="intent"
                    className={styles.crumbLink}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={styles.crumbGroup}>{crumb.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Back for detail pages (/app/section/:id…) and for folders (?folder=). Returns to the page the
 * person came from when that was inside the app, otherwise to the parent list.
 */
function useBack(
  pathname: string,
  search: string,
  navigate: ReturnType<typeof useNavigate>,
  up: (target: string) => void,
  label: string,
): PageBack | null {
  const parts = pathname.split("/").filter(Boolean);
  const inFolder = new URLSearchParams(search).has("folder");
  if (parts.length < 3 && !inFolder) return null;
  // Inside a folder, back is the folder you came from; on a detail page it is the level above.
  if (inFolder && parts.length < 3) {
    return {
      label,
      onPress: () => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(pathname);
      },
    };
  }
  const parent = `/${parts.slice(0, -1).join("/")}`;
  // These detail routes have no parent list at their immediate URL level.
  if (
    parent === "/app/my-training/plans" ||
    parent === "/app/my-training/workouts" ||
    parent === "/app/training/workouts"
  ) {
    const fallback =
      parent === "/app/my-training/plans"
        ? "/app/my-training?tab=plans"
        : parent === "/app/my-training/workouts"
          ? "/app/my-training"
          : "/app/clients";
    return {
      label,
      onPress: () => {
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(fallback);
      },
    };
  }
  return { label, onPress: () => up(parent) };
}

export function AppShell() {
  const m = useT();
  const phone = useMobileLayout();
  const shell = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<{ open: boolean; animated: boolean }>({
    open: false,
    animated: false,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const location = useLocation();
  const navigationType = useNavigationType();
  const scrollPositions = useRef(new Map<string, number>());
  const immersive =
    phone && immersiveMobileRoute(location.pathname, location.search);
  const conversation = immersive && location.pathname === "/app/messages";
  const matches = useMatches();
  const workspace = matches.some(
    (match) => (match.handle as { workspace?: boolean } | undefined)?.workspace,
  );
  // `fit` pages (calendar, dashboard) size their content to the window instead of scrolling.
  const fit = matches.some(
    (match) => (match.handle as { fit?: boolean } | undefined)?.fit,
  );
  const main = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  // Keep the current outlet mounted during navigation; destination pages load their own content.
  const navigation = useNavigation();
  const switching =
    navigation.state === "loading" &&
    navigation.location.pathname !== location.pathname;
  // Page code is loaded ahead in the background; a page not loaded yet shows its skeleton almost at once
  // instead of leaving the old page on screen (the short wait only avoids a flash on instant switches).
  const [slowSwitch, setSlowSwitch] = useState(false);
  useEffect(() => {
    if (!switching) return setSlowSwitch(false);
    const timer = setTimeout(() => setSlowSwitch(true), 60);
    return () => clearTimeout(timer);
  }, [switching]);
  const toEditor =
    switching && /\/edit$/.test(navigation.location?.pathname ?? "");
  useHistoryTrail();
  useWarmRoutes();
  const up = useNavigateUp();
  const back = useBack(
    location.pathname,
    location.search,
    navigate,
    up,
    m.common.back,
  );
  useEffect(() => setDrawerOpen(false), [location.pathname]);
  // The shell owns scrolling, so browser Back restores its entry rather than the window's scroll.
  // Filters and tabs replace the address on the same page; those keep the reader where they are.
  const shownPath = useRef(location.pathname);
  useLayoutEffect(() => {
    const element = main.current;
    if (!element) return;
    const samePage =
      navigationType === "REPLACE" && shownPath.current === location.pathname;
    shownPath.current = location.pathname;
    if (samePage) scrollPositions.current.set(location.key, element.scrollTop);
    else
      element.scrollTop =
        navigationType === "POP"
          ? (scrollPositions.current.get(location.key) ?? 0)
          : 0;
    const positions = scrollPositions.current;
    if (positions.size > 40) positions.delete(positions.keys().next().value!);
  }, [location.key, location.pathname, navigationType]);
  useEffect(() => {
    const element = shell.current;
    if (!phone || !element) return;
    let height = window.innerHeight;
    let width = window.innerWidth;
    const update = () => {
      if (width !== window.innerWidth) {
        width = window.innerWidth;
        height = window.innerHeight;
      }
      height = Math.max(height, window.innerHeight);
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        focused.matches(
          "input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]",
        );
      const viewport = mobileViewport(
        height,
        window.visualViewport ?? undefined,
        editing,
      );
      element.style.setProperty(
        "--mobile-viewport-height",
        `${viewport.height}px`,
      );
      element.style.setProperty("--mobile-viewport-top", `${viewport.top}px`);
      element.toggleAttribute("data-keyboard", viewport.keyboard);
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      element.style.removeProperty("--mobile-viewport-height");
      element.style.removeProperty("--mobile-viewport-top");
      element.removeAttribute("data-keyboard");
    };
  }, [phone]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {
        // Storage can be unavailable; the toggle still works for this visit.
      }
      return !value;
    });
  };

  // ⌘K / Ctrl+K: frequent and keyboard-driven, so the palette opens without animation.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((state) => ({ open: !state.open, animated: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={shell}
      className={styles.shell}
      data-phone={phone || undefined}
      data-immersive={immersive || undefined}
      data-conversation={conversation || undefined}
      data-collapsed={collapsed || undefined}
      data-workspace={workspace || undefined}
      data-fit={fit || undefined}
    >
      <a href="#app-main" className="tf-skip-link">
        {m.common.skipToContent}
      </a>
      {/* Full width above the sidebar and the page, like a status notice. */}
      {!MOCK_MODE ? <AnalyzerUpdateBanner /> : null}
      {/* Pages put their own full-width notice here (e.g. the profile preview), in the same top row. */}
      <div id={TOP_NOTICE_ID} style={{ display: "contents" }} />

      {!phone && (
        <aside className={styles.sidebar}>
          <div className={styles.logo}>
            <Brand />
          </div>
          <SidebarContent collapsed={collapsed} />
        </aside>
      )}

      <div className={styles.column}>
        {phone ? (
          !conversation && (
            <header className={`${styles.appBar} ${styles.phoneBar}`}>
              <Link to="/app/today" className={styles.phoneBrand}>
                Metrivum
              </Link>
              <div className={styles.appBarActions}>
                <IconButton
                  label={m.nav.commandPalette}
                  icon={<Search strokeWidth={1.75} />}
                  size="sm"
                  variant="ghost"
                  showTooltip={false}
                  onPress={() => setPalette({ open: true, animated: true })}
                />
                <AnalyzerMenu />
                <UsageButton />
                <IntegrationMenu />
                <NotificationBell />
                <span className={styles.phoneAccount}>
                  <AccountSwitcher compact />
                </span>
              </div>
            </header>
          )
        ) : (
          <header className={styles.appBar}>
            <span className={styles.desktopOnly}>
              <IconButton
                label={collapsed ? m.nav.expand : m.nav.collapse}
                icon={<PanelLeft strokeWidth={1.5} />}
                size="sm"
                variant="ghost"
                onPress={toggleCollapsed}
              />
            </span>
            <span className={styles.mobileOnly}>
              <IconButton
                label={m.nav.openMenu}
                icon={<Menu />}
                size="sm"
                variant="ghost"
                onPress={() => setDrawerOpen(true)}
                showTooltip={false}
              />
            </span>
            <PathCrumbs />
            <div className={styles.appBarActions}>
              <button
                type="button"
                className={styles.search}
                onClick={() => setPalette({ open: true, animated: true })}
                aria-label={m.nav.commandPalette}
              >
                <Search aria-hidden="true" strokeWidth={1.75} />
                <span>{m.nav.searchShort}</span>
                <Kbd>⌘K</Kbd>
              </button>
              <AnalyzerMenu />
              <UsageButton />
              <IntegrationMenu />
              <NotificationBell />
              <SubscriptionButton label={m.nav.subscription} />
            </div>
          </header>
        )}

        {MOCK_MODE ? (
          <p className={styles.mockBanner} role="note">
            {
              m["ui"][
                "Developer mock data — not connected to the Metrivum API (VITE_DEV_MOCKS=1)."
              ]
            }
          </p>
        ) : null}
        <main
          id="app-main"
          ref={main}
          className={styles.main}
          aria-busy={switching || undefined}
          tabIndex={-1}
          onScroll={(event) =>
            scrollPositions.current.set(
              location.key,
              event.currentTarget.scrollTop,
            )
          }
        >
          <div className={styles.content}>
            <PageBackContext.Provider value={back}>
              {phone && location.pathname === "/app/dashboard" ? (
                <Navigate to="/app/today" replace />
              ) : (
                <WorkspaceRouteGuard>
                  {slowSwitch && switching ? (
                    <RouteSkeleton editor={toEditor} />
                  ) : (
                    <Outlet />
                  )}
                </WorkspaceRouteGuard>
              )}
            </PageBackContext.Provider>
          </div>
        </main>
        {phone && !immersive && (
          <div className={styles.phoneNav}>
            <MobileNavigation />
          </div>
        )}
      </div>

      {!phone && (
        <ModalOverlay
          isOpen={drawerOpen}
          onOpenChange={setDrawerOpen}
          isDismissable
          className={styles.drawerOverlay}
        >
          <Modal className={styles.drawer}>
            <Dialog aria-label={m.nav.main} className={styles.drawerDialog}>
              <div className={styles.logo}>
                <Brand />
                <IconButton
                  label={m.nav.closeMenu}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  onPress={() => setDrawerOpen(false)}
                  showTooltip={false}
                />
              </div>
              <SidebarContent onNavigate={() => setDrawerOpen(false)} />
            </Dialog>
          </Modal>
        </ModalOverlay>
      )}

      <CommandPalette
        isOpen={palette.open}
        animated={palette.animated}
        onOpenChange={(open) => setPalette((state) => ({ ...state, open }))}
      />
    </div>
  );
}
