import { useEffect } from "react";

/**
 * Loads the code of every page under `/app` in the background, a little at a time while the browser is idle,
 * so following any link (an offer, an exercise, a person…) switches page at once instead of waiting for its code.
 * Data still loads on the page itself, behind its own loading state.
 *
 * React Router keeps loaded route modules in `window.__reactRouterRouteModules` and skips the download for any
 * route found there; the CSS is fetched into the HTTP cache so the router's stylesheet preload resolves at once.
 */
type ManifestRoute = { id: string; parentId?: string; path?: string; module: string; css?: string[] };
type RouterWindow = Window & {
  __reactRouterManifest?: { routes: Record<string, ManifestRoute> };
  __reactRouterRouteModules?: Record<string, unknown>;
};

/** Routes below the `/app` layout, in the order they are declared. */
export function appRoutes(routes: Record<string, ManifestRoute>): ManifestRoute[] {
  const app = Object.values(routes).find((route) => route.path === "app");
  if (!app) return [];
  const below = (route: ManifestRoute): boolean => {
    for (let parent = route.parentId; parent; parent = routes[parent]?.parentId) if (parent === app.id) return true;
    return false;
  };
  return Object.values(routes).filter(below);
}

const idle = (run: () => void) => {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 50);
};

let started = false;

export function useWarmRoutes() {
  useEffect(() => {
    const w = window as RouterWindow;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (started || !w.__reactRouterManifest || !w.__reactRouterRouteModules || connection?.saveData) return;
    const cache = w.__reactRouterRouteModules;
    const queue = appRoutes(w.__reactRouterManifest.routes).filter((route) => !(route.id in cache));
    const seen = new Set<string>();
    const next = () => {
      const route = queue.shift();
      if (!route) return;
      if (route.id in cache) return void idle(next);
      for (const href of route.css ?? []) {
        if (seen.has(href)) continue;
        seen.add(href);
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.as = "style";
        link.href = href;
        document.head.appendChild(link);
      }
      import(/* @vite-ignore */ route.module)
        .then((module: unknown) => {
          if (!(route.id in cache)) cache[route.id] = module;
        })
        // A page that fails here is simply loaded on demand later.
        .catch(() => undefined)
        .finally(() => idle(next));
    };
    // Let the current page settle first.
    const start = window.setTimeout(() => {
      if (started) return;
      started = true;
      idle(next);
    }, 1500);
    return () => window.clearTimeout(start);
  }, []);
}
