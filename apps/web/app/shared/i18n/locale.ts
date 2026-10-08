export const LOCALES = ["en", "pl"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Public pages: Polish lives under /pl, English at the root. */
export function localeFromPathname(pathname: string): Locale {
  return pathname === "/pl" || pathname.startsWith("/pl/") ? "pl" : "en";
}

/** Intl tag used for number/date formatting and React Aria. */
export function intlLocale(locale: Locale): string {
  return locale === "pl" ? "pl-PL" : "en-GB";
}

const PREFERENCE_KEY = "tf.locale";

/** Language for /auth and /app before a profile is loaded. Browser-only. */
export function readLocalePreference(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(PREFERENCE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be unavailable (private mode); fall through to the browser language.
  }
  return window.navigator.language.toLowerCase().startsWith("pl") ? "pl" : DEFAULT_LOCALE;
}

export function writeLocalePreference(locale: Locale) {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, locale);
  } catch {
    // Non-critical convenience.
  }
}
