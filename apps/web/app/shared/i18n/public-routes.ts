import type { Locale } from "./locale";

/** Public, pre-rendered pages. Keys are stable ids; paths are the English URL without prefix. */
export const PUBLIC_PAGES = {
  home: "/",
  features: "/features",
  programBuilder: "/features/program-builder",
  videoAnalysis: "/features/video-analysis",
} as const;

export type PublicPage = keyof typeof PUBLIC_PAGES;

export function publicPath(page: PublicPage, locale: Locale): string {
  const path = PUBLIC_PAGES[page];
  if (locale === "en") return path;
  return path === "/" ? "/pl" : `/pl${path}`;
}

/** Strips the /pl prefix so the same page can be linked in the other language. */
export function pageFromPathname(pathname: string): PublicPage | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const unprefixed = clean === "/pl" ? "/" : clean.startsWith("/pl/") ? clean.slice(3) : clean;
  const entry = Object.entries(PUBLIC_PAGES).find(([, path]) => path === unprefixed);
  return entry ? (entry[0] as PublicPage) : null;
}

/** Paths written as static HTML by `react-router build`. /404 renders the not-found page for the host. */
export const prerenderPaths: string[] = [
  ...Object.keys(PUBLIC_PAGES).flatMap((page) => [publicPath(page as PublicPage, "en"), publicPath(page as PublicPage, "pl")]),
  "/404",
  "/sitemap.xml",
];
