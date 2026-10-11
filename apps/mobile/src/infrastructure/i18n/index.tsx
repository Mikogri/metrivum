import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PropsWithChildren,
} from "react";
import { useLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { UiLocaleProvider } from "@trainflow/ui-mobile";
import {
    resolveLocale,
    translate,
    type Locale,
    type TranslationKey,
} from "./messages";

type I18n = {
    locale: Locale;
    setLocale: (locale: Locale) => Promise<void>;
    applyProfileLocale: (locale: string) => void;
    t: (
        key: TranslationKey,
        values?: Record<string, string | number>,
    ) => string;
};
const Context = createContext<I18n | undefined>(undefined);
export function LocaleProvider({ children }: PropsWithChildren) {
    const locales = useLocales();
    const deviceLocale = resolveLocale(locales[0]?.languageCode) || "en";
    const [locale, updateLocale] = useState<Locale>(deviceLocale);
    const chosen = useRef(false);
    useEffect(() => {
        let active = true;
        void SecureStore.getItemAsync("trainflow.locale")
            .then((value) => {
                if (active && !chosen.current)
                    updateLocale(resolveLocale(value) || deviceLocale);
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [deviceLocale]);
    const setLocale = useCallback(async (next: Locale) => {
        await SecureStore.setItemAsync("trainflow.locale", next);
        chosen.current = true;
        updateLocale(next);
    }, []);
    const applyProfileLocale = useCallback(
        (value: string) => {
            chosen.current = true;
            updateLocale(resolveLocale(value) || deviceLocale);
        },
        [deviceLocale],
    );
    const value = useMemo<I18n>(
        () => ({
            locale,
            setLocale,
            applyProfileLocale,
            t: (key, values) => translate(locale, key, values),
        }),
        [locale, setLocale, applyProfileLocale],
    );
    return (
        <Context.Provider value={value}>
            <UiLocaleProvider locale={locale}>{children}</UiLocaleProvider>
        </Context.Provider>
    );
}
export function useI18n() {
    const value = useContext(Context);
    if (!value) throw new Error("LocaleProvider is missing.");
    return value;
}
