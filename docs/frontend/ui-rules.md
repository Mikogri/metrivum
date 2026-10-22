# Zasady stylu — gotowy zestaw do nowej aplikacji

Ogólne reguły i wartości, według których zbudowany jest interfejs TrainFlow. Nie opisują
konkretnych komponentów, tylko decyzje, które powtarzają się wszędzie. Kto trzyma się tych
zasad, dostaje aplikację o bardzo podobnym wyglądzie i zachowaniu bez kopiowania kodu.

Charakter w jednym zdaniu: **ciemne, gęste, spokojne narzędzie do pracy** — neutralne szarości,
cienkie półprzezroczyste krawędzie, mało koloru, kolor tylko z sensem, krótkie i miękkie animacje.

---

## 1. Zasady nadrzędne

1. **Wszystko przez tokeny.** Kolor, odstęp, promień, cień, czas i krzywa animacji są zmiennymi
   CSS. Surowa wartość w komponencie to błąd (wyjątki: 1 px krawędzi, 2 px między liniami tekstu).
2. **Głębię robi jasność i krawędź, nie cień.** Każda warstwa jest o jeden stopień jaśniejsza od
   poprzedniej i ma cienką krawędź. Cień tylko dla rzeczy unoszących się nad stroną.
3. **Kolor niesie znaczenie.** Domyślnie wszystko jest szare. Kolor oznacza stan, kategorię albo
   dane — nigdy dekorację. Stan nigdy samym kolorem: zawsze z tekstem albo ikoną.
4. **Hover nigdy nie jest zielony ani niebieski.** Hover to jaśniejszy tekst, mocniejsza krawędź,
   tło o stopień jaśniejsze.
5. **Nic nie skacze.** Elementy zmieniające treść (status zapisu, liczniki) mają stałą szerokość;
   ładowanie nie zmienia rozmiaru przycisku; karty w siatce mają tę samą wysokość.
6. **Gdy treści jest mało, zmienia się układ, nie skala.** Nie pomniejszamy całości — przestawiamy
   panele obok siebie albo zwężamy kolumnę.
7. **Zawsze jakaś treść.** Puste miejsce w karcie, panelu czy liście zastępuje pełne zdanie
   (co to znaczy i co zrobić dalej), a nie kreska.

---

## 2. Kolory

### Powierzchnie (ciemny motyw, neutralne szarości o równych kanałach RGB)

| Rola | Wartość |
|---|---|
| Sidebar, najgłębsza warstwa | `#0e0e0e` |
| Obszar „zapadnięty" (kod, wynik, pasek pod kartą) | `#101010` |
| Tło strony | `#141414` |
| Panel, karta, tabela, modal | `#181818` |
| Element uniesiony (przycisk drugorzędny, chip) | `#1d1d1d` |
| Nakładka (menu, popover, podpowiedź) | `#212121` |
| Pole formularza | biel 6,5% (zawsze **jaśniejsze** od panelu pod nim) |
| Hover tła | biel 5% |
| Zaznaczenie | `rgb(60 60 60 / .5)` |
| Przyciemnienie pod modalem | czerń 60% + rozmycie 6 px |

### Krawędzie — półprzezroczysta biel, więc wyglądają tak samo na każdej warstwie

| Rola | Wartość |
|---|---|
| Subtelna (karty, linie w tabeli, separatory) | biel 7% |
| Zwykła (pola, przyciski, popupy) | biel 10% |
| Mocna (hover, zaznaczony kafelek) | biel 17% |

### Tekst — trzy poziomy, hierarchia kolorem, nie grubością

| Rola | Wartość |
|---|---|
| Treść, tytuły | `#ededed` |
| Opis, wartości drugorzędne | `#a0a0a0` |
| Etykiety, meta, placeholdery | `#8a8a8a` (wciąż 4,5:1 na tle) |
| Wyłączony | `#606060` |

### Kolory znaczeniowe (każdy ma wersję „soft" 12–14% krycia na tła i ramkę ~35%)

| Znaczenie | Kolor |
|---|---|
| Akcent, sukces, dane | `#3ee09a` |
| Ostrzeżenie, „czeka", „niezapisane" | `#f2a93b` |
| Błąd, destrukcja, pilne | `#f0605d` |
| Informacja | `#79a8ff` |
| Kategoria dodatkowa | `#a98bff` |
| Przycisk główny | głęboka zieleń `#235337`, biały tekst, ramka zieleni 24% |

Zasady użycia:
- Główny przycisk jest jeden na widok. Jaskrawa zieleń tylko w małych detalach.
- Kategorie (np. typ oferty) dostają **stały** kolor z palety statusów i używają go wszędzie:
  kafelek ikony, kropka przy nazwie, kolorowy pasek.
- Liczniki w menu: szare dla „do przejrzenia", czerwone tylko dla pieniędzy i pilnych spraw.
  Tło licznika jest **nieprzezroczyste** (kolor zmieszany z tłem paska, nie przezroczystość).
  Zero się nie wyświetla.
- Strony publiczne i logowanie mają własną, ciemniejszą paletę: neutralna czerń, biały przycisk
  główny, zieleń tylko w danych.

---

## 3. Typografia

- Kroje: **bezszeryfowy geometryczny** do interfejsu (Geist), **szeroki display** do dużych
  nagłówków marketingu (Saira), **mono** do kodu, liczb technicznych i etykiet statusu.
- Skala (px): 11 · 12 · **13 (domyślna gęstość aplikacji)** · 14 · 16 · 18 · 22 · 28, powyżej `clamp()`.
- Grubości niskie: 400 zwykły, 450 „medium", **500 to już półgruby**, 600 wyjątkowo.
- Tracking: tytuły `-0.01em`, duże nagłówki `-0.025em`. Interlinia: tytuły 1.2–1.3, tekst 1.5.
- Liczby w tabelach i szczegółach: cyfry tabelaryczne.
- Etykiety sekcji w popupach: 11 px, wersaliki, odstęp liter `0.04em`, kolor trzeciego poziomu.
- Ucinanie: tytuł w jednej linii z wielokropkiem, opis po dwóch liniach, szczegóły w linii wygasają
  maską gradientową przy krawędzi zamiast się łamać.
- `text-wrap: balance` na nagłówkach, `pretty` na akapitach.

---

## 4. Odstępy, wymiary, krawędzie

- Siatka **4 px** z połówkami 2 / 6 / 10 px dla gęstego UI.
- Role odstępów:

| Odstęp | Gdzie |
|---|---|
| 4–6 px | ikona od tekstu, elementy w kontrolce |
| 8 px | kontrolki w pasku, przyciski obok siebie, karty w siatce, etykieta od pola |
| 12 px | ikona/awatar od tytułu, nagłówek karty od treści |
| 16 px | padding karty i panelu, pola w formularzu, pasek filtrów od listy |
| 20 px | sekcje strony, padding modala, nagłówek strony od treści |
| 24 / 64 px | górny / dolny padding strony |

- Odstęp należy do rodzica (`gap`), nie do dziecka. Dwa kontenery z własnym `gap` nie zagnieżdżają
  się — pasek filtrów stoi **przed** kontenerem listy.
- Wysokości kontrolek: **28 / 32 / 40 px** (sm / md / lg). Wszystko w jednym rzędzie ma tę samą.
- Promienie rosną z rozmiarem: 3–4 px drobiazgi i małe przyciski · **5 px kontrolki** · 6 px panele,
  tabele, podpowiedzi · **8 px karty, modale** · pełne zaokrąglenie dla plakietek i liczników.
- Krawędź zawsze 1 px. Grubsze tylko jako znacznik (pasek koloru 3 px, obrys fokusu 2 px).
- Cienie: ciemne, krótkie, zawsze w parze z hairline; menu dostaje cień „przyciemniający brzegi".

---

## 5. Układ

- Powłoka: sidebar 250 px (zwijany do 64 px, w zwiniętym stanie nazwy w podpowiedziach), pasek
  aplikacji 52 px, treść przewijana osobno, maks. szerokość 90rem.
- Kolejność na każdej stronie listy: **nagłówek → pasek filtrów → lista → paginacja**.
- Nagłówek strony: tytuł 22 px / 500, opis 13 px szary (maks. 48rem), akcje po prawej; status
  obiektu obok tytułu, nie w osobnym rzędzie; żadnych separatorów, które nic nie oddzielają.
- Szczegóły: panele obok siebie (`auto-fit, minmax(18rem, 1fr)`) albo kolumna główna + boczna
  (`1fr` + `17–22rem`, boczna przyklejona przy przewijaniu).
- Formularz do wypełnienia: kolumna ok. 38rem + boczna z kontekstem (terminy, postęp, „co dalej"),
  wyrównane do lewej.
- Pasek narzędzi edytora mieści się w **jednym wierszu**: najpierw ustępuje nazwa (wielokropek),
  potem pola pomocnicze; rzadkie akcje są ikonami z podpowiedzią. Zawijanie dopiero na wąskim oknie.
- Progi: poniżej ~60rem dwie kolumny składają się w jedną, poniżej ~48rem tabele chowają kolumny
  drugorzędne, na telefonie modale stają się arkuszami od dołu.

---

## 6. Kontrolki

**Przyciski**
- Warianty: główny (jeden na widok), drugorzędny (uniesione tło + krawędź — domyślny), ghost
  (tylko tekst, tło na hover), destrukcyjny i destrukcyjny-ghost, „sukces" tylko do potwierdzenia
  pozytywnej decyzji w modalu.
- Padding poziomy 12 px (sm 10, lg 16), ikona + tekst z odstępem 6 px, ikona ok. 1em.
- Naciśnięcie `scale(.97)`; wyłączony 45% krycia; ładowanie — treść znika z lekkim rozmyciem,
  spinner na środku, szerokość bez zmian.
- Akcje tekstowe w kartach: sam tekst bez paddingu, hover tylko rozjaśnia.
- Kontrolki powiązane (np. wybór klienta + liczba przypisanych) łączy się w **jedną ramkę**
  z wewnętrzną linią podziału.

**Pola**
- Etykieta nad polem (13 px / 450), podpowiedź pod etykietą (12 px szara), błąd pod polem (12 px,
  czerwony, z ikoną). Wymagane: szara gwiazdka.
- Każde pole ma placeholder z przykładem. Pole wielowierszowe rośnie z treścią, bez paska.
- Autouzupełnianie przeglądarki nie zmienia tła pola. Walidacja po próbie wysłania.
- „Lekkie" pola w paskach (wybór kontekstu, wyszukiwanie w nagłówku) mogą nie mieć ramki
  do momentu najechania lub fokusu i mają ikonę przed tekstem.

**Pasek filtrów:** wyszukiwarka → filtry → sortowanie → odstęp → przełącznik lista/karty →
główna akcja; jeden rząd, odstęp 8 px; stan w adresie URL; zmiana filtra wraca na stronę 1.
Pusty wynik po filtrze ma inny komunikat niż pusta lista.

**Plakietki statusu:** pigułka 22 px (mała 18 px), tekst 12 / 11 px, kropka 6 px, tło „soft",
ramka w kolorze statusu. Przy tytule jest małym znacznikiem (~84% skali), w linii szczegółów
zamiast plakietki — samo kolorowe słowo.

**Znaczniki-ikony:** mały kwadrat z tłem i krawędzią (18 px, promień 4 px) z jednym znakiem lub
ikoną. Ten sam znacznik wszędzie dla tej samej idei; stan zmienia jego kolor (szary → zielony →
pomarańczowy „czeka na dane"), nie kształt.

**Podpowiedzi:** własne, nie systemowe `title`. Półprzezroczyste tło z rozmyciem (~14 px), bez
strzałki, promień 6 px, 12 px tekst. Pojawiają się po 150–500 ms; przy zwiniętym menu stoją po
prawej stronie ikony.

---

## 7. Panele, karty, listy

**Panel:** krawędź subtelna, promień 6 px, nagłówek o stałej wysokości ~52 px z hairline (kafelek
ikony 28 px, tytuł 13 px / 500, opis 12 px, akcje po prawej), treść z paddingiem 16 px.
Stopka z akcjami jest stała i nieprzezroczysta; treść przewija się nad nią.

**Karta listy**
- Wszystkie karty w siatce **mają tę samą wysokość**; siatka `auto-fill, minmax(17rem, 1fr)`,
  odstęp 8 px.
- Trzy strefy: **nagłówek** (jeden rząd wyśrodkowany na ikonie/awatarze 36 px: tytuł 14 px / 500
  nad podtytułem 12 px, status po prawej) → **opis** (zawsze zdanie, do 2 linii, 13 px) →
  **stopka** pod hairline (szczegóły w jednej linii rozdzielone „·", akcje, strzałka otwarcia
  w prawym dolnym rogu).
- Cała karta jest linkiem; akcje leżą nad nim. Hover: mocniejsza krawędź, jaśniejsze tło,
  strzałka jaśnieje i przesuwa się o 2 px.
- Przynależność do grup: krótki kolorowy pasek przy lewej krawędzi (segment na grupę), nazwy
  w podpowiedzi.

**Tabela:** nagłówek 36 px (12 px szary, nie pogrubiony), wiersz 44 px, padding 12 px, hairline
między wierszami, bez zebry; pierwsza kolumna to link, cały wiersz klikalny; brak wartości „—".
Te same dane mają widok listy i kart.

---

## 8. Okna, popupy, powiadomienia

- **Modal wyśrodkowany:** szerokości 26 / 34 / 46 / 64rem, nagłówek 56 px (tytuł 16 px / 500 +
  opis), treść 20 px, stopka z przyciskami po prawej (anuluj, potem akcja główna).
- **Panel boczny** dla większych formularzy i edycji szczegółów: pełna wysokość z prawej, ok. 40rem.
  Tytuł mówi, **co** edytujesz i **gdzie** („Formuła · Load"), opis — co tu zrobić.
- Treść osadzona w panelu nie ma własnej ramki popupu — wygląda jak strona.
- **Potwierdzenie** zawsze w modalu z ikoną w kafelku 36 px; przycisk w kolorze skutku (czerwony
  — usuń/odrzuć, zielony — zaakceptuj); tytuł to pytanie, przyciski nazywają czynność i to, co
  zostaje. Pole potrzebne tylko jednej akcji (np. powód odrzucenia) jest w jej modalu.
- **Popupy kontekstowe** (podpowiedzi formuł, menu komórki): nakładka z krawędzią, promień 6 px,
  na górze tytuł z ikoną i przyciski rozwiń/zamknij, grupy z nagłówkami w wersalikach, pasek
  skrótów klawiszowych (`↑ ↓ Enter Esc`) na dole, akcje w stopce za hairline.
- **Pasek stanu** w popupie: jedno zdanie na tle „soft" — pomarańczowe, gdy czegoś brakuje,
  zielone, gdy wszystko gotowe.
- **Toast:** prawy górny róg, do 24rem szerokości, znika sam, potwierdza wykonaną akcję.
- Rzeczy nieodwracalne blokuje reguła, a UI mówi dlaczego (np. „klienci byli na tej ofercie,
  można ją tylko zarchiwizować").

---

## 9. Animacje

- Krzywe: `cubic-bezier(.23, 1, .32, 1)` domyślna · `(.25, .8, .3, 1)` treść po załadowaniu ·
  `(.32, .72, 0, 1)` modale i panele · `(.77, 0, .175, 1)` ruch w obie strony.
- Czasy: **140 ms** naciśnięcie · **160 ms** hover/kolor · **200 ms** ruch elementu, popup ·
  **260 ms** chowanie panelu bocznego · 360 ms wejście modala · **560 ms** wejście treści.
- Wejście treści: krycie 0 → 1 z przesunięciem 3 px (opcjonalnie rozmycie 2 px). Wiersze kaskadą
  co 28 ms, najwyżej 10 kroków. Popup: krycie + przesunięcie −4 px + skala .96.
- **Każde okno ma animację chowania**, także takie, które aplikacja usuwa od razu po zamknięciu
  (na chwilę zostaje jego nieklikalna kopia). Chowanie jest krótsze od wejścia.
- Wykresy animują się przy każdej zmianie danych (interpolacja wartości).
- Znacznik wymagający uwagi może pulsować najwyżej 2 razy, potem stoi.
- Animujemy tylko `transform`, `opacity`, kolor i krawędź — nigdy rozmiar układu.
- Ruch na hover tylko dla myszy (`hover: hover` i `pointer: fine`). Przy ograniczeniu ruchu
  animacje wejścia i chowania znikają, naciśnięcie trwa 0 ms.
- Odświeżanie w tle: lista przygasa do 60% zamiast migać szkieletem.

---

## 10. Stany, treść, dostępność

- Każda lista ma cztery stany: ładowanie, błąd z „Spróbuj ponownie", pusta (tytuł + zdanie +
  akcja), dane. Żadnych zmyślonych danych zamiast API.
- Teksty krótkie i konkretne; przycisk mówi, co zrobi („Wypełnij formularz", „Usuń ofertę").
- Daty w formacie średnim („Oct 9, 2026"); dla rzeczy czekających czas względny
  (dni → miesiące → lata).
- Zapis: stan („Niezapisane", „Zapisywanie…", „Zapisano") stoi przy nazwie, w kolorze stanu,
  ze stałą szerokością.
- Fokus zawsze widoczny: obrys 2 px w kolorze akcentu z odstępem 2 px.
- Wskaźnik uwagi (czerwona kropka 8 px z poświatą) tylko przy jednym kroku, na który użytkownik
  czeka.
- Wieloetapowe formularze: „Krok 2 z 3" i krótkie paski postępu.

---

## 11. Minimalny zestaw tokenów do skopiowania

```css
:root {
  color-scheme: dark;
  --bg: #141414; --bg-sunken: #101010; --sidebar: #0e0e0e;
  --surface: #181818; --surface-raised: #1d1d1d; --surface-overlay: #212121;
  --field: rgb(255 255 255 / .065); --hover: rgb(255 255 255 / .05);
  --border-subtle: rgb(255 255 255 / .07); --border: rgb(255 255 255 / .1); --border-strong: rgb(255 255 255 / .17);
  --text: #ededed; --text-2: #a0a0a0; --text-3: #8a8a8a; --text-disabled: #606060;
  --primary: #235337; --accent: #3ee09a; --warning: #f2a93b; --danger: #f0605d; --info: #79a8ff; --violet: #a98bff;
  --text-xs: .75rem; --text-sm: .8125rem; --text-md: .875rem; --text-lg: 1rem; --text-2xl: 1.375rem;
  --weight-medium: 450; --weight-semibold: 500;
  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-5: 1.25rem; --space-6: 1.5rem;
  --control-sm: 1.75rem; --control-md: 2rem; --control-lg: 2.5rem;
  --radius-sm: 4px; --radius-md: 5px; --radius-lg: 6px; --radius-xl: 8px; --radius-full: 999px;
  --ease-out: cubic-bezier(.23, 1, .32, 1); --ease-settle: cubic-bezier(.25, .8, .3, 1); --ease-drawer: cubic-bezier(.32, .72, 0, 1);
  --dur-press: 140ms; --dur-fast: 160ms; --dur-base: 200ms; --dur-settle: 560ms;
}
```

Pełny zestaw z tego projektu: `packages/ui-web/src/tokens/tokens.css`.

---

# Część II — szczegóły

## 12. Ikony

**Zestaw:** jeden zestaw liniowych ikon (Lucide). Obrys **1.5 px** w nawigacji, pustych stanach
i dużych ikonach dialogów; domyślny 2 px w małych ikonach przycisków. Końcówki i łączenia
zaokrąglone. Ikony nigdy nie są wypełnione — wypełnienie dostaje dopiero kafelek, w którym leżą.

**Rozmiar ikony zależy od kontekstu:**

| Kontekst | Ikona | Uwagi |
|---|---|---|
| Plakietka, `kbd` | 12 px | kropka statusu 6 px |
| Mały przycisk (28 px), checkbox | 14 px | ptaszek w checkboxie 12 px, obrys 3 |
| Przycisk / przycisk-ikona (32 px), toast, alert | 16 px | w przycisku z tekstem ikona = 1em |
| Menu, select, zakładki, chevron | 15 px | chevron obraca się o 180° po otwarciu |
| Nawigacja boczna | 17 px | obrys 1.5 |
| Kafelek ikony w karcie (36 px) | 17 px | tło „soft" w kolorze kategorii |
| Kafelek ikony w panelu (28 px) | 15 px | |
| Pusty stan | 22 px | obrys 1.5, mały wariant 18 px |
| Ikona w dialogu potwierdzenia | 20 px | w kafelku 36 px |

**Kafelek ikony** (karta, panel, toast, dialog): kwadrat 28 / 36 px, promień 5–6 px, tło
w kolorze znaczenia z 12–16% krycia, ikona w pełnym kolorze. Neutralny kafelek: tło nakładki
`#212121`, ikona w kolorze drugiego poziomu tekstu.

**Znacznik-symbol** (np. „ƒ" formuły): kwadrat 18 px (mały 15, duży 28), promień 4 px, tło
uniesione + krawędź 10%, znak kursywą 12 px półgruby. Stan zmienia tylko kolor: szary → zielony
(gotowe) → pomarańczowy (czeka na dane).

**Ikona przed tekstem** ma `flex-shrink: 0` i jest wyrównana do środka linii (w listach z opisem —
do pierwszej linii, `margin-top: 1–2px`). Ikona dekoracyjna ma `aria-hidden`; przycisk z samą
ikoną ma etykietę i podpowiedź.

---

## 13. Budowa komponentów (anatomia i wartości)

Wspólny przepis dla każdego elementu:
1. **Wysokość** z tokenu kontrolki (28 / 32 / 40), nie z paddingu pionowego.
2. **Padding poziomy** z siatki (8 / 10 / 12 / 16).
3. **Krawędź 1 px zawsze obecna** (przezroczysta, gdy niewidoczna) — zmiana stanu nie przesuwa treści.
4. **Stany** przez atrybuty (`data-hovered`, `data-pressed`, `data-selected`, `data-focus-visible`,
   `data-disabled`), nie przez ręcznie dodawane klasy.
5. **Przejścia** tylko dla koloru, tła, krawędzi i `transform`.
6. **Tekst** ucinany w środku (`min-width: 0` na każdym elemencie flex z tekstem).

### Przycisk
- Wysokość 32 px (sm 28, lg 40), padding 0 12 px (sm 10, lg 16), promień 5 px (sm 4).
- Tekst 13 px / 450 (sm 12, lg 14), odstęp ikona–tekst 6 px, bez zawijania, z wielokropkiem.
- Naciśnięcie `scale(.97)` w 140 ms; fokus — obrys 2 px z odstępem 2 px; wyłączony — 45% krycia.
- Ładowanie: treść `opacity: 0` + `blur(2px)`, spinner absolutnie na środku.
- Hover: główny → jaśniejsza zieleń i mocniejsza ramka; drugorzędny → tło hover i ramka 17%;
  ghost → tło 5% i tekst pierwszego poziomu.

### Przycisk z samą ikoną
- Kwadrat 32 px (sm 28), ikona 16 px (sm 14), domyślnie bez tła, kolor drugiego poziomu.
- Naciśnięcie `scale(.94)`, wyłączony 40%. Zawsze z podpowiedzią po najechaniu.

### Pole tekstowe, select, combobox
- Kontener pola to siatka z odstępem 8 px: etykieta, podpowiedź (12 px, −4 px do etykiety),
  kontrolka, błąd.
- Kontrolka: 32 px, padding 0 10 px, ramka 10%, promień 5 px, tło biel 6,5%, tekst 13 px.
- Fokus: ramka w kolorze akcentu, bez poświaty. Błąd: ramka czerwona + komunikat z ikoną.
- Select: wartość z wielokropkiem, chevron 15 px w kolorze trzeciego poziomu, obrót 180° po
  otwarciu; otwarty trigger dostaje mocniejszą ramkę.
- Lista opcji: padding 4 px, opcja min. 32 px, padding 4 × 8 px, promień 4 px, fokus = tło hover,
  zaznaczona opcja ma zielony ptaszek 15 px po prawej, maks. wysokość 15rem.
- Liczby: lokalne parsowanie (2,5 po polsku = 2.5), jednostka jako przyrostek wewnątrz pola.

### Checkbox, radio, przełącznik, segmenty
- Checkbox i radio: 16 px, ramka 17%, tło zapadnięte; zaznaczony = tło akcentu, ptaszek ciemny;
  naciśnięcie `scale(.92)`; kropka radia rośnie od 0.5 do 1 w 200 ms.
- Przełącznik: tor 32 × 18 px, gałka 14 px z cieniem; włączony = tor akcentu, biała gałka,
  przesunięcie 14 px w 200 ms; przy naciśnięciu gałka wydłuża się o 1 px.
- Segmenty: obudowa z paddingiem 2 px, ramka 10%, tło zapadnięte, promień 5 px. Segment ma
  wysokość kontrolki − 6 px, padding 0 10 px, tekst 13 px / 450. Wybrany: tło nakładki,
  ramka 17%, tekst pierwszego poziomu.

### Plakietka i licznik
- Plakietka: 22 px (sm 18), padding 0 8 px (sm 6), pigułka, tekst 12 / 11 px / 450, kropka 6 px.
- Licznik (menu, zakładki): min. 18 × 18 px, padding 0 4 px, pigułka, tekst 10–11 px, cyfry
  tabelaryczne, tło nieprzezroczyste.

### Awatar
- 24 / 32 / 44 px, koło, inicjały półgrube. Kolor z odcienia wyliczonego z nazwy:
  tło `hsl(h 32% 22%)`, wewnętrzna obwódka `hsl(h 40% 34%)`, litery `hsl(h 60% 82%)`.
- W karcie awatar ma dokładnie rozmiar kafelka ikony (36 px).

### Pozycja w nawigacji bocznej
- Wysokość 34 px; padding poziomy dobrany tak, by po zwinięciu ikona stała na środku kwadratu
  ((34 − 17) / 2); odstęp ikona–tekst 10 px; promień 5 px.
- Tekst 13 px / 450 w bieli 60%. Aktywna pozycja ma tło zaznaczenia i tekst pierwszego poziomu;
  zmienia się tylko kolor (120 ms), zaznaczenie nie przesuwa się między pozycjami.
- Licznik przy prawej krawędzi; po zwinięciu przyklejony do rogu ikony, z obwódką w kolorze paska.

### Zakładki
- Zakładka 32 px, padding 0 12 px, tekst 13 px / 450 w kolorze drugiego poziomu, wybrana —
  pierwszy poziom. Wskaźnik (podkreślenie) przesuwa się między zakładkami w 280 ms.
- Lista przewija się poziomo bez widocznego paska.

### Menu i popover
- Popover: min. 10rem (warianty 16 / 22 / 28rem), ramka 10%, promień 6 px, tło uniesione, cień
  menu, maks. 28rem wysokości z przewijaniem.
- Menu: padding 4 px, pozycja min. 32 px, padding 4 × 8 px, ikona 15 px w kolorze drugiego
  poziomu, skrót klawiszowy po prawej (12 px, trzeci poziom), separator 1 px na całą szerokość.
- Pozycja destrukcyjna: czerwony tekst i ikona, fokus = czerwone tło „soft".
- Nagłówek sekcji: 11 px / 450, trzeci poziom.

### Karta i panel
- Karta ogólna: ramka 10%, promień 6 px, padding 12 / 16 / 24 px. Wariant „akcent" ma
  zielonkawą ramkę i delikatny gradient zieleni 8% od góry.
- Panel: nagłówek ≥ 52 px, padding 12 × 16 px, hairline pod spodem; treść 16 px z odstępem 16 px.
- Karta listy: zob. §7 (stała wysokość ~156 px, trzy strefy, strzałka w rogu).

### Alert (komunikat w treści)
- Padding 12 × 16 px, ramka 10% (w kolorze tonu ~30%), promień 6 px, tło uniesione.
- Ikona 16 px w kolorze tonu przy pierwszej linii; tytuł 13 px / 450, treść 13 px drugiego poziomu.
- Akcje po prawej, na wąskim ekranie pod tekstem.

### Toast
- Prawy górny róg, 16 px od krawędzi, szerokość do 24rem, odstęp między toastami 8 px.
- Min. 52 px wysokości, padding 8 px (lewy 12), ramka 17%, promień 6 px, tło nakładki, duży cień.
- Pasek 3 px w kolorze tonu przy lewej krawędzi + kafelek ikony 28 px z ikoną 16 px.

### Pusty stan
- Wyśrodkowany, padding 48 × 24 px, **przerywana** ramka 17%, promień 6 px, tło panelu 55%.
- Ikona 22 px (obrys 1.5) → tytuł 14 px / 500 → opis 13 px (maks. 28rem) → akcje z odstępem 12 px.
- Mały wariant (w panelu): bez ramki i tła, padding 24 × 16 px.

### Ładowanie
- Szkielet: gradient tła uniesionego i hover, przesuwany liniowo w 1.6 s, promień jak element.
- Spinner: 14 / 18 / 28 px, okrąg 20% krycia + łuk, obrót 640 ms (przy ograniczeniu ruchu 1.6 s).
- Odświeżanie w tle: lista ma 60% krycia, bez szkieletu.

### Klawisz (`kbd`)
- Min. 20 × 20 px, padding 0 4 px, ramka 17% z **grubszą dolną krawędzią (2 px)**, promień 3 px,
  tło uniesione, tekst 11 px / 450.

### Podpowiedź (tooltip)
- Padding 6 × 10 px, ramka 10%, promień 6 px, tło nakładki 62% + `backdrop-filter: blur(14px)
  saturate(1.4)`, średni cień, tekst 12 px / 450, maks. 16rem, bez strzałki.
- Bez obsługi rozmycia w przeglądarce — tło pełne.

### Popup kontekstowy (np. dane komórki)
- Nagłówek: tytuł 13 px / 500 z małym znacznikiem, przyciski „rozwiń" i „zamknij" 24 px po prawej.
- Pod nim kod lub wyrażenie w zapadniętym polu (mono 12 px) i pasek stanu (tło „soft", ikona 14 px).
- Każde wejście w osobnej ramce 7% (pomarańczowa ~30%, gdy brakuje danych): nazwa + jednostka
  w chipie mono + stan po prawej (11 px w kolorze stanu); pod spodem źródło i wartość obok siebie.
- Stopka za hairline: akcje drugorzędne (ghost z ikoną 14 px) po lewej, „Anuluj" i „Zapisz" po
  prawej, przyciski 28 px.
- Ten sam popup otwarty w panelu bocznym traci ramkę i cień, a odstępy rosną.

---

## 14. Animacje — katalog

| Element | Wejście | Wyjście | Uwagi |
|---|---|---|---|
| Strona po nawigacji | 560 ms, krzywa settle: krycie 0→1, `blur(2px)`→0, `translateY(3px)`→0 | — | |
| Tabela | jak strona; wiersze: krycie 0→1 w 480 ms, opóźnienie 80 ms + 28 ms × indeks (maks. 10) | — | |
| Pusty stan, karta wyniku | 560 ms settle, `translateY(4px)` | — | |
| Modal | 360 ms krzywa drawer, wjazd od dołu | 200 ms `(.4, 0, 1, 1)` | tło: rozmycie i przyciemnienie w 200 ms |
| Panel boczny | 220 ms drawer, `translateX(100%)`→0 | 260 ms `(.4, 0, .8, .6)`, tło gaśnie razem | |
| Arkusz na telefonie | 240 ms drawer od dołu | 160 ms | |
| Popover, menu, select | 200 ms ease-out: krycie 0, przesunięcie 4 px od strony wyzwalacza, `scale(.96)` | 140 ms do `scale(.98)` i krycia 0 | `transform-origin` przy wyzwalaczu |
| Popup kontekstowy | 200 ms: `translateY(-4px) scale(.96)` | — | origin w lewym górnym rogu |
| Podpowiedź | 125 ms `scale(.97)` + krycie | 100 ms odwrotnie | origin od strony elementu |
| Toast | 180 ms ease-out z `translateY(-12px)` | 200 ms `translateY(-8px) scale(.98)` | |
| Rozwijana sekcja | treść 200 ms `translateY(-3px)` + krycie; chevron obrót 180° w 200 ms | — | |
| Przycisk | naciśnięcie `scale(.97)` w 140 ms | — | przycisk-ikona `.94`, checkbox `.92` |
| Przełącznik | gałka 200 ms ease-out | — | rozciąga się przy naciśnięciu |
| Zakładki | wskaźnik przesuwa się i zmienia szerokość w 280 ms | — | |
| Hover kolorów | 120–160 ms `ease` | — | strzałka karty `translate(2px, -2px)` w 200 ms |
| Wykres | interpolacja wartości przy każdej zmianie danych | — | linie przez `transition: d` |
| Znacznik uwagi | pulsowanie obwódki 2.4 s, 2 razy | — | potem nieruchomy |
| Spinner | 640 ms liniowo, bez końca | — | |

Zasady:
- **Wejście trwa dłużej niż wyjście** (ok. 1.3–1.8×). Wyjście przyspiesza (ease-in), wejście
  zwalnia pod koniec.
- Przesunięcia są małe: **2–4 px** dla elementów, 12 px dla toastów, 100% tylko dla paneli.
- Skala nigdy poniżej `.94` i nigdy powyżej `1`.
- Nic nie odbija się (sprężynę tylko wyjątkowo), nic się nie obraca poza chevronem i spinnerem.
- Okno, które aplikacja usuwa natychmiast, i tak się chowa (na czas animacji zostaje jego
  nieklikalna kopia).
- `prefers-reduced-motion`: znikają przesunięcia, skalowanie i wejścia treści; zostaje samo krycie
  (popover, podpowiedź) albo nic; spinner zwalnia.

---

## 15. Lista kontrolna nowego komponentu

- [ ] Wysokość z tokenu kontrolki, padding z siatki 4 px, krawędź 1 px zawsze obecna.
- [ ] Kolory tylko z tokenów; hover jaśniejszy, nie kolorowy.
- [ ] Ikona we właściwym rozmiarze z tabeli w §12, z `aria-hidden`, nie kurczy się.
- [ ] Stany: hover, naciśnięcie, fokus (obrys 2 px), wyłączony, ładowanie, błąd.
- [ ] Tekst ucinany; cyfry tabelaryczne tam, gdzie są liczby.
- [ ] Wejście i wyjście zgodne z katalogiem w §14, z wariantem dla ograniczonego ruchu.
- [ ] Pusty stan i stan błędu mają zdanie i akcję.
- [ ] Na telefonie (< 768 px): cele dotyku min. 44 px, okna jako arkusze od dołu.
