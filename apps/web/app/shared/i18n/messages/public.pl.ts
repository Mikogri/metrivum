import type { PublicMessages } from "./public.en";

// Treści witryny publicznej (PL). Muszą odpowiadać temu, co API faktycznie robi.
export const publicPl: PublicMessages = {
  common: {
    brand: "Metrivum",
    skipToContent: "Przejdź do treści",
    illustrativePreview: "Podgląd poglądowy",
    illustrativePreviewNote:
      "Przykładowe dane narysowane na potrzeby strony, nie prawdziwe konto.",
    languageLabel: "Język",
    languageNames: { en: "English", pl: "Polski" },
    learnMore: "Dowiedz się więcej",
  },
  nav: {
    primary: "Główna nawigacja",
    home: "Strona główna Metrivum",
    features: "Funkcje",
    programBuilder: "Kreator programów",
    videoAnalysis: "Analiza wideo",
    pricing: "Cennik",
    signIn: "Zaloguj się",
    getStarted: "Załóż konto",
    openApp: "Otwórz Metrivum",
    openMenu: "Otwórz menu",
    closeMenu: "Zamknij menu",
    accountMenu: (email: string) => `Menu konta ${email}`,
    accounts: "Zalogowane konta",
    signOut: "Wyloguj",
    signOutTitle: "Wyloguj",
    signOutChoose:
      "Wybierz konto, z którego chcesz się wylogować. Pozostałe konta zostaną zalogowane.",
    signOutOf: (email: string) => `Wyloguj z ${email}`,
    inUse: "W użyciu",
    cancel: "Anuluj",
  },
  footer: {
    tagline:
      "Przestrzeń robocza dla trenerów, którzy piszą programy treningowe.",
    product: "Produkt",
    account: "Konto",
    register: "Załóż konto",
    signIn: "Zaloguj się",
    legalPending:
      "Polityka prywatności i regulamin zostaną opublikowane tutaj przed otwarciem publicznej rejestracji.",
    copyright: (year: number) => `© ${year} Metrivum`,
  },
  home: {
    meta: {
      title: "Metrivum — arkusz treningowy zbudowany od nowa dla trenerów",
      description:
        "Buduj programy z bloków, cykli i dni, zapisuj serie z zakresami, %1RM, RPE i formułami, eksportuj CSV lub PDF. Analiza nagrań liftów w tym samym miejscu.",
    },
    hero: {
      title: "Arkusz treningowy zbudowany od nowa dla trenerów",
      lead: "Buduj programy z bloków, cykli i dni. Zapisuj każdą serię zakresem, %1RM, RPE albo formułą, trzymaj szablony w folderach i eksportuj wynik do CSV lub PDF.",
      primary: "Załóż konto",
      secondary: "Zaloguj się",
      openApp: "Otwórz Metrivum",
      tertiary: "Zobacz kreator programów",
      badge: "8 typów serii / formuły / csv + pdf",
    },
    sheet: {
      program: "Blok siłowy A",
      cycle: "Cykl 1 · 10 dni",
      day: "Dzień 3",
      workout: "Dół ciała",
      columns: {
        exercise: "Ćwiczenie",
        set: "Seria",
        reps: "Powt.",
        load: "Obciążenie",
        effort: "Wysiłek",
        rest: "Przerwa",
      },
      rows: [
        {
          exercise: "Przysiad tylny",
          set: "Seria szczytowa",
          reps: "3",
          load: "85% · 1RM",
          effort: "RPE 8",
          rest: "4 min",
        },
        {
          exercise: "Przysiad tylny",
          set: "Back-off",
          reps: "5",
          load: "−10%",
          effort: "RPE 7",
          rest: "3 min",
        },
        {
          exercise: "Martwy ciąg rumuński",
          set: "Rampa",
          reps: "8–10",
          load: "60 → 80 kg",
          effort: "RIR 2",
          rest: "2 min",
        },
        {
          exercise: "Przysiad wykroczny",
          set: "Standard",
          reps: "10",
          load: "24 kg",
          effort: "RIR 3",
          rest: "90 s",
        },
        {
          exercise: "Deska kopenhaska",
          set: "Klaster",
          reps: "4×20 s",
          load: "—",
          effort: "—",
          rest: "60 s",
        },
      ],
      formula: "base1Rm × percentage",
      formulaResult: "140 kg × 0,85 = 119 kg",
      saved: "Szkic zapisany",
      tools: {
        sheet: "Arkusz",
        formulas: "Formuły",
        copy: "Kopiuj",
        history: "Historia",
      },
      recentTitle: "Ostatnie zmiany",
      recent: [
        { what: "przysiad / seria szczytowa", value: "85% 1rm", when: "teraz" },
        {
          what: "martwy ciąg rumuński / rampa",
          value: "60 → 80 kg",
          when: "2 min",
        },
        { what: "cykl 1 / długość", value: "10 dni", when: "6 min" },
      ],
    },
    cycles: {
      title: "Cykle dopasowane do planu, nie do kalendarza",
      body: "Cykl może trwać 7, 9 albo 10 dni — od 1 do 366. Dni treningowe są numerowane wewnątrz cyklu, więc sesje trafiają dokładnie tam, gdzie je ustawisz.",
      legendTraining: "Dzień treningowy",
      legendRest: "Dzień wolny",
      dayLabel: (n: number) => `Dzień ${n}`,
      cycleLabel: (n: number, days: number) => `Cykl ${n} — ${days} dni`,
    },
    sets: {
      title: "Każda seria ma swój typ",
      body: "Standard, AMRAP, serie szczytowe z back-offami, rampy, drop sety, rest-pause i klastry. Segmenty i powiązania są zapisane jako dane, więc back-off zawsze wie, po której serii szczytowej następuje.",
      kinds: {
        Standard: "Standard",
        Amrap: "AMRAP",
        TopSet: "Seria szczytowa",
        BackOff: "Back-off",
        Ramp: "Rampa",
        DropSet: "Drop set",
        RestPause: "Rest-pause",
        Cluster: "Klaster",
      },
      kindNotes: {
        Standard: "Stałe lub zakresowe powtórzenia i obciążenie",
        Amrap: "Maksymalna liczba powtórzeń, bez zakresu",
        TopSet: "Najcięższa seria ćwiczenia",
        BackOff: "Powiązana z wcześniejszą serią szczytową",
        Ramp: "2–20 segmentów z rosnącym ciężarem",
        DropSet: "Spadek ciężaru między segmentami",
        RestPause: "Krótkie pauzy w jednej serii",
        Cluster: "Przerwy między mini-seriami",
      },
      groupsTitle: "Superserie i obwody",
      groupsBody:
        "Połącz dwa ćwiczenia w superserię albo kilka w obwód z liczbą rund i przerwą.",
    },
    formulas: {
      title: "Obciążenia, które liczą się same",
      body: "Korzystaj z wbudowanych formuł, takich jak procent 1RM, albo pisz własne z typowanymi jednostkami. Serwer liczy każdą formułę w przypiętej wersji, więc opublikowany program nie zmienia się bez Twojej wiedzy.",
      builtIns: "Wbudowane formuły",
      builtInNames: [
        "Procent 1RM",
        "Poprzedni cykl + przyrost",
        "Seria szczytowa → back-off",
      ],
      inputs: "Wejścia",
      result: "Wynik",
    },
    library: {
      title: "Jedna baza ćwiczeń dla wszystkich programów",
      body: "Przeszukuj wspólny katalog po tagach, mięśniach głównych i pomocniczych oraz wzorcach ruchowych, a ulubione miej pod ręką. Ćwiczenia wycofane z katalogu pozostają czytelne w programach, które już ich używają.",
      searchPlaceholder: "Szukaj ćwiczeń",
      filters: ["Zawias biodrowy", "Czworogłowe", "Jednostronne", "Ulubione"],
      items: [
        { name: "Martwy ciąg rumuński", meta: "Zawias · Dwugłowe, pośladkowe" },
        {
          name: "Przysiad bułgarski",
          meta: "Przysiad · Czworogłowe, pośladkowe",
        },
        { name: "Hip thrust jednonóż", meta: "Zawias · Pośladkowe" },
        { name: "Nordic curl", meta: "Zginanie kolana · Dwugłowe" },
      ],
    },
    folders: {
      title: "Foldery, szablony i niezależne kopie",
      body: "Porządkuj programy i prywatne szablony w zagnieżdżonych folderach. Zacznij program od szablonu i dostań pełną kopię — jej edycja nigdy nie zmienia oryginału.",
      tree: [
        "Okres przygotowawczy",
        "Hipertrofia",
        "Szablony",
        "Siła 10-dniowa",
      ],
      copyAction: "Użyj szablonu",
      copied: "Utworzono niezależną kopię",
    },
    transfer: {
      title: "Arkusze na wejściu, czyste pliki na wyjściu",
      body: "Zaimportuj CSV, dopasuj wiersze do ćwiczeń z katalogu, zwaliduj i zatwierdź. Eksportuj opublikowaną rewizję — albo pojedynczy blok, cykl lub trening — do CSV lub PDF generowanego na serwerze.",
      importLabel: "Import",
      exportLabel: "Eksport",
      steps: ["Podgląd", "Dopasowanie ćwiczeń", "Walidacja", "Zatwierdzenie"],
      revisionMeta: "Rewizja 3",
      sourceMeta: "UTF-8 · 3 KB",
      files: {
        csvIn: "blok-wiosna.csv",
        pdfOut: "blok-silowy-a-r3.pdf",
        csvOut: "blok-silowy-a-r3.csv",
      },
      hub: { rows: "38 wierszy dopasowanych", check: "0 błędów" },
      sheet: {
        columns: ["Ćwiczenie", "Serie", "Powt.", "Obciąż."],
        rows: [
          ["Przysiad", "4", "5", "80%"],
          ["RDL", "3", "8", "60 kg"],
          ["Wykroki", "3", "10", "24 kg"],
          ["Deska", "3", "45 s", "—"],
        ],
      },
      mapping: {
        title: "Dopasowane do katalogu",
        pairs: [
          ["RDL", "Martwy ciąg rumuński"],
          ["Wykroki", "Przysiad bułgarski"],
        ],
      },
      pdfTitle: "Blok siłowy A",
      pdfMeta: "Cykl 1 · Dzień 3",
      outputs: "Pliki z rewizji 3",
    },
    video: {
      title: "Analiza liftów obok programu",
      body: "Prześlij nagranie do prywatnej biblioteki, uruchom analizę i śledź jej status. Gdy podłączony jest analizator, dostajesz powtórzenia, czasy faz i tor ruchu sztangi, a dwa lifty możesz porównać obok siebie.",
      honesty:
        "Pomiary pochodzą z usługi analizatora podłączonej do Twojego wdrożenia Metrivum. Dopóki nie jest podłączona, nowe analizy kończą się statusem „analizator nieskonfigurowany” — Metrivum nigdy nie pokazuje symulowanych wyników.",
      statuses: {
        Queued: "W kolejce",
        Processing: "Przetwarzanie",
        Completed: "Zakończona",
      },
      repLabel: (n: number) => `Powt. ${n}`,
      phases: { eccentric: "Ekscentryczna", concentric: "Koncentryczna" },
      pathLabel: "Tor sztangi",
    },
    workflow: {
      title: "Jak przebiega praca w Metrivum",
      steps: [
        {
          title: "Przygotuj przestrzeń",
          body: "Załóż konto, potwierdź e-mail i przejdź krótki onboarding.",
        },
        {
          title: "Zbuduj lub zaimportuj",
          body: "Zacznij od zera, od szablonu albo od pliku CSV, który już masz.",
        },
        {
          title: "Opublikuj rewizję",
          body: "Publikacja zapisuje prywatną, niezmienną wersję szkicu. Nie jest nikomu wysyłana.",
        },
        {
          title: "Eksportuj i analizuj",
          body: "Pobierz CSV lub PDF z rewizji i trzymaj nagrania liftów obok programu.",
        },
      ],
    },
    faq: {
      title: "Pytania, które zadają trenerzy",
      items: [
        {
          q: "Dla kogo jest Metrivum?",
          a: "Dla trenerów, którzy piszą programy treningowe, i dla ich podopiecznych. Trener buduje programy i prowadzi praktykę; podopieczny wypełnia check-iny, czyta wiadomości i śledzi swój kalendarz.",
        },
        {
          q: "Czy mogę wysyłać programy zawodnikom z Metrivum?",
          a: "Nie w samej aplikacji. Wyeksportuj opublikowaną rewizję do PDF lub CSV i udostępnij ją tak jak dotychczas.",
        },
        {
          q: "Czy cykl musi trwać tydzień?",
          a: "Nie. Cykl może trwać od 1 do 366 dni, a dni treningowe są numerowane wewnątrz niego.",
        },
        {
          q: "Co zmienia import CSV, zanim go zatwierdzę?",
          a: "Nic. Import to tymczasowa sesja: podgląd, dopasowanie ćwiczeń i walidacja. Program powstaje dopiero po zatwierdzeniu, a importer nigdy nie tworzy nowych ćwiczeń.",
        },
        {
          q: "Czy analiza wideo działa już dziś?",
          a: "Przesyłanie i porządkowanie nagrań działa. Pomiary wymagają usługi analizatora podłączonej do wdrożenia; bez niej nowe analizy pokazują „analizator nieskonfigurowany” zamiast zmyślonych liczb.",
        },
        {
          q: "Jakie języki są dostępne?",
          a: "Angielski i polski. Treść programów pozostaje dokładnie taka, jak ją napiszesz — nigdy nie jest tłumaczona automatycznie.",
        },
      ],
    },
    facts: [
      { value: "1–366", label: "dni w cyklu, bez przywiązania do tygodni" },
      { value: "8", label: "typów serii, od AMRAP po klastry" },
      { value: "%1RM", label: "RPE, RIR albo formuła w każdej serii" },
      { value: "CSV + PDF", label: "import i eksport z opublikowanej rewizji" },
    ],
    showcase: {
      title: "Jedno miejsce na cały blok",
      subtitle: "od długości cyklu po pojedynczą serię",
      tabs: ["Cykle", "Typy serii", "Formuły", "Biblioteka", "Foldery"],
    },
    landing: {
      heroNoteLabel: "Nowość",
      heroNote: "Analiza wideo liftów w tej samej przestrzeni",
      statement: {
        lead: "Inny rodzaj narzędzia treningowego.",
        rest: "Stworzony dla trenerów, którzy piszą programy, z blokami, cyklami i typowanymi seriami w centrum. Metrivum zachowuje szybkość arkusza i dodaje strukturę, której potrzebuje program.",
      },
      pillars: [
        {
          title: "Zbudowany jak plan treningowy",
          body: "Bloki, cykle o dowolnej długości i numerowane dni: struktura, w której trenerzy i tak myślą.",
        },
        {
          title: "Serie zapisane jako dane",
          body: "Osiem typów serii, zakresy, %1RM, RPE i formuły to pola, a nie tekst wpisany w komórkę.",
        },
        {
          title: "Twoja praca wychodzi czysto",
          body: "Zaimportuj CSV, który już masz, i wyeksportuj dowolną opublikowaną rewizję do CSV lub PDF.",
        },
      ],
      chapters: {
        structure: {
          title: "Plan i struktura",
          lead: "Rozpisz blok od długości cyklu po pojedynczy dzień i trzymaj programy oraz szablony w folderach. Szablon zawsze daje niezależną kopię.",
        },
        sets: {
          title: "Serie, obciążenia i ćwiczenia",
          lead: "Zapisz każdą serię z typem i pozwól formułom policzyć obciążenie. Ćwiczenia wybierasz z jednej wspólnej bazy.",
        },
        files: {
          title: "Import i eksport",
          lead: "Wprowadź istniejący arkusz przez import z walidacją i wyślij opublikowane rewizje jako pliki.",
        },
        video: {
          title: "Analiza wideo liftów",
          lead: "Trzymaj nagrania liftów obok programu i śledź każdą analizę od przesłania po wynik.",
        },
      },
    },
    finalCta: {
      title: "Zacznij kolejny blok w Metrivum",
      body: "Załóż konto, przejdź onboarding i zbuduj pierwszy program.",
    },
  },
  features: {
    meta: {
      title: "Funkcje — Metrivum",
      description:
        "Co Metrivum robi dziś: baza ćwiczeń, foldery i szablony, arkuszowy edytor programów z formułami, eksport CSV/PDF i analiza nagrań liftów.",
    },
    title: "Co Metrivum robi dziś",
    lead: "Wszystko poniżej jest częścią obecnego produktu. Niektóre funkcje mogą być włączane per konto; aplikacja pokazuje, co jest dla Ciebie dostępne.",
    groups: [
      {
        id: "library",
        title: "Baza ćwiczeń",
        items: [
          "Wspólny katalog z wyszukiwaniem, tagami, mięśniami i wzorcami ruchowymi",
          "Ulubione pod ręką",
          "Historia opisu i instrukcji wykonania",
          "Dodawanie ćwiczeń, gdy pozwala na to Twoje konto",
        ],
      },
      {
        id: "organise",
        title: "Foldery i szablony",
        items: [
          "Zagnieżdżone foldery na programy i szablony",
          "Prywatne szablony kopiowane do nowych programów",
          "Archiwizacja i przywracanie zamiast cichego usuwania",
          "Wyszukiwanie, sortowanie i filtry zapisane w adresie URL",
        ],
      },
      {
        id: "editor",
        title: "Edytor programów",
        items: [
          "Bloki, cykle dowolnej długości, numerowane dni i treningi",
          "Osiem typów serii, superserie i obwody",
          "Zakresy, kg/lb, %1RM, RPE lub RIR, czas, przerwa, tempo i dystans",
          "Szkice z wykrywaniem konfliktów i prywatne opublikowane rewizje",
        ],
      },
      {
        id: "formulas",
        title: "Formuły",
        items: [
          "Wbudowane formuły procentowe, progresji i back-off",
          "Własne formuły z typowanymi jednostkami i wersjami",
          "Obliczenia po stronie serwera, przypięte w każdej rewizji",
        ],
      },
      {
        id: "files",
        title: "Import i eksport",
        items: [
          "Import CSV z podglądem, dopasowaniem ćwiczeń i walidacją",
          "Eksport CSV i PDF całego programu albo bloku, cyklu lub treningu",
          "Separator: przecinek, średnik lub tabulator",
        ],
      },
      {
        id: "video",
        title: "Analiza wideo",
        items: [
          "Prywatna biblioteka nagrań (MP4, WebM i MOV)",
          "Zadania analizy ze statusem widocznym także po odświeżeniu",
          "Powtórzenia, fazy i tor ruchu, gdy podłączony jest analizator",
          "Porównanie dwóch analiz obok siebie",
        ],
      },
    ],
    scopeTitle: "Czym Metrivum nie jest",
    scopeBody:
      "Metrivum to przestrzeń robocza trenera. Nie zarządza podopiecznymi, płatnościami, wiadomościami ani kalendarzem i nie ma aplikacji mobilnej.",
    detailLinks: {
      programBuilder: "Kreator programów w szczegółach",
      videoAnalysis: "Analiza wideo w szczegółach",
    },
  },
  programBuilder: {
    meta: {
      title: "Kreator programów — Metrivum",
      description:
        "Bloki, cykle dowolnej długości, numerowane dni, osiem typów serii, formuły i CSV/PDF generowane na serwerze. Jak działa edytor programów Metrivum.",
    },
    eyebrowBack: "Wszystkie funkcje",
    title: "Edytor programów, który rozumie serie",
    lead: "Metrivum przechowuje program jako typowane dane, nie tekst w komórkach. Jednostki, powiązania i identyfikatory przetrwają kopiowanie, import i eksport.",
    structureTitle: "Struktura",
    structureBody:
      "Każdy poziom zawiera kolejny. Puste poziomy są poprawne w szkicu, więc możesz najpierw naszkicować, a potem uzupełnić.",
    structure: [
      { name: "Program", note: "Nazwa, opis, folder" },
      { name: "Blok", note: "Faza, np. akumulacja albo szczyt formy" },
      { name: "Cykl", note: "1–366 dni, bez przywiązania do tygodni" },
      { name: "Dzień", note: "Numerowany wewnątrz cyklu" },
      { name: "Trening", note: "Jeden lub więcej dziennie" },
      { name: "Ćwiczenie", note: "Ze wspólnego katalogu, z komentarzem" },
      { name: "Seria", note: "Typowana preskrypcja i opcjonalne segmenty" },
    ],
    prescriptionTitle: "Co może zawierać seria",
    prescription: [
      { label: "Powtórzenia", value: "Dokładnie albo zakres, np. 5 lub 8–10" },
      { label: "Obciążenie", value: "kg lub lb, dokładnie albo zakres" },
      { label: "Obciążenie względne", value: "% wartości bazowej, np. 1RM" },
      { label: "Wysiłek", value: "RPE 0–10 albo RIR — jedno z dwóch" },
      {
        label: "Czas i dystans",
        value: "Czas pracy, przerwa, metry lub kilometry",
      },
      { label: "Tempo", value: "Cztery fazy, np. 3-1-X-0" },
      { label: "Formuła", value: "Wbudowana lub własna, liczona przez serwer" },
    ],
    editorTitle: "Praca w edytorze",
    editor: [
      {
        title: "Najpierw klawiatura",
        body: "Poruszaj się między komórkami strzałkami, edytuj Enterem, wychodź Escape. Pisanie w komórce nigdy nie uruchamia skrótów całego arkusza.",
      },
      {
        title: "Kopiuj, wklejaj, porządkuj",
        body: "Kopiuj preskrypcje między seriami, powielaj ćwiczenia, treningi, cykle i bloki oraz przenoś je przyciskami lub skrótami klawiszowymi, nie tylko przeciąganiem.",
      },
      {
        title: "Cofnij to, co zrobiłeś",
        body: "Cofnij i ponów obejmują Twoje lokalne zmiany. Nie udają historii wersji na serwerze.",
      },
      {
        title: "Zapis, któremu można ufać",
        body: "Każdy zapis zawiera wersję, od której zaczynasz. Jeśli program zmienił się gdzie indziej, zobaczysz konflikt i zachowasz swoją pracę.",
      },
    ],
    draftLabel: "Szkic",
    revisionsTitle: "Szkice i rewizje",
    revisionsBody:
      "Szkic to to, co edytujesz. Publikacja zapisuje prywatną, niezmienną rewizję z danymi ćwiczeń i wynikami formuł z tamtej chwili. Eksport powstaje z rewizji, więc zawsze wiesz, którą wersję pobierasz.",
    filesTitle: "CSV na wejściu, CSV i PDF na wyjściu",
    filesBody:
      "Import działa jako tymczasowa sesja: podgląd, dopasowanie ćwiczeń, walidacja i zatwierdzenie. Eksport generuje serwer — dla całego programu albo jednego bloku, cyklu lub treningu.",
  },
  videoAnalysis: {
    meta: {
      title: "Analiza wideo — Metrivum",
      description:
        "Prywatna biblioteka nagrań, trwałe zadania analizy, powtórzenia, fazy, tor ruchu i porównania. Jak działa analiza wideo w Metrivum i czego wymaga.",
    },
    eyebrowBack: "Wszystkie funkcje",
    title: "Analiza liftów w Twojej przestrzeni",
    lead: "Trzymaj nagrania prywatnie, uruchamiaj analizy jako zadania w tle i czytaj wyniki obok programów.",
    flowTitle: "Od przesłania do wyniku",
    flow: [
      {
        title: "Prześlij",
        body: "Wybierz plik MP4, WebM lub MOV. Metrivum rezerwuje przesyłanie, a plik trafia prosto do prywatnego magazynu.",
      },
      {
        title: "Weryfikacja",
        body: "Serwer sprawdza typ i rozmiar zapisanego pliku, zanim nagranie będzie gotowe.",
      },
      {
        title: "Analizuj",
        body: "Uruchom analizę z nazwą, tagami i notatką. Działa w tle i przetrwa odświeżenie strony.",
      },
      {
        title: "Przeglądaj",
        body: "Czytaj powtórzenia, czasy faz i tor ruchu albo porównaj dwie analizy.",
      },
    ],
    resultsTitle: "Co zawiera wynik",
    results: [
      { label: "Powtórzenia", value: "Początek i koniec każdego powtórzenia" },
      { label: "Fazy", value: "Fazy z czasami w każdym powtórzeniu" },
      {
        label: "Trajektoria",
        value: "Pozycja w czasie z jakością i oznaczeniem zasłonięcia",
      },
      {
        label: "Prędkość",
        value:
          "Tylko gdy podaje ją analizator; nigdy liczona z pikseli bez kalibracji",
      },
    ],
    statusTitle: "Status analizatora",
    statusBody:
      "Pomiary wymagają usługi analizatora podłączonej do wdrożenia Metrivum. Gdy jej brak, nowe analizy kończą się statusem „analizator nieskonfigurowany”. Ten stan jest pokazywany wprost — bez zastępczych wykresów i symulowanych liczb.",
    privacyTitle: "Domyślnie prywatne",
    privacyBody:
      "Nagrania są przechowywane w prywatnym buckecie. Odtwarzanie korzysta z krótkotrwałych podpisanych linków, które wygasają po kilku minutach i nigdy nie są traktowane jako stałe adresy.",
    limitsNote:
      "Domyślne limity: MP4, WebM lub MOV do 256 MiB, pięć przesyłań w toku jednocześnie. Twoje wdrożenie może mieć inne limity.",
  },
  notFound: {
    meta: {
      title: "Nie znaleziono strony — Metrivum",
      description: "Ta strona nie istnieje.",
    },
    title: "Ta strona nie istnieje",
    body: "Sprawdź adres albo wróć na start.",
    home: "Przejdź na stronę główną",
  },
};
