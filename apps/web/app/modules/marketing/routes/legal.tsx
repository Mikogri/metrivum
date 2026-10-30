import { useLocation } from "react-router";
import { localeFromPathname } from "~/shared/i18n/locale";
import { privateMeta } from "~/shared/i18n/site";
import { SubpageHero } from "../components/SubpageHero";

// Placeholder pages until the terms of service and privacy policy are written. Linked from sign-up.
const COPY = {
  en: {
    terms: { title: "Terms of service", lead: "The terms of service will be published here." },
    privacy: { title: "Privacy policy", lead: "The privacy policy will be published here." },
  },
  pl: {
    terms: { title: "Regulamin", lead: "Regulamin zostanie opublikowany na tej stronie." },
    privacy: { title: "Polityka prywatności", lead: "Polityka prywatności zostanie opublikowana na tej stronie." },
  },
} as const;

export function meta({ location }: { location: { pathname: string } }) {
  const copy = COPY[localeFromPathname(location.pathname) === "pl" ? "pl" : "en"][location.pathname.endsWith("/privacy") ? "privacy" : "terms"];
  return privateMeta(`${copy.title} — Metrivum`);
}

export default function LegalPage() {
  const { pathname } = useLocation();
  const locale = localeFromPathname(pathname);
  const page = pathname.endsWith("/privacy") ? "privacy" : "terms";
  const copy = COPY[locale === "pl" ? "pl" : "en"][page];
  return <SubpageHero title={copy.title} lead={copy.lead} />;
}
