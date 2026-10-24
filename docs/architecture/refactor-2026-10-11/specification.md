# Metrivum — refaktoryzacja architektury i wdrożenie poprawek systemowych

## 0. Zadanie i sposób pracy

Przeprowadź przegląd ISTNIEJĄCEGO Metrivum, a następnie wdrażaj uzasadnione poprawki architektury, jakości kodu, bezpieczeństwa, spójności danych, wydajności i niezawodności. Zakres obejmuje ASP.NET Core API, PostgreSQL/Supabase, istniejące workery, React web oraz istniejącą aplikację React Native + Expo.

To zadanie implementacyjne, nie sam audyt ani propozycja nowej architektury. Oczekuję działających zmian, migracji tam, gdzie są potrzebne, testów oraz raportu wyników. Pracuj w etapach, nie jako jeden wielki refaktor.

Najważniejsza zasada:

> Naprawiaj przyczyny i całe klasy problemów. Preferuj jeden mały, dobrze zaprojektowany mechanizm zamiast wielu lokalnych wyjątków. Jednocześnie nie buduj uniwersalnego frameworka tam, gdzie wystarczy prosty kod.

Jakość kodu jest równorzędnym celem. Usunięcie duplikacji, niejasnej odpowiedzialności albo niebezpiecznej zależności jest wartościową poprawką nawet bez zmiany czasu odpowiedzi. Nie przedstawiaj jednak takiej zmiany jako zmierzonego przyspieszenia.

Przyjęcie tego zadania nie upoważnia do zmiany reguł biznesowych, kasowania danych, publikacji do sklepów, wdrożenia produkcyjnego, zakupu infrastruktury ani modyfikowania RaceTrace.

## 1. Źródła, ich status i granice adaptacji

### 1.1. Dokument referencyjny RaceTrace

Przeczytaj dołączony `RACETRACE_ARCHITECTURE.md`. Jest materiałem referencyjnym z innego projektu, NIE opisem aktualnego kodu Metrivum.

Dokument opisuje audyt źródeł z 10 października 2026 i dopisek publikacyjny z 11 października. Dopisek potwierdza późniejsze zastosowanie dwóch migracji w RaceTrace Analytics, ale nie potwierdza uruchomienia flag runtime. Sam audyt nie weryfikował produkcyjnej wydajności ani nie uruchamiał ponownie wymienionych testów. Nie przenoś jego ustaleń jako faktów o Metrivum.

Źródłowe mechanizmy do oceny i adaptacji:

| RaceTrace — sekcja | Co faktycznie opisano | Zastosowanie proponowane dla Metrivum |
|---|---|---|
| 5.3, 14.2 | Odczyty pod zastosowanie, reuse wejść, wspólny kontekst szczegółów | Małe projekcje, odczyty zbiorcze, współdzielone dane nagłówka i lazy loading zakładek |
| 6.1, 6.9 | Wspólne kalkulatory, wersje i zależności konfiguracji | Spójne metryki Progress/Analyze, generator i pochodzenie wyników ML |
| 7–9 | Warstwy cache, SingleFlight, rewizje i kontrola publikacji | Wybrane cache i obliczenia z jednoznaczną tożsamością oraz zakresem dostępu |
| 10 | OpenAPI → TypeScript + runtime Zod, z częściowym pokryciem | Kontrakty web/mobile i automatyczna kontrola rozjazdów |
| 11.2 | Dzierżawy, heartbeat, fencing, trwałe artefakty | Odporne zadania istniejących modułów Metrivum |
| 12 | Rozdzielona telemetria warstw i jej ograniczenia | Pomiar API, Npgsql/SQL, obliczeń, kolejek i lokalnego ML |
| 13 | Query keys, stany UI, tokeny stylowania i niepełne granice feature’ów | Uporządkowanie adapterów, komponentów i izolacji kont |
| 15, 17, 18 | Luki wdrożeniowe, kontrola wersji, parity tests i rekomendacje | CI, bezpieczne migracje, kontrolowane uruchamianie i testy zgodności |

W szczegółowej sekcji 5.3 aktualna normalna ścieżka v3 korzysta z pakietów danych źródłowych, a nie dawnych wyników `prepared_payload`. W raporcie są też opisy starszych warstw i ścieżek kompatybilności. Nie wyciągaj wniosku, że należy materializować każdy wynik Metrivum albo przenieść całą historyczną strukturę RaceTrace.

### 1.2. Dodatkowe wymagania Metrivum, nie ustalenia audytu RaceTrace

Następujące elementy są projektowanymi rozszerzeniami Metrivum, a nie twierdzeniem, że już działają w RaceTrace:
- automatyczne testy granic architektury;
- staging i atomowa publikacja większych zmian;
- ujednolicony transactional outbox i deduplikacja odbiorców;
- bezpieczny autosave oraz lokalne drafty;
- kontroler spójności i narzędzia naprawcze;
- zgodność starszych aplikacji mobilnych;
- rozdzielenie entitlement, autoryzacji, flag operacyjnych i możliwości urządzenia;
- jawne przejścia stanów i typy wartości;
- odtwarzanie po awarii i polityki cyklu życia danych;
- bezpieczny cykl życia lokalnych modeli ML.

Każde zalecenie zweryfikuj w repo. Gdy mechanizm już istnieje, popraw go i wykorzystaj ponownie. Nie twórz drugiego systemu.

### 1.3. Czego NIE przenosimy

Nie kopiuj z RaceTrace:
- statycznych współdzielonych read/admin bearer secrets jako logowania;
- PostgREST/RPC jako zamiennika obecnego EF Core/Npgsql;
- centralnego, wielozadaniowego `DomainQueryService`;
- wszystkich TTL, wszystkich warstw cache i wszystkich domyślnych limitów;
- zasady wykonywania wszystkich obliczeń na backendzie — ML Metrivum ma być lokalne;
- luźnych granic modułów, dynamicznego JSON bez kontraktu ani braku CI;
- pięciosekundowej świeżości rewizji jako gwarancji natychmiastowego odebrania uprawnień.

Nie zmieniaj technologii, ORM, systemu kont ani całej struktury repo na wzór innego projektu.

## 2. Nienaruszalne założenia Metrivum

Zachowaj dotychczasowe reguły i interfejsy, chyba że wykryta luka wymaga uzasadnionej, wstecznie bezpiecznej korekty.

1. Istniejący modularny monolit ASP.NET Core, Supabase Auth i PostgreSQL przez obecny EF Core/Npgsql. Bez drugiego API i nowego projektu Supabase.
2. Web React/TypeScript i mobile React Native/Expo korzystają z tego samego backendu. Współdzielone kontrakty nie oznaczają współdzielenia DOM z natywnym UI.
3. Jedno konto może mieć role Coach i Client. Maksymalnie trzy zapamiętane konta mają niezależne sesje, drafty, cache i subskrypcje realtime.
4. Rozdzielaj prywatne współprace oraz współprace Teamu. Przeniesienie wymaga potwierdzenia klienta; nie upublicznia automatycznie wcześniejszych poufnych danych.
5. Oferta, wariant rozliczenia, zgłoszenie, relacja, usługa i należność to odrębne elementy. Jeden klient może mieć wiele usług, programów, grup i harmonogramów check-inów.
6. Formularze oraz publikowane programy zachowują wersje. Wykonanie treningu nie modyfikuje planu. Istniejące zasady nadpisywania wykonania nie oznaczają obowiązku dodania pełnego event sourcingu.
7. Free i Pro mają obecnie takie same dostępne funkcje indywidualne. Nie dodawaj nowych ograniczeń sprzedażowych w ramach optymalizacji. Uprawnienia Team i różnice komercyjne pozostają osobną polityką.
8. Płatności pozostają symulowane przez istniejącego providera, z rzeczywistą historią biznesową i bez zbierania danych karty. W mobile nie wprowadzaj checkoutu ani obejścia przez WebView.
9. Zachowaj przyjęte okresy subskrypcji, odnowienia, rezygnację na koniec opłaconego okresu i kredyt za niewykorzystane Pro przy upgrade do Team. Nie zmieniaj zaokrągleń ani prowizji pod pozorem refaktoru.
10. Finanse prywatne, organizacyjne i płatności na rzecz platformy nie mogą zostać połączone przez uproszczoną agregację.
11. Zakończenie Teamu nie kasuje prywatnych współprac ani historii. Zaległe odnowienie i świadome rozwiązanie organizacji nie są tym samym.
12. Historia czatu jest trwała; grupy, ręczne członkostwo, bany i historyczne zakresy dostępu pozostają rozdzielone.
13. Analiza wideo ML działa lokalnie na telefonie i w przeglądarce. Brak obsługi urządzenia nie uruchamia automatycznie zdalnej analizy.
14. Zachowaj aktualny design web/mobile. Na mobile pozostają natywne komponenty, Liquid Glass tam, gdzie obsługiwane, oraz własne panele wysuwane od dołu — nie dodawaj context menus ani centralnych modali.

Jeżeli repo ma rozbieżność z tymi regułami, opisz konkretny konflikt. Nie wymyślaj nowej polityki płatności, retencji, zgód lub dostępu do wrażliwych danych. Popraw jednoznaczne błędy; decyzje biznesowe wyodrębnij i kontynuuj prace niezależne od nich.

## 3. Audyt początkowy i plan wykonania

Przeczytaj `AGENTS.md`, `CLAUDE.md`, architekturę, wcześniejsze audyty, aktualne migracje, kontrakty, CI i konfigurację środowisk. Poprzedni prompt lub raport nie dowodzi aktualnej implementacji.

Sprawdź `git status`. Nie usuwaj ani nie nadpisuj niepowiązanych zmian użytkownika. Nie stosuj automatycznego resetu, stash ani dużej zmiany formatowania całego repo.

Sporządź krótką mapę:
- moduły i zależności;
- źródła prawdy dla danych oraz obliczeń;
- punkty autoryzacji i prywatne projekcje;
- mechanizmy zapisu, współbieżności, outbox, jobów i cache;
- kontrakty web/mobile, natywne moduły i wersje modeli;
- migracje, dostępy runtime i wdrożenie.

Utwórz checklistę obejmującą KAŻDY obszar tej specyfikacji ze stanem: `do oceny`, `już spełnione`, `do poprawy`, `wymaga pomiaru`, `zablokowane`, `nie dotyczy`. Każdy finalny stan ma dowód lub uzasadnienie.

Nie twierdź z góry, że są N+1, brak RLS czy brak outbox. Podaj miejsce w kodzie, scenariusz i faktyczny skutek.

Zbierz baseline: buildy, istotne testy, liczby SQL/requestów i reprezentatywne czasy tam, gdzie środowisko pozwala. Oddziel błędy zastane od wprowadzonych. Potem wdrażaj plan; nie kończ na spisie rekomendacji.

## 4. Granice architektury oraz jakość kodu

Przejrzyj backend, web, mobile i wspólne pakiety.

### 4.1. Refaktor odpowiedzialności

- Rozdziel transport, autoryzację, orchestration, obliczenia i rendering tam, gdzie są nieczytelnie zmieszane.
- Wyodrębniaj małe kalkulatory, polityki i adaptery z realnymi odbiorcami.
- Usuń udowodniony martwy kod, nieużywane zależności i zduplikowane ścieżki po przełączeniu odbiorców.
- Zachowaj adaptery kompatybilności, dopóki są potrzebne używanym klientom.
- Uporządkuj nazwy i kontrakty w dotykanych miejscach, bez masowego rename dla estetyki.
- Nie zastępuj kilku jasnych metod jednym nieczytelnym „uniwersalnym” handlerem z flagami.
- Nie wprowadzaj generic repository, command busa ani nowej biblioteki DI tylko dlatego, że pasuje do wzorca.

### 4.2. Automatyczne testy granic

Rozszerz obecne testy architektury/lint reguły importów:
- endpointy nie udostępniają bezpośrednio encji EF;
- domenowe kalkulatory nie zależą od HTTP, React, EF ani platformy;
- moduł nie zapisuje cudzych tabel z pominięciem publicznej operacji;
- moduły używają jawnych kontraktów, nie cudzych klas Infrastructure/DbContext;
- `ui-web` i `ui-mobile` nie znają JWT, endpointów ani encji biznesowych;
- przenośne kontrakty/logika nie importują DOM, Expo ani sterowników DB;
- brak nowych cykli zależności;
- kontrakt używany przez kilka feature’ów ma właściwego właściciela, nie przypadkowy ekran.

Przekrojowe odczyty analityczne mogą używać jawnie zaprojektowanej warstwy odczytu lub zbiorczych kontraktów. Nie wymuszaj setek wywołań modułów w imię „czystości”. Decyzję i właściciela takiego odczytu udokumentuj.

Istniejące naruszenia można wygaszać etapami przez mały, udokumentowany baseline. Nie dopuszczaj nowych przez ogólne wyłączenie reguł. Nie dziel każdego folderu na osobny projekt bez realnej potrzeby.

## 5. Jeden mechanizm metryk, nie jeden gigantyczny serwis

Znajdź rozbieżne implementacje tych samych reguł w Activity, Progress, Client Details, Analyze, Team Analyze, raportach i API mobile.

Ujednolić należy m.in.:
- completion rate, missed/skipped/completed i zakres kwalifikowanych sesji;
- zgodność wykonania z planem;
- serie robocze, objętość, powtórzenia i e1RM;
- agregację pomiarów, jednostek i dat;
- unikalnych klientów, nowych/powracających klientów, konwersję i retencję;
- zestawienia rozliczeń według historycznych kwot, walut i kontekstu.

Dla metryki określ: źródło danych, kwalifikowane rekordy, definicję, jednostkę, null/brak danych, zasady dat, wersję i drilldown do źródła. Frontend może formatować, rysować i wyliczać lokalne elementy prezentacyjne. Nie utrzymuje drugiego autorytatywnego algorytmu biznesowego.

SQL może robić agregację dla wydajności. Wtedy wspólne definicje, kontrakty i testy muszą potwierdzać zgodność z odpowiednim kalkulatorem referencyjnym. Nie przenoś milionów rekordów do C# wyłącznie po to, by „mieć wspólną metodę”.

Nie zmieniaj znaczenia metryk podczas ekstrakcji kodu. Błąd algorytmiczny wymagający zmiany oczekiwanych wyników opisz osobno, wersjonuj i pokryj testem. Test „wynik jest taki jak wcześniej” nie jest dowodem poprawności starej definicji.

Zachowaj: planowane ciężary nie są osiągnięciami; rodzina ćwiczeń nie jest automatyczną zgodą na sumowanie wyników; brak wartości nie jest zerem; sumowanie grup mięśniowych nie może liczyć tej samej serii ponownie jako rodzica i dziecka.

## 6. Tożsamość obliczenia, wersjonowanie i pochodzenie wyniku

Wykorzystaj istniejące wersje; nie dodawaj równoległego rejestru bez migracji odbiorców.

Dla istotnych obliczeń wprowadź spójny opis:
- `AlgorithmId` i `AlgorithmVersion`;
- hash efektywnych, kanonicznie zapisanych parametrów;
- tożsamość/rewizję wejścia;
- wersję formatu wyniku;
- rzeczywiste `ComputedAt`;
- identyfikację wydania/commit i manifest algorytmów tam, gdzie potrzebne.

Zarejestruj rzeczywiste zależności obliczeń. Zmiana zależnego algorytmu lub konfiguracji musi zmieniać tożsamość zależnego wyniku. Nie dodawaj wszystkich zależności globalnie „na wszelki wypadek”.

Zmiana kodu algorytmu nie jest automatycznie zmianą hasha jego parametrów. Dodaj politykę przeglądu/CI wymagającą jawnego rozpatrzenia wersji lub uzasadnienia braku zmiany wyników. Nie udawaj, że prosty skrypt rozpozna semantykę każdej zmiany kodu.

Dla generatora zapisuj wersję recepty, parametry, seed i rewizję kwalifikującego katalogu ćwiczeń. Nie zachowuj pozornej deterministyczności, jeśli wejściowy katalog się zmienił.

Dla ML zapisuj identyfikację modelu, hash, runtime, preprocessing/postprocessing, kalibrację, wybrany fragment i rewizję/identyfikator źródła.

Przy cache zachowuj pierwotne `ComputedAt`. Oddziel `ServedAt` i datę wejść. Nie zmieniaj czasu starej analizy na „teraz”.

Nie ujawniaj w publicznych nagłówkach poufnych danych, tokenów ani szczegółów konfiguracji. DTO lub metadane mają być zgodne z uprawnieniami.

Hash i wersja nie odtwarzają utraconych wejść. Nie obiecuj pełnej reprodukcji starej analizy, gdy wykonanie treningu zostało nadpisane albo użytkownik usunął lokalny film. Zachowuj tylko niezbędne snapshoty zgodnie z obecną polityką; nie wprowadzaj globalnego event sourcingu.

Historia finansowa jest faktem rozliczenia, NIE pochodnym cache do ponownego przeliczenia nową stawką.

## 7. Kontrakty API, runtime validation i wspólna warstwa web/mobile

Ujednolić istniejący proces: DTO i metadane backendu → OpenAPI → wygenerowane typy/klient → walidacja odpowiedzi → adapter UI.

- Eksport kontraktów uruchamiaj bez produkcyjnych sekretów, zewnętrznych połączeń, migracji przy starcie i aktywnych workerów.
- Wygenerowane pliki są odtwarzalne; nie edytuj ich ręcznie.
- Zadbaj o nullable vs absent, daty/dni, jednostki, waluty, liczby i identyfikatory.
- Dla pieniędzy zachowaj uzgodniony dokładny kontrakt. Nie zamieniaj wszystkich wartości na JS `number` i nie zmieniaj wire format bez migracji odbiorców.
- Dynamiczne formularze opisuj typowanymi wariantami pytań i odpowiedzi, z walidacją według wersji formularza; nie `any` i nie osobne ręczne DTO dla każdego szablonu.
- Wspólne kontrakty umieść w obecnym przenośnym pakiecie lub małym nowym pakiecie, nie w katalogu jednego ekranu.
- Walidację runtime stosuj przy zewnętrznych granicach: API, importy, zdarzenia, lokalne wyniki ML. Nie parsuj wielokrotnie tym samym schematem już zweryfikowanego obiektu bez potrzeby.
- Schematy Zod lub obecny odpowiednik nie muszą być w całości generowane. Testuj ich wejściową zgodność z wire types i niezależnie wymagane reguły biznesowe.
- Typuj/versionuj także komunikaty SignalR, eventy outbox i payloady zadań.

Ujednolić błędy, np. istniejące ProblemDetails z kodem, błędami pól i identyfikatorem korelacji. Nie ujawniaj SQL, prywatnych danych ani stack trace. Zachowaj poprawne komunikaty w UI zamiast zastępowania każdego błędu jednym ogólnym tekstem.

CI ma wykrywać nieaktualne kontrakty i sprawdzać web oraz istniejący mobile. Zadbaj o wersje starszych klientów: dodanie pola nie wymaga natychmiastowej aktualizacji aplikacji, nowy wariant enum nie powinien wysypać całego ekranu. Krytyczne mutacje o nieznanej semantyce mają być blokowane, nie zgadywane.

## 8. Odczyty pod ekran i poprawa zapytań PostgreSQL/EF

Najpierw zmierz zapytanie, potem dobierz strategię. Jedno żądanie HTTP nie oznacza jednego taniego SQL.

Priorytetowe ścieżki:
- lista klientów i podsumowania aktualnych usług;
- Client Details: nagłówek/Overview oraz pozostałe zakładki;
- historia treningów, check-inów i czatu;
- powiadomienia, grupy i podglądy członkostwa;
- biblioteka programów, ćwiczeń i formuł;
- prywatne i Team Analyze.

Wymagania:
1. Nagłówek i małe wspólne dane pobierane raz i bezpiecznie współdzielone.
2. Ciężkie zakładki pobierane na żądanie. Nie jeden wielki endpoint ze wszystkimi seriami, plikami, płatnościami i odpowiedziami klienta.
3. Projekcje tylko potrzebnych pól, operacje zbiorcze i agregacje po stronie bazy.
4. Bez N+1, przedwczesnego `ToListAsync` i nieograniczonych list `Include`.
5. Tracking tylko tam, gdzie potrzebny. Nie włączaj globalnie `AsNoTracking` ani `AsSplitQuery` bez analizy konsekwencji.
6. Keyset/cursor dla długich historii, stabilny tie-breaker. Offset może zostać tam, gdzie potrzebny losowy skok stron i koszt jest rozsądny.
7. Bounded filtry/ranges/batch sizes, prawidłowa walidacja sortowania i literali wyszukiwania.
8. Wykresy zwracają potrzebne punkty/agregaty, nie pełną historię do liczenia w React.
9. Nie pomijaj danych za arbitralnym limitem i nie prezentuj obciętej próbki jako pełnego wyniku. Dla np. resolvera z limitem 10 000 relacji przygotuj poprawny, ograniczony kosztowo odczyt w DB albo jawny błąd/kontrakt częściowości.
10. Nie pomijaj autoryzacji, aby zmniejszyć query count. Kontrole zbiorcze muszą zachować dokładnie zakres i prywatne pola.

Użyj dostępnych `pg_stat_statements`, planów zapytań i `EXPLAIN (ANALYZE, BUFFERS)` na bezpiecznych odczytach w kontrolowanym środowisku. `ANALYZE` wykonuje zapytanie — nie uruchamiaj modyfikujących poleceń diagnostycznych na współdzielonej bazie.

Indeksy dopasuj do rzeczywistych predykatów i sortowania. Oceń koszt zapisów, rozmiar, duplikaty i małe tabele. Sequential scan sam w sobie nie oznacza błędu. Constraint dla integralności może być potrzebny niezależnie od przyspieszenia odczytu.

Sprawdź Npgsql pooling, liczbę pooli/data sources oraz łączny budżet połączeń API i workerów. Nie udostępniaj jednego DbContext równoległym zadaniom. DbContext pooling nie jest tym samym co pooling połączeń.

Nie zmieniaj trybu połączeń Supabase bez weryfikacji prepared statements, stanu sesji i faktycznej konfiguracji używanego poolera. Nie dodawaj service_role/BYPASSRLS, aby naprawić wolne zapytanie.

Raw SQL dopuszczalny punktowo, parametryzowany i przetestowany, jeśli daje uzasadnioną przewagę. Nie przepisuj całego EF na SQL.

## 9. Pakiety wejściowe i trwałe agregaty — warunkowo

Najpierw użyj dobrych projekcji SQL oraz request-local reuse. Trwały read model dodaj tylko dla udowodnionego kosztownego, powtarzalnego odczytu.

Możliwe zastosowania: kompaktowe podsumowanie wykonania treningu, dzienne agregaty finansowe, indeks dostępnych wyników progresu. To przykłady, nie obowiązek tworzenia wszystkich tabel.

Dla każdego artefaktu określ:
- źródło prawdy i źródła zależności;
- wersję schematu, rewizję wejścia i konfigurację;
- kogo obejmuje i kto ma dostęp;
- sposób odtworzenia i aktualizacji po korekcie/usunięciu źródła;
- dopuszczalną świeżość i zachowanie przy braku aktualnego artefaktu;
- atomowe opublikowanie oraz metrykę fallbacków.

Read model musi być odbudowywalny. Nie staje się drugim źródłem kwot rozliczeń ani zgód klienta. Nowe połączenia i pełne aktualne reguły dostępu mają nadal ograniczać odczyt.

Fallback do danych źródłowych musi liczyć tę samą metrykę. Nie ukrywaj błędu uprawnień, sieci albo uszkodzonych danych pod pustym raportem „brak wyników”. Nie implementuj nieograniczonego ciężkiego fallbacku, który przeciąży bazę podczas awarii cache.

Jeżeli pomiary nie uzasadniają preagregacji, zapisz `not justified by measurements` i pozostaw prosty odczyt. To nie zwalnia z oceny pozostałych wymaganych mechanizmów.

## 10. Staging i atomowa publikacja dokumentów

Zapewnij, że import CSV, generator, duplikacja i publikacja programu/formularza/oferty nie odsłaniają częściowej struktury.

Model działania:

```text
Przygotowanie / parsowanie / generowanie
→ walidacja całej struktury
→ zapis wersji roboczej lub ukrytych danych staging
→ krótka transakcja zatwierdzająca kompletną wersję
→ zdarzenia po zatwierdzeniu
```

Długie obliczenia i operacje sieciowe wykonuj poza transakcją trzymającą blokady. W transakcji sprawdź oczekiwaną wersję, aktualny dostęp i ustaw odwołanie do nowej opublikowanej wersji.

Wymagania:
- żadna sesja klienta nie czyta połowy nowego programu;
- nieudana walidacja pozostawia poprzednią publikację;
- retry nie publikuje drugi raz tej samej wersji;
- opublikowane/snapshotowane historyczne zalecenia nie są przepisywane;
- aktualizacja przyszłych przypisań respektuje istniejącą politykę i nie rusza rozpoczętych/zakończonych wykonań;
- plik w Storage i SQL nie są jedną transakcją: używaj jawnego etapu upload/finalize i sprzątania niepowiązanych plików;
- duży fanout między modułami może być trwałym procesem z widocznym statusem, zamiast udawania globalnej atomowości.

## 11. Transactional outbox, odbiorcy i spójność między modułami

Ujednolić istniejący mechanizm. Nie uruchamiaj drugiego outbox obok poprawnie działającego.

Zapis biznesowy i informacja o zdarzeniu mają zatwierdzać się w tej samej transakcji tam, gdzie mają wspólną bazę/koordynator transakcji. Moduły nadal zapisują swoje dane przez własne kontrakty. Kilka `SaveChanges` na różnych niezwiązanych kontekstach nie jest automatycznie jedną transakcją.

Przykłady: CheckInSubmitted, MessageCreated, PaymentSettled, RelationshipTransferred, MembershipChanged, ProgramPublished.

Koperta zdarzenia powinna zawierać stabilne ID, typ i wersję, źródło/aggregate ID, wersję źródła tam, gdzie istotna, czas, kontekst właścicielski i correlation ID. Payload minimalny; preferuj referencje zamiast kopiowania danych zdrowotnych i treści rozmów.

Dostarczanie:
- worker trwały, restart-safe, retry i obsługa trwale błędnych komunikatów;
- unikalność `(consumer, eventId)` lub odpowiednik;
- efekt odbiorcy i potwierdzenie przetworzenia atomowe w jego transakcji;
- uporządkowanie lub ochrona wersją dla zmian tego samego zasobu;
- stary event członkostwa nie może nadpisać nowego bana;
- brak założenia globalnej kolejności wszystkich zdarzeń;
- błędy oraz wiek zaległych zdarzeń obserwowalne;
- brak kosztownych odczytów dodatkowych przy pustym pollu.

Dla skutków zewnętrznych (push, operator płatności w przyszłości) samo inbox/outbox nie daje exactly-once. Użyj wspieranej idempotencji dostawcy, deduplikacji i uzgadniania stanu. Opisz granice gwarancji.

SignalR jest dostarczeniem realtime, nie źródłem prawdy. Awaria emitowania nie usuwa zapisanego komunikatu; REST/catch-up odtwarza stan. Nie zapisuj typing/heartbeat jako trwałych eventów biznesowych.

Nie odkładaj egzekwowania odebrania dostępu do asynchronicznej synchronizacji. Po zmianie polityki każde nowe chronione żądanie musi sprawdzać obowiązujący stan. Odbiorca opóźnionego powiadomienia ma ponownie przejść kontrolę dostępu, bez wycieku prywatnego payloadu.

## 12. Trwałe zadania: dzierżawy, fencing, retry i ograniczenia pracy

Rozszerz istniejącą infrastrukturę zadań dla check-inów, odnowień, przypomnień, rozwiązania Teamu i innych już obecnych operacji. Nie twórz osobnych schedulerów dla każdego modułu.

Minimalne wymagania:
- trwała tożsamość zadania/uruchomienia;
- atomowe przejęcie z krótką transakcją;
- owner/lease/fencing token albo równoważna wersja próby;
- heartbeat i deadline;
- ciężka praca poza długą transakcją;
- atomowe zatwierdzenie tylko przez aktualnego, niewygasłego właściciela;
- odzyskanie zadania po awarii, cancellation i kontrolowane retry;
- deduplikacja skutków przy ponowieniu;
- status błędu trwałego i jawne wznowienie przez uprawnioną operację;
- sprawiedliwy przydział między użytkownikami/Teamami, a nie uprzywilejowanie najaktywniejszego;
- ograniczone globalne oraz per-owner concurrency.

Test kluczowy: A traci lease, B przejmuje i publikuje, A wraca — A nie może nadpisać wyniku B. `SKIP LOCKED` przy pobraniu nie zastępuje tej ochrony.

Clock koordynacji między instancjami oprzyj na autorytatywnym zegarze DB lub uzasadnionej strategii, nie na założeniu idealnej synchronizacji komputerów.

Nie identyfikuj ponownych obliczeń tylko czasowym bucketem, jeżeli zmieniły się dane/model/konfiguracja. Zachowaj możliwość utworzenia nowego poprawnego uruchomienia z właściwą tożsamością.

Nie wracaj do serwerowej analizy filmów. Dla lokalnego ML ograniczenia dotyczą urządzenia i lokalnego runtime, a serwer obsługuje zapis/uprawnienia. Stare limity GPU nie mają być kopiowane do nowego lokalnego przepływu bez uzasadnienia.

## 13. Cache, rewizje i bezpieczna publikacja wyników

Dodawaj cache tylko po ustaleniu źródła kosztu i wymaganej świeżości. Domyślnie nie cache’uj całych odpowiedzi zawierających prywatne dokumenty lub dane autoryzacyjne.

Dla kosztownego wyniku klucz powinien uwzględniać odpowiednie elementy:
- rodzaj obliczenia;
- autoryzowany zakres prywatny/Team/relacja;
- użytkownika lub bezpiecznie równoważny zakres uprawnień;
- znormalizowane filtry, jednostki i strefę czasową, jeśli wpływają na wynik;
- rewizję danych;
- wersję algorytmu i konfiguracji;
- schemat artefaktu.

Nie umieszczaj surowych JWT, PII ani nieograniczonych tekstów w kluczach. Ogranicz rozmiar i liczbę wariantów, czas życia i pamięć. Cache wyników użytkowników nie może być jednym wspólnym wpisem „dashboard”.

### Rewizje danych

Zaprojektuj małą mapę zależności, np. wykonanie treningu → progres tej współpracy i właściwe podsumowania, płatność → finanse w historycznym kontekście. Zmiana wiadomości nie powinna unieważniać wszystkich analiz.

Bump rewizji zatwierdzaj z zapisem źródła. Uwzględnij old/new scope przy przeniesieniu współpracy lub zmianie daty. Wykorzystaj istniejącą ścieżkę zapisu/triggery po ocenie wszystkich writerów — nie dokładaj obu mechanizmów bez kontroli podwójnych zmian.

Jeżeli używasz triggerów, testuj poprawność, koszt zapisu zbiorczego i coalescing w transakcji. Nie zakładaj, że per-row trigger jest darmowy.

### Publication guard

Obliczenie otrzymuje tożsamość wejścia na starcie. Publikacja musi sprawdzić, czy nadal jest aktualna. Trwały artefakt publikuj przez warunkowy zapis/CAS względem źródłowej rewizji. Stary rezultat może co najwyżej pozostać pod starym, nieużywanym kluczem do wygaśnięcia — nie pod bieżącym.

Sam pre/post check w dwóch zapytaniach nie daje pełnej serializowalności. Jeżeli wymagany jest spójny snapshot wejściowy, dobierz krótką transakcję snapshotową, immutable input package albo retry z weryfikacją kompletności. Nie trzymaj blokad przez długi CPU/ML.

Zdefiniuj faktyczną gwarancję świeżości każdego cache. Nie kopiuj mechanicznie 5 s/30 s z RaceTrace. Awaria odświeżania nie może bez końca przedłużać zaufania do starej rewizji.

### Dane a autoryzacja

Cache metryk nie zastępuje bieżącej kontroli dostępu. Odczyt prywatny ponownie sprawdza politykę; przy długo trwającym wspólnym obliczeniu sprawdź aktualny dostęp danego oczekującego także przed wydaniem wyniku. Bezpieczeństwa nie opieramy na TTL wyników. Zmiana członkostwa lub cofnięcie dokumentu nie może dać okna „jeszcze 5 sekund widzi dane”, jeśli obiecano natychmiastowe cofnięcie kolejnych żądań.

Nie włączaj HTTP Output Cache dla uwierzytelnionych odpowiedzi na całym API. Jeżeli pojedyncza trasa go potrzebuje, udowodnij partycjonowanie, kontrolę dostępu przed cache i unieważnianie. Nigdy `public` dla prywatnych odpowiedzi.

## 14. SingleFlight i kontrola kosztownych odczytów

W miejscach wykazanego równoległego powtarzania obliczeń połącz identyczne odczyty w jedno zadanie.

Najpierw oceń istniejącą implementację. `HybridCache` może być kandydatem, jeżeli jest zgodny z używaną wersją i potrzebnymi semantykami. Nie dodawaj go wraz z drugim helperem wykonującym to samo.

Wymagania:
- pełna, autoryzacyjnie bezpieczna tożsamość klucza;
- tylko jedno uruchomienie fabryki na tożsamość w danej instancji;
- ponowne sprawdzenie cache przed rozpoczęciem pracy;
- anulowanie jednego oczekującego nie psuje pozostałych;
- kontrolowany budżet czasu oraz reakcja kodu na cancellation;
- po błędzie brak trwałego przechowywania uszkodzonego Task;
- usunięcie tylko tej instancji flightu, nie nowszego zadania pod tym samym kluczem;
- immutable wynik lub bezpieczny model współdzielenia;
- własny czas życia scope/DbContext wspólnej pracy, niezależny od rozłączenia pierwszego HTTP;
- żadnych równoległych operacji na jednym DbContext.

Proces-local SingleFlight/HybridCache nie jest distributed lock. Nie obiecuj jednego obliczenia na całym klastrze. Rozproszona koordynacja tylko, jeśli realnie potrzebna i zmierzona; wykorzystaj wtedy obecną infrastrukturę zadań.

Ogranicz także liczbę RÓŻNYCH kosztownych obliczeń. Walidacja zakresów, budżet kolejki, konkurencja per użytkownik/Team i kontrolowane 429/503 są lepsze niż nieograniczone Task.Run. Limity techniczne nie zmieniają dostępności funkcji Free/Pro.

## 15. Zapis, autosave, lokalne drafty i konflikty

Ujednolić powtarzalny mechanizm, ale nie łącz wszystkich domen w jeden uniwersalny model dokumentu.

Coordinator zapisu ma obsłużyć:
- tożsamość konta, kontekstu, zasobu i oczekiwaną wersję;
- stan dirty/local/syncing/saved/conflict/failed;
- kolejkę kolejnych zapisów i zakończenie obejmujące CAŁĄ kolejkę;
- stabilne ID mutacji i bezpieczne ponowienie po utracie odpowiedzi;
- kontrolowane anulowanie oczekiwania bez zakładania rollbacku już zatwierdzonego zapisu;
- lokalny draft izolowany per konto i dokument;
- odtworzenie pracy po zamknięciu, w ramach obecnego zakresu offline;
- adaptery przechowywania osobne dla web/mobile;
- obsługę 409/412 bez cichego last-write-wins.

Nie scalaj arbitralnie operacji nieprzemiennych. Można coalescować kolejne pełne snapshoty draftu, ale nie zgubić dodania serii, usunięcia elementu czy opublikowania wersji.

`Publish`, `Finish Workout` i inne finalizacje muszą obejmować stan po wszystkich poprzedzających edycjach. Serwer potwierdza spodziewaną wersję. Nie wystarczy `await` dla pierwszego requestu.

Każdy callback po await/confirm sprawdza aktualność lifecycle konta i zasobu przed zmianą UI/storage/nawigacji. Operacja A nie może zostać wysłana tokenem B pobranym z globalnego „aktualnego konta”.

Przy wylogowaniu zatrzymaj nowe mutacje, izoluj/usuń lokalne wrażliwe dane zgodnie z istniejącą polityką i nie odtwarzaj ich po zalogowaniu innego konta. Wznawianie pending operations wymaga ponownego sprawdzenia uprawnień tej samej tożsamości.

Otwarcie potwierdzenia porzucenia zmian nie niszczy draftu. Anulowanie zamknięcia pozostawia interaktywny panel, focus i dane. Respektuj kontrolowany stan właściciela; nie ukrywaj contentu wcześniej przez prywatny wewnętrzny stan komponentu.

Nie implementuj pełnego offline-first synchronizowania całej aplikacji, jeśli nie jest potrzebne do zabezpieczenia bieżącej pracy.

## 16. Jawne przejścia stanów i rozdzielenie decyzji o dostępie

### 16.1. Małe state machines

Spisz i egzekwuj aktualne przejścia osobno dla relacji, usługi, należności, subskrypcji, zgłoszenia, członkostwa, check-inu i analizy. Wykorzystaj proste metody/polityki, nie nowy workflow framework.

`Relationship.Active` nie oznacza `Payment.Paid`. Wyłączone odnowienie nie oznacza utraty już opłaconego okresu. Zakończenie jednej usługi nie kończy pozostałych bez reguły biznesowej.

Weryfikuj reguły w handlerze i wzmacniaj DB constraints, gdzie to właściwe. Operacje zrób retry-safe, współbieżne zmiany kontrolowane. Nie pozwalaj na dowolny `PATCH status` obchodzący reguły.

### 16.2. Cztery odrębne decyzje

Rozdziel:
1. entitlement — czy pakiet/konto obejmuje funkcję;
2. autoryzację — czy wolno działać na tym zasobie teraz;
3. stan operacyjny — czy dana implementacja jest włączona i zdrowa;
4. możliwości urządzenia — czy lokalny runtime/model/format jest obsługiwany.

Decyzje zwracają spójne reason codes i dozwolone akcje. Brak WebGPU nie oznacza konieczności zakupu Pro; Team nie oznacza prawa do prywatnej dokumentacji trenera.

Feature flags nie mogą wyłączać obowiązkowych zabezpieczeń. Ewentualny kill switch wadliwej wersji ML blokuje nowe analizy nią wykonywane, nie historię ani pozostałe funkcje aplikacji. Lokalny klient offline może nie otrzymać flagi natychmiast — udokumentuj tę granicę zamiast obiecywać zdalną natychmiastową kontrolę offline.

## 17. Wspólne typy wartości i kontrola czasu

Wprowadź lub ujednolić tylko typy redukujące realne pomyłki:
- pieniądze z walutą i centralną polityką zaokrągleń;
- pomiar z typem, wartością i jednostką;
- zakres dat i rozróżnienie dnia treningowego od chwili UTC;
- wersja dokumentu;
- identyfikatory/konteksty rozróżniane tam, gdzie często są mylone.

Nie opakowuj każdej zmiennej w nadmiar klas. Dobrze typowany kontrakt może wystarczyć.

Pieniądze: decimal/numeric albo uzgodniona reprezentacja minor units; żadnego float do autorytatywnych rozliczeń. Nie sumuj walut. Zachowaj historyczne kwoty, prowizje, kredyty i źródło Simulated/External. Zmiana planu lub Teamu nie przepisuje przeszłości.

Pomiary: walidacja wartości w jednostce źródłowej przed konwersją, obsługa skrajnych decimal bez overflow/500, test round-trip i zakresów. BF ma właściwą jednostkę procentową; zmiana BF w punktach procentowych to nie procent względny.

Czas: użyj istniejącej abstrakcji zegara lub `TimeProvider`; w testach kontrolowany czas. Oddziel UTC instant, lokalną godzinę wydarzenia, strefę IANA, kalendarzowy miesiąc i dzień cyklu. Nie przyjmuj miesiąca jako 30 dni ani dnia DST jako zawsze 24 godzin.

Testuj strefy, zmianę czasu, koniec miesiąca, rok przestępny, cykle 10-dniowe i moment równoległej płatności/wygaśnięcia. Nie zmieniaj istniejących dat rozliczeń bez jawnej migracji reguły.

## 18. Autoryzacja, dokumenty, sesje i realtime

Refaktor ma wzmacniać istniejące polityki, nie zastępować ich ogólnym `isCoach`.

- Rozdziel tożsamość, aktywną sesję, role, entitlement, kontekst i zasób.
- Reprezentant Teamu ma tylko jawnie udzielony zakres, nie prywatne dane wszystkich członków.
- Sprawdzaj aktualną możliwość akcji przed mutacją i przy odczycie wrażliwym; nie polegaj tylko na stanie strony.
- Polityki działają też wewnątrz aplikacji, nie tylko w middleware REST.
- Powtarzające się kontrole mogą być batched/request-local, ale bez cache uprawnień o nieudokumentowanej zwłoce cofnięcia.
- Nie ufaj edytowalnym Supabase user_metadata, ownerId, recipientId ani kwotom z klienta.
- Nie ujednolicaj modeli dostępu do wszystkich zasobów jedną zbyt szeroką rolą.

Poufne dokumenty: kolejne pobranie ma sprawdzać aktualne udostępnienie przez kontrolowaną ścieżkę. Nie obiecuj cofnięcia już wydanego signed URL bez mechanizmu, który faktycznie go blokuje. Nie obiecuj odebrania pobranej kopii ani bajtów już wysłanych w trwającym pobraniu. Zapewnij private storage, właściwe nagłówki cache i testy po cofnięciu dostępu.

Sesje: zachowaj zatwierdzoną politykę krótkiego JWT i dodatkowej kontroli wrażliwych operacji. Wylogowanie klienta nie jest automatycznie natychmiastowym unieważnieniem każdego wydanego JWT. Nie rozszerzaj tej gwarancji bez implementacji, kosztu i testu. Nie zmieniaj ustawień produkcyjnego Auth podczas refaktoru.

SignalR: sprawdzaj subskrypcje i aktualne uprawnienia po zmianach; grupy socketów same nie są autoryzacją. Powiadomienie dla usuniętego/zablokowanego odbiorcy nie może ujawnić nowej treści. Nie loguj access_token z URL. Nie obiecuj fanout multi-instance bez skonfigurowanego rozwiązania scale-out.

Historyczne read cutoffs dotyczą również preview ostatniej wiadomości, unread, reply preview, załączników i powiadomień, nie tylko głównego endpointu listy wiadomości.

## 19. Transport, odporność i stany frontendu

Ujednolić adaptery REST, realtime oraz zewnętrznych usług w zakresie error mapping, timeout i cancellation. Nie próbuj używać identycznego transportu dla wszystkich platform.

- Rozróżniaj anulowanie użytkownika, timeout, błąd sieci, auth i błąd domenowy.
- Retry ma ograniczony budżet, backoff i jitter, respektuje Retry-After; nie zapętla permanentnych 4xx.
- Mutacje ponawiaj tylko, gdy mają bezpieczną tożsamość operacji i serwerową idempotencję.
- Nie nakładaj retry w kilku warstwach, mnożąc liczbę prób.
- Unikaj `.Result`, `.Wait`, niepotrzebnego Task.Run dla I/O i nieograniczonego `Task.WhenAll`.
- Cancellation przekazuj do I/O; nie pozwalaj, by cleanup po anulowaniu zamaskował oryginalny błąd.
- Anulowanie HTTP nie jest dowodem anulowania zatwierdzonej płatności lub zapisu.

TanStack Query i odpowiedniki:
- centralne fabryki query keys ze wszystkimi semantycznymi filtrami i tożsamością;
- request cache izolowany przy zmianie konta, klienta, Teamu i roli;
- `keepPreviousData` tylko między bezpiecznie zgodnymi widokami, nigdy dane A jako placeholder konta/klienta B;
- URL filters tam, gdzie przydatne; stan ephemeral lokalny;
- po reconnect/restarcie odczyt trwałego stanu, nie wiara w komplet eventów;
- nie odtwarzaj animacji wejścia listy przy każdym refetchu;
- nie nadpisuj niezapisanych formularzy odświeżoną odpowiedzią bez decyzji użytkownika.

UI: zachowaj wygląd i obecne native/bottom-sheet zachowania. Wydziel komponenty/hooki według odpowiedzialności, nie długości pliku. Sprawdź przekazywanie konkretnych title/message błędów, focus, klawiaturę, reduced motion i interaktywność potwierdzeń.

## 20. Lokalne ML: zgodność, kontrola zasobów i źródło wyników

Nie twórz nowego silnika od zera. Przejrzyj obecny pipeline i usuń serwerowe zależności niezgodne z zatwierdzonym kierunkiem tylko po sprawdzeniu odbiorców i danych historycznych.

Wspólne: kontrakt wejścia/wyniku, wersjonowana specyfikacja preprocessingu, kalibracji, jednostek i postprocessingu. Osobne: adaptery iOS, Android, przeglądarki, dekodera i runtime inference.

Model manifest powinien opisywać wersję i hash pliku, format, runtime compatibility, schemat wejścia/wyjścia oraz potrzebne parametry. Manifest pochodzi z zaufanej dystrybucji. Sam hash dostarczony razem z niezweryfikowanym plikiem nie jest dowodem autentyczności.

Zapewnij atomowe pobranie/aktywację modelu, weryfikację integralności, ograniczony cache, bezpieczne odzyskanie po przerwanym pobraniu i możliwość użycia poprzedniej kompatybilnej wersji, jeśli polityka pozwala. Nie pobieraj modeli z dowolnego URL przesłanego przez użytkownika.

Analiza filmu:
- ograniczona pamięć i liczba klatek in flight;
- obliczenia poza głównym wątkiem UI;
- prawidłowe timestamps, orientacja i transformacja współrzędnych;
- rzeczywisty postęp i cancellation, bez fikcyjnych procentów;
- czyszczenie buforów/zasobów GPU;
- kontrola maksymalnego kosztu/rozmiaru oraz konkretna informacja o braku wsparcia;
- brak ukrytego uploadu filmu i brak automatycznego server GPU fallback.

Web Worker/WebGPU/WASM i natywne backendy dobieraj na podstawie działającego modelu oraz wersji SDK. Nie deklaruj kompatybilności tylko dlatego, że biblioteka się importuje. Zweryfikuj nowe zależności i licencje; nie instaluj niepotrzebnych runtime’ów.

Backend waliduje pochodzący z urządzenia wynik: format, zakresy, rozmiar, własność powiązań, wersję i spójność strukturalną. Oznacz źródło jako analizę lokalną. Nie nazywaj go niezależnie zweryfikowanym pomiarem tylko dlatego, że zapis przeszedł walidację.

Telemetry lokalne nie wysyła filmu, klatek ani treści zdrowotnych. Niedostępny model/urządzenie oznacz konkretnie jako brak możliwości wykonania; nie kończ testu fikcyjnym wykresem.

## 21. Telemetria, pomiary i realne budżety

Wykorzystaj istniejące instrumenty. Dla brakujących dodaj mały, standardowy zestaw, nie drugi system logowania. Preferuj istniejące integracje `ActivitySource`, `Meter`, OpenTelemetry i diagnostykę EF/Npgsql. Dobierz API do wersji z repo; nie wymagaj nowej wersji frameworka dla samej telemetrii.

Mierz osobno:
- czas HTTP, błędy i rozmiar odpowiedzi;
- liczby komend DB, czas, połączenia i oczekiwanie na pool;
- obliczenia metryk/generatora;
- cache hit/miss/fallback oraz odbudowę;
- new/shared flights i liczbę różnych aktywnych kosztownych zadań;
- lag outbox, oldest job age, retry, błędy i aktualny backlog;
- autosave conflicts oraz kolejkę niezapisanych mutacji;
- lokalne dekodowanie, inference, postprocessing i synchronizację wyników.

Dla EF/Npgsql używaj dostępnej diagnostyki sterownika, nie HTTP SupabaseTelemetryHandler skopiowanego z RaceTrace.

Propaguj correlation/trace ID między klientem, API, SQL i workerem tam, gdzie to wspierane. Nie utrzymuj jednego otwartego span przez wielodniowe oczekiwanie joba; zachowaj korelację/linki między etapami.

Ogranicz cardinality: bez user/client IDs, surowych query, pełnych URL i treści w tagach metryk. Nie loguj tokenów, signed URLs, danych karty, odpowiedzi formularzy ani treści czatu. Sampling i szczegółowość konfigurowalne.

Nie nazywaj rozmiaru JSON transferem rozliczanym przez Supabase, nie sumuj zagnieżdżonych timerów jako łącznego czasu i nie przedstawiaj czasu HTTP jako samego SQL.

Przygotuj minimalny działający lokalny/dev podgląd telemetryczny lub integrację z istniejącym backendem, kilka paneli i alertów: wzrost błędów/latencji, pool exhaustion, stary outbox, utracone lease, stale artefakty i przeciążenie. Same wywołania `Record` nie oznaczają działającego monitoringu.

Testy wydajności:
- deterministyczne, syntetyczne dane, bez kopiowania danych klientów;
- cold/warm path, małe i większe zestawy, korekty danych;
- realistyczny mix odczytów i zapisów oraz stopniowe obciążenie;
- jawny opis sprzętu, sieci, wersji, datasetu i liczby prób;
- p50/p95/p99 tylko przy odpowiedniej liczbie próbek, błędy, SQL count, pamięć i queue latency.

Test obciążeniowy uruchamiaj lokalnie/na dedykowanym DEV w bezpiecznym budżecie. Nie obciążaj współdzielonego Supabase lub płatnej usługi bez potwierdzenia. Dla braku środowiska przygotuj reprodukowalny harness i oznacz wyniki jako niezmierzone.

Nie przepisuj starych wyników testów RaceTrace lub Metrivum jako świeżych pomiarów. Redukcja 20 requestów do 1 nie oznacza automatycznie 20-krotnego skrócenia latencji.

## 22. Testy zgodności wyników i regresji

Rozszerz obecne testy, nie zastępuj ich samym snapshotem JSON.

Przygotuj fixtures z oczekiwanymi wynikami oraz ścieżkę referencyjną dla kosztownych optymalizacji:
- prywatne i Team Analyze;
- finanse i historyczne prowizje;
- aktywni/unikalni/powracający klienci;
- wykonanie, completion, adherence, e1RM i objętość;
- generator z ustalonym seedem i wejściami;
- zimny/ciepły cache i dane po korekcie;
- read model kontra dane źródłowe;
- lokalne ML na testowych filmach i dostępnych runtime’ach.

Finanse: dokładność według uzgodnionych reguł i zaokrągleń. ML: tolerancje oraz metryki jakości określone na podstawie właściwości pipeline, nie zmieniane tylko po to, by test stał się zielony. Brak modelu/urządzenia nie jest testem zakończonym sukcesem.

Regresje bezpieczeństwa mają testować zarówno dozwolony, jak i zabroniony dostęp. Test z klientem A/B oraz trenerem/Teamem A/B jest ważniejszy niż samo 200 na happy path.

Współbieżność i DB constraints testuj na rzeczywistym PostgreSQL zgodnym z projektem; EF InMemory nie zastępuje takich testów. Race conditions odtwarzaj kontrolowanymi barierami/synchronizacją, nie losowymi sleepami.

Nie zmieniaj oczekiwanych wyników na nowe wyłącznie po to, żeby przejść suite. Świadoma korekta biznesowa/algorytmiczna wymaga osobnego opisu i akceptacji tam, gdzie nie wynika jednoznacznie z ustaleń.

## 23. Kontroler spójności i bezpieczne naprawy

Dodaj lub rozszerz małe narzędzie administracyjne/CLI, działające domyślnie READ-ONLY. Nie jest to globalny publiczny endpoint z dowolnym SQL.

Kontrole, dopasowane do aktualnego schematu:
- Accepted application ma dokładnie właściwą relację i usługę;
- rozliczona należność ma spójną historię i kwoty;
- subskrypcja/okres nie ma zduplikowanych rozliczeń;
- linked group chat odpowiada grupie z uwzględnieniem manual sources, banów i wykluczeń;
- submission wskazuje zachowaną wersję formularza;
- przypisania, sesje i snapshoty programu mają spójne powiązania;
- artefakty wskazują właściwą rewizję/model;
- dokumenty mają oczekiwane obiekty Media/Storage;
- zaplanowane rozwiązanie Teamu nie utknęło w połowie;
- workery/outbox nie zostawiły nierozpoznanych, przeterminowanych ownershipów.

Raport: identyfikator problemu, reguła, zakres, dowód, liczba rekordów i proponowana naprawa. Minimalizuj wrażliwe dane.

Naprawa tylko jawnie przez `--apply`/równoważny tryb, do potwierdzonego środowiska, z ograniczonym zakresem i kontrolą oczekiwanej wersji. Dry run najpierw; powtórzenie bez dodatkowych skutków. Skan nie powinien uznawać dozwolonego, chwilowego stanu procesu asynchronicznego za trwałe uszkodzenie.

Bez zgadywania: narzędzie nie dopisuje zgody klienta, nie udaje potwierdzenia operatora, nie oznacza płatności Paid na podstawie samego istnienia zamówienia i nie zmienia historycznych kwot. Nie wykonuje automatycznego hard delete danych źródłowych.

Może bezpiecznie odbudować pochodny indeks albo wznowić idempotentny proces, jeśli źródło jednoznacznie wyznacza rezultat. Każda naprawa pozostawia audyt.

## 24. Migracje, CI, release i zgodność starszych klientów

### 24.1. Migracje

Kontynuuj istniejące źródło prawdy (np. EF migrations). Nie dodawaj równoległej historii SQL i nie edytuj migracji już zastosowanych.

Możesz przygotować i zastosować niedestrukcyjne zmiany tylko na jednoznacznie potwierdzonym Supabase DEV. Sprawdź project ref, host, historię, środowisko i uprawnienia. Nie wybieraj pierwszego projektu z listy. Przy niepewności wykonaj lokalną część i oznacz zdalną jako zablokowaną.

Nie zmieniaj zarządzanych tabel Auth/Storage/Realtime. Nie włączaj Data API dla wygody. Zachowaj RLS i granty. Zwykłe połączenie Npgsql nie uzyskuje samo `auth.uid()` ze zweryfikowanego JWT. Runtime nie ma wymagać superuser, BYPASSRLS ani DDL.

Dla zmian struktury stosuj expand → backfill → przełączenie odbiorców → późniejszy contract, jeśli potrzebny okres zgodności. Backfill jest batchowany, checkpointowany i odporny na wznowienie. W tej refaktoryzacji nie wykonuj destrukcyjnego końcowego contract bez jawnej zgody i weryfikacji odbiorców.

Testuj upgrade z aktualnej wersji oraz odtworzenie świeżej DB. Oceń koszt locków i sposób budowania indeksów; nie zakładaj, że każda migracja może bezpiecznie działać w jednej transakcji.

### 24.2. CI i odtwarzalność

W ramach faktycznie istniejących projektów ustaw obowiązkowe:
- build, typecheck, lint i istotne testy;
- architecture checks i contract drift;
- testy PostgreSQL oraz migracji;
- krytyczne browser/mobile flows w dostępnym środowisku;
- kontrolę zależności i sekretów;
- testy metryk/parity w odpowiednim zakresie.

Ustal jeden package manager i spójną politykę lockfile’ów dla danej jednostki builda. Nie usuwaj mechanicznie lockfile z niezależnego projektu o innym procesie. Nie zmieniaj wszystkich wersji zależności naraz. Zmiany natywne wymagają sprawdzenia zgodności SDK.

### 24.3. Release i rollback

Udokumentuj release units: DB, API, worker, web, mobile native runtime, JS update, model ML i konfiguracja/feature flags.

Sprawdź walidację konfiguracji przy starcie, sekrety, CORS, zaufane forwarded headers, TLS, history fallback web, readiness/liveness i operacyjne limity. Publiczne health endpointy nie ujawniają konfiguracji; chwilowa niedostępność DB nie powinna powodować bezsensownego restart storm wszystkich instancji.

Włączenie flagi nowej ścieżki wymaga potwierdzonego schematu i kompatybilnych odbiorców. Obecność kodu i migracji nie jest dowodem aktywacji runtime. Nie fallbackuj do ścieżki omijającej zabezpieczenia.

Rollback aplikacji nie może wymagać destrukcyjnego cofnięcia historii finansowej. Zachowaj zgodność starej aplikacji z rozszerzonym schematem albo przygotuj jawny roll-forward plan.

Mobile: utrzymuj udokumentowaną zgodność wspieranych wersji API. EAS Update tylko dla zgodnego native runtime; zmiana natywnego modułu nie jest zwykłym OTA JavaScript. Wersja modelu ML też musi pasować do runtime.

Nie uruchamiaj automatycznego deploy/push. Dodanie workflow do repo nie upoważnia do publikacji. Nie twórz płatnych usług w ramach zadania.

## 25. Odtwarzanie po awarii

Przygotuj i, gdy dostępne zasoby pozwalają, wykonaj test odtworzenia na izolowanym środowisku. Nie na istniejącej bazie DEV z pracą użytkownika.

Oddziel:
- backup danych PostgreSQL;
- obiekty Storage;
- konfigurację, uprawnienia i wymagane sekrety przechowywane bezpiecznie poza repo;
- mapowanie Auth/user IDs i procedurę po migracji/odtworzeniu;
- manifesty modeli i kompatybilne wersje aplikacji.

Kopia bazy nie jest automatycznie kopią plików Storage. Zweryfikuj kompletność rzeczywistą próbą, nie nazwą usługi.

Runbook obejmuje: odtworzenie, migracje, sprawdzenie referencji, logowanie, prywatny dokument, współpracę Team i private, historię finansową, oraz kontrolowane wznowienie workerów.

Po restore zewnętrzne skutki są domyślnie wyłączone do uzgodnienia stanu. Nie wysyłaj masowo zaległych push ani nie próbuj drugi raz pobrać realnych płatności po przyszłym podłączeniu operatora. Stary backup nie dowodzi, że operacja poza nim się nie wydarzyła.

Zapisz zmierzony czas odtworzenia, odtwarzalny zakres i utratę danych wynikającą z częstotliwości kopii. Docelowe RPO/RTO wymagające kosztów przedstaw do decyzji; nie deklaruj nieprzetestowanych gwarancji.

## 26. Retencja, sprzątanie i cykl życia danych

Przygotuj macierz klas danych i mechanizm bezpiecznego sprzątania. NIE ustalaj jednej liczby dni dla całej bazy.

| Klasa | Wymagane podejście |
|---|---|
| Źródłowe wykonania, dokumenty, formularze | Zachowanie historii i aktualnych uprawnień według zatwierdzonej polityki |
| Finanse i audyt zgód | Bez samowolnej retencji ani kasowania w refaktorze |
| Cache, miniatury, pochodne agregaty | Odtwarzalne, z kontrolą referencji i limitami |
| Niedokończone uploady | Weryfikacja lease/aktywności i brak powiązania przed sprzątnięciem |
| Outbox, inbox, idempotency | Retencja uwzględnia maksymalny replay; nie dopuszcza ponowienia dawnych skutków |
| Lokalne modele i bufor klatek | Limit miejsca, kontrolowana wersja, czyszczenie zasobów |
| Lokalne drafty | Rozdzielenie konta, odzyskiwanie i zachowanie przy logout zgodnie z polityką |

Sprzątanie jest batchowane, obserwowalne, posiada dry run i nie ściga się z kończącym się uploadem/publikacją. Nie kasuj kluczy deduplikacji, a następnie odtwarzaj starych eventów jak nowych.

Dla kategorii bez ustalonej retencji przygotuj konfigurację i decyzję do zatwierdzenia; nie usuwaj danych domyślnie. Bezpieczne wygasanie wyłącznie odtwarzalnych artefaktów można wdrożyć z jasnym zakresem i testami.

## 27. Macierz testów przekrojowych — kryteria akceptacji

Poniższe scenariusze mają zostać przypisane do istniejących lub nowych testów. Nie wystarczy deklaracja „unit tests passed”.

### Architektura i kontrakty
- Naruszenie wybranej granicy modułów powoduje błąd CI.
- Czysty export kontraktów nie uruchamia workerów ani sieci produkcyjnej.
- Zmiana wire DTO powoduje wykrycie rozjazdu klienta/schema.
- Nieznany wariant odczytu nie ujawnia danych ani nie wysypuje całej aplikacji; krytyczna mutacja jest bezpiecznie odrzucona.

### Obliczenia i cache
- Te same wejścia dają zgodne wartości we wszystkich ekranach/endpointach.
- Poprawa wykonania zmienia wynik Progress po właściwej rewizji.
- Stary in-flight wynik nie nadpisuje nowego.
- Nowa wiadomość nie invaliduje niepowiązanych finansów.
- Ciepły i zimny cache respektują identyczny dostęp i definicję metryki.
- Obcy Team/account nie dzieli prywatnego cache/flightu.
- Anulowanie pierwszego HTTP nie zwalnia przedwcześnie scope wspólnej pracy.
- Awaria flightu dopuszcza późniejszą próbę, a różne filtry mają ograniczoną konkurencję.

### Zapisy, joby i integracje
- Przerwanie importu nie ujawnia częściowego programu.
- Odczyt podczas publikacji widzi kompletną starą albo nową wersję.
- Awaria po biznesowym commit nie gubi eventu outbox.
- Awaria po efekcie odbiorcy nie powoduje zdublowania efektu przy retry.
- Worker ze starym fencing tokenem nie publikuje.
- Stary event członkostwa nie odwołuje nowego bana.
- Równoległa płatność, akceptacja Leada i odnowienie nie duplikują rekordów.
- Przeliczenie z nowym input/config nie jest blokowane przez błędnie zbyt ogólny klucz ukończonego joba.

### Konto, draft i zasoby
- Finish/Publish czeka na wszystkie wcześniejsze edycje.
- Timeout po commit + retry nie tworzy duplikatu.
- Account switch podczas await/confirm nie wykonuje mutacji ani zmian UI w kontekście innego konta.
- Konflikt dwóch edycji nie jest cicho nadpisywany.
- Odrzucone zamknięcie zachowuje draft, focus i interaktywny bottom sheet.
- Removed chat member nie dostaje nowej treści także przez preview/unread/attachment/notification.
- Cofnięcie udostępnienia blokuje nowe autoryzowane pobranie, w granicach rzeczywiście wdrożonego mechanizmu.

### Liczby, czas i raporty
- Prowizje i kredyt Pro→Team zgodne z zapisanymi warunkami; dawne kwoty nie zmieniają się po zmianie planu.
- Klient w kilku grupach/usługach nie duplikuje total unique clients.
- Historia sprzed transferu nie staje się automatycznie Team revenue.
- Daty i recurrence poprawne na końcu miesiąca, DST i cyklu 10 dni.
- Extreme input konwersji daje walidację, nie overflow.
- Niepełny zakres danych jest jawny, nie „pełnym” wykresem.

### ML, awarie i wdrożenie
- Wynik realnego modelu porównany na dostępnym web/iOS/Android w zadeklarowanej tolerancji.
- Nieprawidłowy/hash-mismatched albo niekompatybilny model nie aktywuje się.
- Brak akceleratora nie uruchamia serwera ML.
- Nieautoryzowany lokalny wynik nie może zostać przypięty do cudzej serii.
- Dry-run kontrolera spójności nie zmienia DB.
- Naprawa odtwarzalnego read modelu jest powtarzalna i audytowana.
- Migracja zachowuje dane i starszy obsługiwany kontrakt.
- Restore nie uruchamia niekontrolowanych skutków zewnętrznych.
- Cleanup nie usuwa aktywnego uploadu ani pozwala na podwójne rozliczenie przez usunięcie deduplikacji.

Testy platform wymagające urządzeń/credentials oznacz jako niewykonane, jeśli infrastruktury brak. Nie przedstawiaj ich jako zielonych mocków.

## 28. Kolejność wdrożenia i kontrola zakresu

Nie realizuj całego dokumentu jako jednej nieprzeglądalnej zmiany. Zachowaj checklistę postępu i osobne logiczne diffy/checkpointy. Commity zgodnie z polityką repo i upoważnieniem; bez cudzych plików i bez push.

| Kamień milowy | Wynik |
|---|---|
| M0 — Inwentaryzacja i baseline | Mapa rzeczywistego kodu, reguły biznesowe, pomiary/testy zastane, priorytety i plan |
| M1 — Granice i kontrakty | Testy architektury, uporządkowane zależności, bezpieczne DTO, wspólne błędy i contract CI |
| M2 — Bezpieczny zapis | Autosave, konflikty, staging/publikacja i integralność krytycznych operacji |
| M3 — Integracje i workery | Outbox/inbox, dzierżawy/fencing, deduplikacja, retry i poprawność dostępu |
| M4 — Obliczenia i odczyty | Wspólne metryki, provenance, poprawione SQL, testy parity i telemetry baseline |
| M5 — Uzasadniona optymalizacja | Rewizje/cache/SingleFlight/read models tylko w miejscach wykazanego kosztu, testy świeżości i limity pracy |
| M6 — Web/mobile i lokalne ML | Ujednolicone adaptery, lifecycle kont, kompatybilność runtime/modelu i regresje UX |
| M7 — Eksploatacja i domknięcie | Kontroler spójności, CI/release, restore, retencja, alerty i raport końcowy |

Krytyczne luki bezpieczeństwa i utraty danych napraw wcześniej, jeśli ujawnią się na dowolnym etapie. Minimalny pomiar/telemetrię wprowadź przed konkretną optymalizacją, a nie dopiero po niej.

Dla każdego milestone:
1. wskaż przyczynę i dotknięte granice;
2. dodaj test/baseline;
3. wdrażaj najmniejsze spójne rozwiązanie;
4. uruchom testy i porównanie;
5. zaktualizuj kontrakty/docs i checklistę;
6. usuń zbędną starą ścieżkę tylko po sprawdzeniu odbiorców.

Jeżeli kończy się kontekst/czas wykonania, zapisz w repo dokładny checkpoint: ostatni zweryfikowany stan, zmiany niezweryfikowane, polecenia testów i następny krok. Nie oznaczaj całego zakresu jako ukończonego.

Brak modelu ML, urządzenia, sekretu albo potwierdzonego DEV blokuje tylko daną weryfikację/integrację. Nie usprawiedliwia porzucenia pozostałych niezależnych poprawek ani tworzenia atrap w produkcyjnej ścieżce.

## 29. Dokumentacja i wynik końcowy

Dopasuj lokalizację do repo, np. `docs/refactor/system-hardening/`:
- `plan.md` — etapy i checklista wszystkich obszarów;
- `source-map.md` — inspiracje RaceTrace vs propozycje Metrivum vs ustalenia z kodu;
- `decisions.md` — konkretne decyzje techniczne i otwarte biznesowe;
- `metrics.md` — definicje, źródła i wersjonowanie;
- `consistency.md` — publikacja, outbox, idempotencja i granice gwarancji;
- `benchmarks.md` — reprodukowalne przed/po z warunkami;
- `operations.md` — uruchomienie, konfiguracja, alerty, backup/restore i naprawy;
- `report.md` — co zmieniono, sprawdzono, włączono i co pozostało.

To propozycja organizacji, nie obowiązek tworzenia pustych plików. Rozszerz istniejącą dokumentację, jeżeli już ma właściwe miejsce.

Krótki `AGENTS.md` ma wskazywać najważniejsze granice, zakaz cichych zmian reguł i polecenia testów. Nie przenoś całego tego dokumentu do każdej instrukcji startowej agenta.

Raport dla każdej poprawki:
- problem i dowód;
- przyczyna źródłowa;
- mechanizm i miejsca wykorzystania;
- zmienione pliki/kontrakty/migracje;
- testy i dokładne wyniki;
- pomiar, jeśli deklarujemy poprawę wydajności;
- koszt/kompromis i pozostałe ograniczenia;
- status aktywacji w środowisku.

Rozdziel:
`IMPLEMENTED`, `TESTED`, `APPLIED TO DEV`, `ENABLED IN DEV`, `PREPARED NOT APPLIED`, `ALREADY SATISFIED`, `NOT JUSTIFIED BY MEASUREMENTS`, `BLOCKED`, `DEFERRED BUSINESS DECISION`.

Nie twierdź, że:
- kod w repo oznacza wdrożenie;
- migracja oznacza włączenie flag;
- build oznacza test prywatności lub prawdziwą analizę filmu;
- lokalny test jest benchmarkiem produkcyjnym;
- mniej requestów automatycznie oznacza proporcjonalne przyspieszenie;
- lease/outbox zapewnia exactly-once wszystkich skutków;
- sam hash zapewnia odtworzenie lub autentyczność;
- obecność polityki oznacza faktyczne odebranie już pobranych danych.

Wynik ma być rzeczywistą poprawą istniejącego Metrivum: mniej powielonej logiki i obejść, jasne kontrakty, bezpieczne zapisy, testowalne reguły, przewidywalne obliczenia, kontrolowany koszt i możliwość odzyskania działania po awarii.

## 30. Materiały pomocnicze i weryfikacja wersji

Główny materiał źródłowy: `RACETRACE_ARCHITECTURE.md`, w szczególności sekcje 5.3, 6.1/6.9, 7–12, 13.2/13.6, 15 i 18. Dodatkowe wymagania tej specyfikacji są propozycjami dostosowania do Metrivum, nie potwierdzeniem kodu RaceTrace.

Przed użyciem konkretnego API lub nowej zależności sprawdź jej dokumentację dla wersji faktycznie użytej w projekcie. Przykładowe oficjalne punkty odniesienia:

```text
EF Core — odczyty i ich koszt:
https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying

HybridCache — zakres współdzielenia pracy i klucze:
https://learn.microsoft.com/en-us/aspnet/core/performance/caching/hybrid

Outbox, eventy i idempotentne skutki:
https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events

Supabase — zakres backupu:
https://supabase.com/docs/guides/platform/backups

Expo — zgodność runtime aktualizacji:
https://docs.expo.dev/eas-update/runtime-versions/
```

Materiały Microsoft opisujące eventy w architekturze mikroserwisowej są źródłem mechanizmu, nie poleceniem przejścia Metrivum na mikroserwisy. Nie instaluj wszystkich bibliotek wymienionych jako kandydaci.
