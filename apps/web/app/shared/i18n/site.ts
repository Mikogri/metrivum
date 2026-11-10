import { LOCALES, type Locale } from "./locale";
import { pageFromPathname, publicPath } from "./public-routes";

/** Public origin for canonical/hreflang/sitemap. Configure VITE_SITE_URL per environment. */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? "http://localhost:5173"
).replace(/\/+$/, "");

export const OG_IMAGE_PATH = "/og-image.png?v=3";

interface PageMetaInput {
  title: string;
  description: string;
  pathname: string;
  locale: Locale;
}

/** Title, description, canonical, hreflang alternates and share metadata for a public page. */
export function publicPageMeta({
  title,
  description,
  pathname,
  locale,
}: PageMetaInput) {
  const page = pageFromPathname(pathname);
  const canonical = `${SITE_URL}${page ? publicPath(page, locale) : pathname}`;
  const alternates = page
    ? [
        ...LOCALES.map((alt) => ({
          tagName: "link" as const,
          rel: "alternate",
          hrefLang: alt,
          href: `${SITE_URL}${publicPath(page, alt)}`,
        })),
        {
          tagName: "link" as const,
          rel: "alternate",
          hrefLang: "x-default",
          href: `${SITE_URL}${publicPath(page, "en")}`,
        },
      ]
    : [];
  return [
    { title },
    { name: "description", content: description },
    { tagName: "link" as const, rel: "canonical", href: canonical },
    ...alternates,
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Metrivum" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:image", content: `${SITE_URL}${OG_IMAGE_PATH}` },
    { property: "og:locale", content: locale === "pl" ? "pl_PL" : "en_GB" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

/** Robots meta for account and app screens. This is an indexing hint, not access control. */
export const noIndexMeta = [{ name: "robots", content: "noindex, nofollow" }];

/** Title plus noindex for account and app screens (child route meta replaces the parent's). */
export function privateMeta(title: string) {
  return [{ title }, ...noIndexMeta];
}
