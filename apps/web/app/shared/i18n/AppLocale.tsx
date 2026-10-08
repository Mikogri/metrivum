import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { appEn, type AppMessages } from "./messages/app.en";
import { appPl } from "./messages/app.pl";
import { LocaleProvider } from "./LocaleContext";
import { isLocale, readLocalePreference, writeLocalePreference, DEFAULT_LOCALE, type Locale } from "./locale";

const dictionaries: Record<Locale, AppMessages> = { en: appEn, pl: appPl };

interface AppLocaleValue {
  locale: Locale;
  m: AppMessages;
  /** Applies a language from the profile or settings and remembers it for the next visit. */
  setLocale: (locale: string) => void;
}

const AppLocaleContext = createContext<AppLocaleValue>({ locale: DEFAULT_LOCALE, m: appEn, setLocale: () => {} });

/** Language for /auth and /app: the profile's locale once known, otherwise the stored preference. */
export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => setLocaleState(readLocalePreference()), []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((value: string) => {
    const next = value.toLowerCase().slice(0, 2);
    if (!isLocale(next)) return;
    writeLocalePreference(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, m: dictionaries[locale], setLocale }), [locale, setLocale]);
  return (
    <AppLocaleContext.Provider value={value}>
      <LocaleProvider locale={locale}>{children}</LocaleProvider>
    </AppLocaleContext.Provider>
  );
}

export function useAppLocale(): AppLocaleValue {
  return useContext(AppLocaleContext);
}

/** Typed messages of the active language: `const m = useT(); m.nav.dashboard`. */
export function useT(): AppMessages {
  return useContext(AppLocaleContext).m;
}
