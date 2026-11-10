export const specializationsPl = {
  title: "Specjalizacje trenerskie",
  description:
    "Deklarowane obszary wiedzy, a nie zweryfikowane certyfikaty. Dostępne w każdym planie.",
  add: "Dodaj specjalizację",
  search: "Szukaj, np. Powerlifting",
  full: "Wybrano maksymalną liczbę",
  selected: (n: number, max: number) => `${n}/${max} wybranych`,
  primaryCount: (n: number, max: number) => `${n}/${max} głównych`,
  primary: "Główna",
  makePrimary: "Oznacz jako główną",
  markPrimary: (name: string) => `Oznacz ${name} jako główną`,
  remove: (name: string) => `Usuń ${name}`,
  limit:
    "Wybierz do 10 i oznacz do 5 jako główne. Nowe wybory są główne, dopóki jest miejsce.",
  filterHint:
    "Wyniki pasują do dowolnej wybranej specjalizacji. Trenerzy pasujący do większej liczby wyborów pojawiają się pierwsi.",
  filterEmpty: "Nie wybrano specjalizacji.",
  empty: "Jeszcze nic nie wybrano. Zacznij pisać powyżej.",
  saved: "Zapisano specjalizacje trenerskie.",
  edit: "Edytuj specjalizacje",
  optional: "Opcjonalnie. Możesz dodać je później w profilu trenera.",
  selectedWord: "wybranych",
  primaryWord: "głównych",
  toggleHint: "Kliknij kafelek, aby oznaczyć go jako główny lub zwykły.",
  primaryFull: "Pięć jest już głównych. Najpierw zmień jedną na zwykłą.",
};
