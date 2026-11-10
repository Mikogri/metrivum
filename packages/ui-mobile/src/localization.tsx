import {
  createContext,
  useContext,
  useEffect,
  type PropsWithChildren,
} from "react";

export const uiTranslations = {
  en: {
    loading: "Loading",
    loadError: "Unable to load this content.",
    retry: "Retry",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    dismiss: "Dismiss",
    done: "Done",
    search: "Search",
    choose: "Choose",
    noResults: "Nothing matches.",
    discardTitle: "Discard changes?",
    discardMessage: "What you entered here has not been saved.",
    discard: "Discard",
    keepEditing: "Keep editing",
  },
  pl: {
    loading: "Ładowanie",
    loadError: "Nie udało się wczytać treści.",
    retry: "Spróbuj ponownie",
    close: "Zamknij",
    cancel: "Anuluj",
    confirm: "Potwierdź",
    dismiss: "Zamknij",
    done: "Gotowe",
    search: "Szukaj",
    choose: "Wybierz",
    noResults: "Brak wyników.",
    discardTitle: "Odrzucić zmiany?",
    discardMessage: "Wpisane tutaj dane nie zostały zapisane.",
    discard: "Odrzuć",
    keepEditing: "Edytuj dalej",
  },
};
const UiLocale = createContext(uiTranslations.en);
let alertLabels = uiTranslations.en;
export const getAlertLabels = () => alertLabels;
export const useUiLabels = () => useContext(UiLocale);
export function UiLocaleProvider({
  locale,
  children,
}: PropsWithChildren<{ locale: "en" | "pl" }>) {
  const labels = uiTranslations[locale];
  // Native alerts are imperative and may be opened outside React components.
  useEffect(() => {
    alertLabels = labels;
  }, [labels]);
  return <UiLocale.Provider value={labels}>{children}</UiLocale.Provider>;
}
