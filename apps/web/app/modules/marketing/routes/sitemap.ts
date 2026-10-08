import { LOCALES } from "~/shared/i18n/locale";
import { PUBLIC_PAGES, publicPath, type PublicPage } from "~/shared/i18n/public-routes";
import { SITE_URL } from "~/shared/i18n/site";

// Pre-rendered resource route: build/client/sitemap.xml.
export function loader() {
  const pages = Object.keys(PUBLIC_PAGES) as PublicPage[];
  const urls = pages.flatMap((page) =>
    LOCALES.map((locale) => {
      const alternates = LOCALES.map(
        (alt) => `    <xhtml:link rel="alternate" hreflang="${alt}" href="${SITE_URL}${publicPath(page, alt)}"/>`,
      ).join("\n");
      return `  <url>\n    <loc>${SITE_URL}${publicPath(page, locale)}</loc>\n${alternates}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${publicPath(page, "en")}"/>\n  </url>`;
    }),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
