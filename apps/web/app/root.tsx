import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { ReactNode } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useHref,
  useLocation,
  useNavigate,
  type NavigateOptions,
} from "react-router";
import { RouterProvider } from "react-aria-components";
import "@portable-ui/react/styles.css";
import "./fonts.css";
import "./metrivum-theme.css";
import "./app.css";
import type { Route } from "./+types/root";
import { localeFromPathname } from "~/shared/i18n/locale";
import { RootError } from "~/shared/lib/RootError";
import {
  AuthBootSkeleton,
  BootSkeleton,
  BOOT_SHAPE_SCRIPT,
} from "~/shared/ui/BootSkeleton";

declare module "react-aria-components" {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

const MOTION_FLAG_SCRIPT =
  "if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.setAttribute('data-motion','')";

export const links: Route.LinksFunction = () => [
  { rel: "icon", type: "image/svg+xml", href: "/brand/metrivum-mark.svg?v=3" },
  { rel: "icon", type: "image/png", href: "/favicon.png?v=3" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=3" },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  // Public pages carry their language in the URL; /app and /auth update <html lang> after the profile loads.
  const lang = localeFromPathname(location.pathname);
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <meta name="theme-color" content="#0f0f0f" />
        <meta name="color-scheme" content="dark" />
        {/* Enables reveal-on-scroll initial states only when JS runs and motion is allowed. */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_FLAG_SCRIPT }} />
        {/* The start-up placeholder is one static file for every page: this picks the sign-in shape where it fits. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SHAPE_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();
  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <Outlet />
    </RouterProvider>
  );
}

/**
 * Shown while a SPA route (served from __spa-fallback.html) hydrates. Deliberately empty of private data. Both shapes
 * are in the file; the <html data-boot> mark set before paint shows the one for the page being opened.
 */
export function HydrateFallback() {
  const uiCopy = useUiCopy();

  return (
    <div className="tf-hydrate">
      <BootSkeleton label={uiCopy["ui"]["Loading Metrivum"]} />
      <AuthBootSkeleton label={uiCopy["ui"]["Loading Metrivum"]} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  return <RootError status={status} error={error} />;
}
