import { useLocation } from "react-router";
import { localeFromPathname } from "~/shared/i18n/locale";
import { privateMeta } from "~/shared/i18n/site";
import { PrivacyPolicy } from "../components/PrivacyPolicy";
import { SubpageHero } from "../components/SubpageHero";

// Terms of service (still a placeholder) and the privacy policy. Linked from sign-up.
const COPY = {
  en: {
    terms: {
      title: "Terms of service",
      lead: "The terms of service will be published here.",
    },
    privacy: {
      title: "Privacy policy",
      lead: "How Metrivum collects, uses, stores, shares and protects your personal data.",
    },
  },
  pl: {
    terms: {
      title: "Regulamin",
      lead: "Regulamin zostanie opublikowany na tej stronie.",
    },
    privacy: {
      title: "Polityka prywatności",
      lead: "Jak Metrivum zbiera, wykorzystuje, przechowuje, udostępnia i chroni Twoje dane osobowe.",
    },
  },
} as const;

export function meta({ location }: { location: { pathname: string } }) {
  const copy =
    COPY[localeFromPathname(location.pathname) === "pl" ? "pl" : "en"][
      location.pathname.endsWith("/privacy") ? "privacy" : "terms"
    ];
  return privateMeta(`${copy.title} — Metrivum`);
}

export default function LegalPage() {
  const { pathname } = useLocation();
  const locale = localeFromPathname(pathname);
  const page = pathname.endsWith("/privacy") ? "privacy" : "terms";
  const copy = COPY[locale === "pl" ? "pl" : "en"][page];
  if (page === "privacy")
    return (
      <>
        <SubpageHero title={copy.title} lead={copy.lead} />
        {/* The policy text is in English; the Polish page says so above it. */}
        <PrivacyPolicy
          notice={
            locale === "pl"
              ? "Polityka prywatności jest obecnie dostępna w języku angielskim. Polska wersja zostanie opublikowana wkrótce."
              : undefined
          }
        />
      </>
    );
  return <SubpageHero title={copy.title} lead={copy.lead} />;
}
