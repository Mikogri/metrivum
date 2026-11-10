// Story copy in both product languages; stories pick it from the toolbar "Locale" global.
export const copy = {
  en: {
    save: "Save changes",
    publish: "Publish revision",
    delete: "Delete folder",
    cancel: "Cancel",
    longLabel:
      "Export the whole program including every block, cycle and workout as a PDF",
    name: "Program name",
    nameHint: "Visible only to you.",
    required: "This field is required.",
    load: "Load",
    search: "Search exercises",
    kind: "Set type",
    standard: "Standard",
    topSet: "Top set",
    ramp: "Ramp",
    accept: "I accept the terms",
    notify: "Email me when an analysis finishes",
    dialogTitle: "Rename folder",
    dialogBody: "Folder names are private to your workspace.",
    alertTitle: "Delete this folder?",
    alertBody: "Only empty folders can be deleted.",
    emptyTitle: "No programs yet",
    emptyBody:
      "Create a program from scratch, from a template or from a CSV file.",
    errorTitle: "Can't load your programs",
    errorBody: "Metrivum didn't respond. Try again in a moment.",
    toastSaved: "Draft saved",
    toastFailed: "Couldn't save",
    page: (p: number, n: number | null) =>
      n ? `Page ${p} of ${n}` : `Page ${p}`,
    previous: "Previous",
    next: "Next",
  },
  pl: {
    save: "Zapisz zmiany",
    publish: "Opublikuj rewizję",
    delete: "Usuń folder",
    cancel: "Anuluj",
    longLabel:
      "Eksportuj cały program wraz z każdym blokiem, cyklem i treningiem jako PDF",
    name: "Nazwa programu",
    nameHint: "Widoczne tylko dla Ciebie.",
    required: "To pole jest wymagane.",
    load: "Obciążenie",
    search: "Szukaj ćwiczeń",
    kind: "Typ serii",
    standard: "Standard",
    topSet: "Seria szczytowa",
    ramp: "Rampa",
    accept: "Akceptuję regulamin",
    notify: "Wyślij e-mail po zakończeniu analizy",
    dialogTitle: "Zmień nazwę folderu",
    dialogBody: "Nazwy folderów są prywatne w Twojej przestrzeni.",
    alertTitle: "Usunąć ten folder?",
    alertBody: "Usunąć można tylko pusty folder.",
    emptyTitle: "Brak programów",
    emptyBody: "Utwórz program od zera, z szablonu albo z pliku CSV.",
    errorTitle: "Nie udało się wczytać programów",
    errorBody: "Metrivum nie odpowiedział. Spróbuj ponownie za chwilę.",
    toastSaved: "Szkic zapisany",
    toastFailed: "Nie udało się zapisać",
    page: (p: number, n: number | null) =>
      n ? `Strona ${p} z ${n}` : `Strona ${p}`,
    previous: "Poprzednia",
    next: "Następna",
  },
};

export type Copy = (typeof copy)["en"];
export const pick = (locale: unknown): Copy =>
  locale === "pl" ? copy.pl : copy.en;
