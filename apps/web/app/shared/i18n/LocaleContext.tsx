import { UIProvider } from "@portable-ui/react";
import { uiPl } from "./ui-messages";
import { createContext, useContext, type ReactNode } from "react";
import { I18nProvider } from "react-aria-components";
import { DEFAULT_LOCALE, intlLocale, type Locale } from "./locale";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <UIProvider messages={locale === "pl" ? uiPl : undefined}>
        <I18nProvider locale={intlLocale(locale)}>{children}</I18nProvider>
      </UIProvider>
    </LocaleContext.Provider>
  );
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}
