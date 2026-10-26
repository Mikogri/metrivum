import type { discoveryEn } from "./discovery.en";

export const discoveryPl: { [K in keyof typeof discoveryEn]: typeof discoveryEn[K] } = {
  title: "Odkrywaj trenerów", description: "Znajdź trenera według specjalizacji, języka i sposobu współpracy.",
  search: "Imię, nazwa użytkownika, opis lub specjalizacja", specialization: "Specjalizacja", language: "Język", location: "Publiczna lokalizacja", mode: "Tryb współpracy", allModes: "Dowolny tryb",
  online: "Online", offline: "Stacjonarnie", hybrid: "Hybrydowo", hasOffers: "Ma opublikowane oferty", category: "Kategoria oferty", filters: "Filtruj trenerów", clear: "Wyczyść filtry",
  featured: "Wyróżnieni trenerzy (Pro+)", other: "Wszyscy trenerzy", badge: "Wyróżnienie · Pro+", priority: "Aktywne abonamenty Pro, Team i Studio mają równy priorytet wśród pasujących trenerów. Wyróżnienie wynika z płatnej symulowanej subskrypcji i nie gwarantuje zapytań.",
  empty: "Brak pasujących trenerów", emptyBody: "Usuń część filtrów lub zmień wyszukiwaną frazę.", profile: "Zobacz profil", offers: "Zobacz oferty", from: "Od", offerPrice: "Cena początkowa opublikowanej oferty; warunki płatności znajdziesz w ofercie.",
  listingSub: "Co widzą klienci w wyszukiwaniu i czy jesteś widoczny.", proTitle: "Priorytet wśród dopasowanych trenerów", proBody: "Pro, Team i Studio mają równy płatny priorytet przy porównywalnym dopasowaniu specjalizacji. Dopasowanie jest ważniejsze.",
  proOn: "Priorytet w wynikach włączony", proOnBody: "Twój plan dodaje płatny priorytet wśród równie dobrze dopasowanych trenerów. Dopasowanie jest ważniejsze.", proNote: "Wyróżnienie nie gwarantuje zapytań.",
  results: (n) => `Trenerzy: ${n}`, featuredSub: "Trenerzy na Pro, Team i Studio, wyświetlani jako pierwsi.",
  manage: "Twój profil w Discovery", publish: "Publikuj w Discovery", privacy: "Publikacja jest dobrowolna i dostępna od 18. roku życia. Widoczne będą tylko publiczna nazwa, nazwa użytkownika, opis, szczegóły profilu Discovery i aktywne oferty. Podaj tylko tak dokładną lokalizację, jaką chcesz udostępnić.",
  tagsHint: "Oddziel wartości przecinkami.", languagesHint: "Podaj kody języków, np. en, pl lub de.", locationHint: "Opcjonalnie, np. miasto lub kraj. Prywatny adres nie jest kopiowany.",
  saved: "Zapisano ustawienia Discovery.", save: "Zapisz profil", withdraw: "Wycofaj publikację", statusPublished: "Opublikowano", statusPrivate: "Nieopublikowany", editProfile: "Edytuj publiczny profil", subscription: "Zobacz plany", previous: "Poprzednia", next: "Następna", pagination: "Strony Discovery", page: (page, count) => `Strona ${page} z ${count}`,
};
