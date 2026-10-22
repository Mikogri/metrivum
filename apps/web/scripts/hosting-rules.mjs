// Routing rules for serving the production build. Mirrored in docs/frontend/hosting.md;
// any real host (nginx, CDN rules, static platform) must implement the same behaviour.

/** SPA areas: valid client routes that have no pre-rendered HTML of their own. */
export const SPA_PREFIXES = ["/app", "/auth", "/onboarding"];

/** Never answered with HTML: API calls and build assets must fail loudly when missing. */
export const NEVER_FALLBACK_PREFIXES = ["/api/", "/assets/", "/brand/", "/anatomy/"];

/**
 * Decides how a request path is served.
 * @returns {{ kind: "file", path: string } | { kind: "spa" } | { kind: "not-found" }}
 */
export function classify(pathname, exists) {
  let clean;
  try {
    clean = decodeURIComponent(pathname.split("?")[0]).replace(/\/+$/, "") || "/";
  } catch {
    return { kind: "not-found" };
  }
  if (clean.includes("..")) return { kind: "not-found" };
  // 1. Exact static file (assets, favicon, robots.txt, sitemap.xml, og-image.png).
  if (clean !== "/" && exists(clean)) return { kind: "file", path: clean };
  // 2. Pre-rendered public page: /features -> /features/index.html.
  const html = clean === "/" ? "/index.html" : `${clean}/index.html`;
  if (clean !== "/404" && exists(html)) return { kind: "file", path: html };
  // 3. Things that must never be masked by HTML.
  if (NEVER_FALLBACK_PREFIXES.some((prefix) => clean.startsWith(prefix.replace(/\/$/, "")))) return { kind: "not-found" };
  // 4. Client-rendered areas get the SPA fallback (not the pre-rendered landing).
  if (SPA_PREFIXES.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`))) return { kind: "spa" };
  // 5. Everything else is a real 404.
  return { kind: "not-found" };
}
