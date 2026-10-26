export const specializationsPl = {
  title: "Specjalizacje trenerskie", description: "Deklarowane obszary wiedzy, a nie zweryfikowane certyfikaty. Dostępne w każdym planie.",
  search: "Szukaj specjalizacji", selected: (n: number) => `${n}/5 wybranych`, primaryCount: (n: number) => `${n}/3 głównych`,
  primary: "Główna", markPrimary: (name: string) => `Oznacz ${name} jako główną`, remove: (name: string) => `Usuń ${name}`,
  limit: "Możesz wybrać do 5 specjalizacji i oznaczyć do 3 jako główne. Usuń wybór, aby wybrać inną.",
  filterHint: "Wyniki pasują do dowolnej wybranej specjalizacji. Trenerzy pasujący do większej liczby wyborów pojawiają się pierwsi.",
  empty: "Nie wybrano specjalizacji.", saved: "Zapisano specjalizacje trenerskie.", edit: "Edytuj specjalizacje", optional: "Opcjonalnie. Możesz dodać je później w profilu trenera.",
};
