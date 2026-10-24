# Metrivum — aplikacja mobilna React Native, natywne UI i lokalna analiza ML

## 1. Zadanie i nadrzędne decyzje

Rozwijasz ISTNIEJĄCE repozytorium Metrivum. Zaimplementuj aplikację mobilną na iOS i Android w React Native + Expo + TypeScript, korzystającą z obecnego ASP.NET Core API, Supabase Auth i istniejących modeli biznesowych.

To zadanie implementacyjne, nie wykonanie makiety. Dostarcz działające przepływy, kod, kontrakty, testy i dokumentację. Pracuj w spójnych, odbieralnych etapach, zgodnie z instrukcjami repozytorium.

Najważniejsze wymagania:

1. **Minimalna stylizacja.** Ostateczny wygląd przygotuje później właściciel projektu. Nie projektuj nowej marki, ozdobnych ekranów ani rozbudowanych animacji.
2. **Pełna dbałość o architekturę UI/UX.** Nawigacja, komponowanie ekranów, formularze, stany operacji, dostępność i ochrona niezapisanej pracy mają działać od początku.
3. **Własna cienka biblioteka UI mobile i lokalny system motywów.** Zmiana kolorów, typografii lub wyglądu komponentu ma później wymagać zmiany w odpowiednim miejscu, a nie na kilkudziesięciu ekranach.
4. **Natywne zachowania platform.** iOS: rzeczywisty Liquid Glass, natywna nawigacja, menu i panele tam, gdzie pozwala na to zweryfikowany SDK. Android: jego własne komponenty i zachowania, nie imitacja iPhone'a.
5. **Lokalna analiza ML wideo w mobile i web.** Telefon analizuje na telefonie. Istniejąca aplikacja webowa analizuje w przeglądarce użytkownika. Nie na serwerze ASP.NET, nie w chmurze i nie przez lokalny serwer Python wymagany od użytkownika.
6. **Płatności wyłącznie przez istniejący web.** W mobile nie ma checkoutu, `Confirm payment`, dodawania karty ani WebView z płatnością.
7. **Jedna logika biznesowa.** Mobile korzysta z obecnych usług API; nie twórz drugiego systemu współprac, uprawnień, treningów czy płatności.

Ta specyfikacja zastępuje wcześniejsze wykluczenie lokalnej analizy ML z mobile. Zastępuje również wcześniejsze wymaganie kierowania nowych analiz webowych do serwerowej kolejki GPU. Historycznych wyników nie wolno usuwać.

Nie implementuj Fluttera, aplikacji w WebView ani kopii webowego layoutu przeniesionej na telefon.

## 2. Audyt i sposób wykonania

Przeczytaj AGENTS.md, CLAUDE.md, dokumentację modułów, obecne API/OpenAPI, testy i historię migracji. Sprawdź git status; zachowaj cudze i niepowiązane zmiany.

Zweryfikuj, co rzeczywiście działa. Wcześniejsze prompty nie są dowodem implementacji. Sprawdź szczególnie:
- Accounts, role Coach/Client i przełączanie kont;
- Access, Team i prywatne/organizacyjne współprace;
- Training: przypisania, rewizje, wykonanie i raporty;
- formularze, check-iny, oferty, Leads i Invitations;
- Messaging, SignalR, Notifications, Calendar;
- Media/Storage oraz dokumentację i pomiary klienta;
- istniejący frontend webowy, klient API i bibliotekę UI;
- źródła rzeczywistego silnika analizy, jego modele, wagi i pipeline.

Zapisz mapę ekran → operacja API → uprawnienia → obecny stan integracji. Brak kontraktu oznacz konkretnie, nie zastępuj go produkcyjnym mockiem.

Możesz rozszerzać web, backend i bazę DEV, gdy jest to potrzebne do tych funkcji. Nie przebudowuj innych modułów dla wygody mobile. Zachowaj publiczne kontrakty lub wprowadź jawnie kompatybilne rozszerzenie.

Na początku opisz krótkie decyzje architektoniczne i kolejność etapów. Nie kończ na audycie; wykonaj uzgodniony zakres z testami. Zewnętrzny blocker dotyczy konkretnej funkcji, nie powinien zatrzymać niezależnej pracy.

## 3. Stack i środowisko

- React Native + Expo + TypeScript strict.
- Expo Router i natywne stosy nawigacji; natywne tabs, jeśli ich zweryfikowany status i API w wybranym SDK są odpowiednie.
- Development builds z własną natywną aplikacją, nie założenie, że całość musi działać w Expo Go.
- TanStack Query dla stanu serwerowego, zgodnie z obecnymi wzorcami webu tam, gdzie są przenośne.
- Istniejący generowany klient OpenAPI albo jego platform-neutralny rdzeń.
- Supabase Auth z adapterem bezpiecznego lokalnego storage.
- Trwały, ograniczony zapis roboczy w SQLite lub istniejącym równoważnym mechanizmie.
- SignalR w pierwszym planie i push jako osobny kanał dostarczania.

Sprawdź aktualną dokumentację, licencje i kompatybilność RN/Expo/natywnych pakietów. Dobierz spójne wersje, zachowaj lockfile i manager pakietów repo. Nie wybieraj beta/nightly tylko dla numeru wersji.

Native-tabs i inne nowe API mogą mieć różny status w różnych SDK. Izoluj integrację; dokumentuj rzeczywiście użyty wariant i ograniczenia. Nie obiecuj, że wszystkie natywne API są stabilne i identyczne na obu systemach.

Przy własnym kodzie natywnym użyj lokalnego Expo Module/config pluginu albo równoważnego, odtwarzalnego mechanizmu. Zmiany nie mogą znikać po ponownym generowaniu projektów iOS/Android. Ustal jedną strategię zarządzania kodem natywnym.

Przygotuj profile local/dev/preview. Bez automatycznego zakładania płatnych usług lub publikowania w sklepach. Udokumentuj Android build i wymagane środowisko macOS/Xcode lub zdalny build dla iOS. Brak kompilacji iOS musi być oznaczony jako niezweryfikowany, nie zaliczony przez typecheck.

## 4. Struktura repo i granice

Dopasuj ścieżki do istniejącego monorepo. Przykład odpowiedzialności:

```text
apps/
  web/                              # obecny React web; zachowaj layout
  mobile/
    src/
      app/                          # pliki tras i składanie navigatorów
      features/
        auth/
        today/
        training/
        clients/
        check-ins/
        messaging/
        calendar/
        documentation/
        video-analysis/
        settings/
      infrastructure/
        session/
        networking/
        persistence/
        notifications/
    modules/
      trainflow-analysis/           # tylko gdy potrzebna natywna integracja
packages/
  ui-web/                           # nie importować do mobile
  ui-mobile/
    src/
      theme/
      components/
      platform/
      feedback/
  api-client/                       # istniejący odpowiednik; bez DOM/sekretów
  shared-contracts/                 # tylko faktycznie wspólne typy/reguły
  analysis-core/                    # kontrakt i przenośna logika analizy
  analysis-web/                     # Worker, decoder, runtime przeglądarki
  analysis-mobile/                  # adapter do natywnego pipeline'u
```

Nie twórz pustych pakietów ani drugiego klienta API, jeśli obecny można bezpiecznie dostosować. Nazwy są wzorcem, nie obowiązkiem reorganizacji całego repo.

Zasady:
- Ekran składa komponenty i korzysta z hooków/usług konkretnej funkcji. Nie zawiera transportu HTTP, integracji Storage ani inferencji modelu.
- Biblioteka UI nie zna Supabase, tokenów, `RelationshipId`, checkoutu ani endpointów.
- Współdzielone pakiety nie importują `window`, DOM, React Native ani storage konkretnej platformy, chyba że są jawnym adapterem tej platformy.
- Web nie może przypadkowo bundlować natywnego runtime ML; mobile nie może importować browserowego Workera.
- Współdziel typy, klienta API i rzeczywiście przenośną logikę, nie komponenty DOM/CSS.
- Reguły właściciela, Teamu, uprawnień i formuł treningowych nadal rozstrzyga API.
- Nie duplikuj każdego ekranu na `.ios` i `.android`. Oddzielaj platformowo tylko elementy, które faktycznie różnią się zachowaniem.

## 5. Minimalny wygląd, gotowy fundament stylowania

Nie projektuj teraz finalnego designu. Wystarczą czytelny systemowy font, neutralne powierzchnie, poprawny kontrast, sensowne odstępy i działające native controls.

Utwórz jawne, typowane tokeny mobile:
- semantyczne kolory: background, surface, text, mutedText, border, accent, success, warning, danger, disabled;
- spacing, typography, radius, rozmiary ikon/obszarów interakcji;
- elevations/overlays, motion i semantyczne warianty komponentów;
- motyw light/dark/system z jednego miejsca.

Wartości konkretnych kolorów i rozmiarów trzymaj w motywie/tokenach. Nie dodawaj przypadkowych hexów i odstępów w ekranach. Preferuj kolory systemowe i domyślne materiały, gdy pasują do native UI.

Nie twórz synchronizacji design tokens z webem. Mobile ma własny motyw, niezależny od webu. Nie zmieniaj istniejącej stylizacji webowej w tym zadaniu.

Nie dodawaj ozdobnych gradientów, własnych shaderów szkła, rozbudowanych ilustracji, nowego logo, eksperymentalnych animacji i tygodni pracy nad cieniami. Nie wprowadzaj kilku systemów stylowania naraz.

Architektura powinna pozwolić później zmienić np. wygląd Button, ListItem lub powierzchni panelu w ich implementacji/motywie, bez przepisywania logiki ekranów.

## 6. Własna biblioteka UI mobile i natywne adaptery

Twórz komponenty w miarę ich używania, bez katalogu pustych wrapperów.

Bazowy zakres: Screen, Text, Heading, Button, IconButton, Field, TextInput, NumberInput, ListItem, Section, Badge, EmptyState, ErrorState, LoadingState, ConfirmDialog, Sheet, ContextMenu, SearchField, DateTimePicker i Toast.

NativeTabBar i nawigację oprzyj na systemowym navigatorze. Biblioteka może dostarczać jego konfigurację, nie musi opakowywać całego routera.

Każdy komponent ma przewidywalne API, stan disabled/loading/error, etykiety dostępności i sensowne warianty. Nie twórz wielkiego `UniversalComponent` z dziesiątkami niepowiązanych propsów.

### iOS

- Używaj rzeczywistych natywnych pasków, stosów, menu kontekstowych i prezentacji modalnych, nie HTML w WebView.
- Dla Liquid Glass preferuj `expo-glass-effect` i natywny systemowy tab bar/header tam, gdzie wybrany SDK to obsługuje.
- Sprawdzaj runtime i build availability. Samo porównanie wersji iOS może nie wystarczyć.
- Respektuj Reduce Motion, Reduce Transparency i skalowanie tekstu.
- Na nieobsługiwanym iOS stosuj czytelny systemowy materiał/nieprzezroczystą powierzchnię. Brak szkła nie blokuje funkcji.
- Native context menu może korzystać z `@expo/ui`/SwiftUI albo innej utrzymywanej natywnej integracji. Zachowanie sprawdź w faktycznym buildzie.
- Dodaj delikatną haptykę dla istotnych działań, bez reakcji na każde wpisane pole.

### Android

- Użyj właściwych menu, paneli, pickerów, zachowania Back i dostępnych komponentów Material/Jetpack Compose albo natywnych odpowiedników.
- Nie imituj Liquid Glass i nie wymagaj efektu iOS do używania aplikacji.
- Testuj zamykanie klawiatury i paneli przed wyjściem z ekranu.

`@expo/ui` jest kandydatem do elementów SwiftUI/Compose, nie obowiązkiem budowania każdego wiersza w oddzielnym natywnym Host. Zwykłe komponenty React Native są właściwe dla wielu elementów. Wybierz spójny, mały zestaw integracji.

Dodaj developerską stronę katalogu komponentów z przykładami stanów, obu motywów i długich etykiet. Storybook RN jest opcją, gdy już pasuje do repo; nie buduj osobnej platformy dokumentacyjnej kosztem funkcji.

## 7. UX i nawigacja

Dwa konteksty na jednym koncie: Coach oraz Client. Maksymalnie trzy niezależne zapamiętane konta. Przełączenie roli nie jest zmianą tożsamości.

Client tabs: Today · Plans · History · Messages · More.
Coach tabs: Today · Clients · Messages · Calendar · More.

Pod More: Progress/Check-ins/Video Analysis/Team/Profile/Settings zależnie od roli i API. Video Analysis nie musi zajmować szóstego taba.

Clients zawiera wewnętrzne widoki Clients, Leads, Invitations, Groups. Zachowaj osobne stosy nawigacji oraz poprawne przywracanie kontekstu.

Ekran wykonania treningu może otwierać się poza głównymi tabami dla większej przestrzeni. Sprawdź sprzętowe/systemowe Back, gest cofania i powrót do rozpoczętej sesji.

Na telefonie nie kopiuj prawego desktopowego drawera: szczegóły check-inu i płatności pokazuj jako odpowiedni sheet lub pełny ekran. Semantyka pytań, odpowiedzi i akcji pozostaje ta sama.

Zapewnij: safe areas, klawiatury numeryczne, EN/PL i separatory liczb, scroll-to-error, dostępność VoiceOver/TalkBack, wystarczające obszary dotyku, stan operacji i ochronę draftów. Wyjście z panelu z niezapisanymi zmianami nie może zamknąć go przed decyzją użytkownika.

## 8. Funkcje klienta

### Today i plany

Pokaż dzisiejsze sesje, Continue Workout, nadchodzące wydarzenia i check-iny. Obsługuj kilku trenerów i kilka aktywnych programów; zawsze czytelnie pokazuj ich kontekst.

Podgląd programu: bloki, cykle dowolnej obsługiwanej długości, dni, ćwiczenia, serie, zakresy, %1RM, RPE/RIR, tempo, czas, dystans, superserie/obwody i notatki. Nie upraszczaj kontraktu do samych sets/reps/weight.

Klient nie edytuje programu źródłowego. Korzysta z zaleceń i wyliczeń API.

### Workout Execution — najwyższy priorytet UX

Start/wznowienie, odhaczanie serii, edycja faktycznych parametrów, dodawanie/usuwanie serii wykonania, zamiana/pominięcie ćwiczenia, notatki i załączniki. Rest timer i zakończenie sesji z możliwością późniejszej korekty.

Wyraźnie odróżniaj planned i performed. Aktualizacja programu nie może zmieniać snapshotu rozpoczętej lub ukończonej sesji.

Zapisuj lokalny draft podczas pracy i synchronizuj z API. Pokaż osobno Saved locally, Syncing, Saved to server i Sync error. Nie oznaczaj sesji jako wysłanej, gdy pozostała tylko na urządzeniu.

Autosave ma jedną kolejkę dla danego wykonania, idempotencję i kontrolę wersji. Finish czeka na wszystkie zapisy, nie tylko ostatnie żądanie. Błąd lub konflikt nie może skasować lokalnego draftu.

Timer bazuje na czasie zakończenia przerwy, a nie na liczbie ticków JS; blokada ekranu nie może go rozregulować. To nie gwarantuje działania całej aplikacji w tle.

### Historia i progres

Lista Completed/Skipped/Missed/InProgress/Scheduled według API; filtry po okresie i programie, szczegóły i edycja wykonania. Wykresy ciężaru, e1RM, masy, BF i regularności pochodzą z rzeczywistych rekordów, nie zaleceń.

### Check-iny

Wypełnianie wszystkich istniejących typów pytań, pliki, lokalny draft, wysłanie, odpowiedź trenera i historia. Walidacja rozstrzygająca jest na backendzie, dla właściwej wersji formularza.

## 9. Funkcje trenera

Today: podsumowanie klientów, Leads, zaległych i nieprzejrzanych check-inów, ostatnich treningów i wydarzeń. Nie buduj pełnego Analyze mobile.

Clients: lista, filtry, wyszukiwanie i szczegóły. Leads: oferta/warunki, odpowiedzi formularza, accept/reject. Invitations: wybór użytkownika przez uprawniony kontrakt, istniejącej oferty i wariantu, wysłanie i wycofanie; bez hurtowej enumeracji prywatnych kont.

Groups: podgląd, dodawanie/usuwanie członków i przejście do czatu. Programy: podgląd oraz przypisywanie istniejących programów klientowi/grupie z datą startu, bez pełnego Program Buildera.

Check-in management: wybór gotowego formularza, przypisanie jednej osobie/wybranym/grupie, jednorazowo lub obsługiwany harmonogram, odpowiedzi, prywatna notatka, client-visible response oraz Mark as Reviewed. Samo otwarcie nie oznacza przeglądu.

Calendar: podgląd i tworzenie prostych wydarzeń, uczestnicy, RSVP, zmiana/odwołanie według istniejącego kontraktu. NoResponse nie jest Accepted. Nie przebudowuj silnika cykliczności ani nie utożsamiaj spotkania z wykonanym treningiem.

Team: własna organizacja, członkowie, zaproszenia i podstawowy podgląd dopuszczony przez uprawnienia. Bez zakupu seats, przenoszenia własności i zaawansowanej administracji. Prywatni klienci nie stają się widoczni Ownerowi przez sam login mobilny.

## 10. Client Details na mobile

Zachowaj sześć obszarów: Overview, Activity, Progress, Profile, Documentation, Check-ins. Przełączanie wewnętrzne nie oznacza sześciu dodatkowych głównych tabów.

Wspólny nagłówek: avatar, imię, username, status, Private/Team, przypisany trener, Message i uprawnione akcje. **Bez daty rozpoczęcia współpracy w nagłówku.** Data może pozostać w Overview.

- Overview: współpraca, wszystkie aktywne przypisania programów, usługi/oferty, grupy, podsumowanie check-inów i dostęp do historii płatności read-only.
- Activity: harmonogram i rzeczywiste treningi, szczegóły zalecenia/wykonanie, notatki i pliki.
- Progress: filtry czasu/programu/ćwiczenia według znaczenia metryk. Ręczne pomiary masy/BF/obwodów z datą i jednostką. Wyniki liftów wyłącznie z wykonania.
- Profile: aktualne dozwolone dane konta oraz oddzielne, historyczne odpowiedzi zgłoszeń.
- Documentation: zdjęcia, pliki i prywatne notatki zgodnie z uprawnieniami; nie publiczne URL-e.
- Check-ins: lista, przypisania, szczegóły w sheet/fullscreen, odpowiedzi i akcje przeglądu.

Nie twórz drugiej kopii danych tych modułów w mobilnym modelu klienta.

## 11. Sesje, bezpieczeństwo i lokalne dane

Supabase SDK obsługuje logowanie, rejestrację, email confirmation, reset, OTP i refresh zgodnie z konfiguracją projektu. Biznesowe API przez ASP.NET, bez `supabase.from(...)` do tabel aplikacji.

Tokeny przechowuj w bezpiecznym adapterze Keychain/Keystore, np. SecureStore. Obsłuż błędy rozmiaru payloadu i lifecycle kluczy; nie zakładaj, że dowolnie długi JSON sesji zawsze można zapisać jednym wpisem. Nie wpuszczaj sekretów serwerowych do EXPO_PUBLIC_*.

Każde zapamiętane konto ma osobny namespace sesji, draftów, prywatnych plików, cache zapytań i zadań analizy. Capture identity przy rozpoczęciu operacji: jej późny rezultat nie może zapisać danych na nowym koncie.

Przy zmianie konta/wylogowaniu: odłącz SignalR, zablokuj/wyczyść kontekst ekranów, zatrzymaj lub bezpiecznie odseparuj analizę, anuluj stare odczyty, zabezpiecz drafty i skoryguj rejestrację push. Zapytania i token refresh nie mogą przełączać użytkownika bez jego działania.

Lokalne kopie wrażliwych danych ogranicz do niezbędnych draftów/cache, z udokumentowanym szyfrowaniem, kluczem poza bazą i polityką czyszczenia/backupów systemowych. Nie przechowuj pełnej kartoteki wszystkich klientów offline.

Cofnięcie dostępu blokuje nowe odczyty/pobrania; aplikacja ma usuwać swój cache po wykryciu utraty dostępu. Nie obiecuj odebrania kopii już wyeksportowanej przez użytkownika.

Deep link z logowania lub push prowadzi przez sprawdzenie sesji, konta i uprawnienia. Nie przyjmuj dowolnego return URL ani callbacku przypisanego do innej próby logowania.

## 12. Dane serwerowe i ograniczony tryb roboczy

HTTP transport ma wstrzykiwaną bazę URL, token bieżącego kontekstu, AbortSignal i obsługę ProblemDetails. Nie wysyła JWT do adresu wybranego pliku/modelu.

Klucze TanStack Query zawierają konto, rolę/kontekst i Team tam, gdzie zmienia to zakres. API i policy evaluator nadal są źródłem prawdy. Wykorzystaj obecne capabilities, bez `if plan === 'Pro'`.

Listy mają server-side search/filtry/paginację; nie pobieraj całej historii przed wyświetleniem. Refetch nie nadpisuje niezapisanych formularzy. Mutacje mają idempotencję i konflikty wersji zgodne z API.

Nie budujemy pełnego offline. Dopuszczamy chroniony zapis draftu treningu/check-inu i lokalny wynik analizy. Operacje wymagające świeżej autoryzacji, np. accept Lead, wymagają online. Nie kolejkować automatycznie w tle wszystkich działań administracyjnych.

Przy wznowieniu synchronizacji rewaliduj uprawnienia i wersję. Rejected/Forbidden/Conflict to nie sukces i nie powód do usuwania lokalnej pracy bez ostrzeżenia.

## 13. Czat, załączniki i push

Wykorzystaj istniejący Messaging API i historię PostgreSQL. Tekst, reply, zdjęcia, pliki, nagrania wideo i głosówki, read/unread, typing, message requests, block/report. Bez calls/WebRTC/LiveKit.

Voice message: nagrywanie za zgodą użytkownika, plik audio, upload, zapis wiadomości. Sprawdź faktyczne MIME/codeci na iOS i Android, a nie tylko rozszerzenie. Nagrywanie i upload mają przerwanie, limity i prawdziwy stan błędu.

SignalR obsługuje aktualizacje w aktywnej aplikacji; po reconnect pobierz brakującą historię. Zweryfikuj używanego klienta SignalR w React Native, transport, refresh JWT i sanitizację logów, zamiast zakładać pełną zgodność wersji webowej.

Rozszerz istniejące Notifications o transport mobilny: Expo Push Service/APNs/FCM według jednej udokumentowanej strategii. Rejestruj urządzenie i wiązania z autoryzowanymi kontami, obsługuj token rotation, receipts/błędy i unieważnienie po logout. Nie zakładaj jednego device token = jedno konto na zawsze.

Push nie jest źródłem danych ani potwierdzeniem przeczytania. Payload minimalny, bez prywatnych odpowiedzi, podpisanych URL-i i treści zdrowotnych. Domyślnie nie ujawniaj szczegółów na lockscreenie. Otwarcie powiadomienia innego konta wymaga kontrolowanego przełączenia lub logowania.

Respektuj preferencje oraz suppress notification dla aktualnie otwartej rozmowy. Nie oznaczaj wiadomości jako read wyłącznie dlatego, że dostarczono push. Brak zgody na push nie blokuje czatu i historii.

## 14. Płatności i zakresy pominięte

Mobile pokazuje tylko aktualny plan, okres, usługi, należności i historię, do których konto ma dostęp. Nie wywołuje zakupu, potwierdzenia płatności ani odnowienia. Nie dodawaj automatycznych CTA lub WebView do zewnętrznego checkoutu. Zachowaj webowy Billing, łącznie z symulacją transakcji.

Sprawdź aktualne zasady sklepów przed publikacją i opisz release checklist. Brak checkoutu nie jest automatyczną gwarancją akceptacji marketplace przez sklep. Nie utrudniaj wymaganej obsługi konta/prywatności/usunięcia konta — wykorzystaj istniejący proces albo oznacz konkretny brak wydania.

Poza mobile: pełny Program Builder, generator programów, kreator formuł/formularzy, edytor ofert, pełne finansowe Analyze, admin Teamu, dieta, rozmowy audio/video i MCP. Nie dodawaj martwych pozycji menu.

## 15. Lokalna analiza — co oznacza wymaganie

Analizujemy nagrany film, nie wymagamy live inference podczas nagrywania.

```text
MOBILE
film na telefonie → lokalny decoder → lokalny model → lokalne wyniki → podgląd
                                                                   ↓ opcjonalny zapis
                                                               ASP.NET API

WEB
File/Blob w przeglądarce → lokalny decoder/Worker → lokalny model → podgląd
                                                                   ↓ opcjonalny zapis
                                                               ASP.NET API
```

- Odczyt istniejącego filmu z biblioteki może wymagać uprawnionego pobrania na urządzenie. To transfer pliku, nie analiza na serwerze.
- Wybranie nowego lokalnego pliku nie wysyła go do Supabase jako warunku analizy.
- Upload oryginału jest osobną, jawną akcją kopii/udostępnienia; zapis wyników może działać bez uploadu filmu.
- Pobranie wag/modelu z zaufanego hosta jest dozwolone; inferencja pozostaje lokalna.
- Web oznacza przeglądarkę, nie SSR, endpoint Python, lokalny daemon ani desktopowy wrapper.
- Zakaz ukrytego fallbacku do serwera GPU. Nie zmieniaj tego założenia przy błędzie runtime.

Free i Pro zachowują obecne wspólne możliwości analizy. Różnica wynikająca ze sprzętu nie jest paywallem. Rola i prawa do zapisania/udostępnienia danych w API nadal obowiązują; nie przyznawaj Client roli wszystkich uprawnień Coach.

## 16. Najpierw dowód działania rzeczywistego modelu

Ten fragment jest osobnym ryzykiem technicznym. Samo istnienie ONNX Runtime/Expo nie dowodzi, że obecny model zadziała na trzech platformach.

Sprawdź rzeczywiste źródła silnika MotionTrace/TrainFlow, formaty wag, preprocessing, kolejność klatek, wejścia/wyjścia, operator support, pamięć oraz licencję kodu i wag.

Wcześniejsze ustalenie: użytkownik wskazuje talerz/koniec sztangi, a pretrained tracker śledzi punkt. Istniejąca detekcja ciała/stawów może być osobnym etapem. Rozważano TAPNext++/TAPIR; nie zakładaj, że konkretny z nich jest już zaimplementowany albo ma gotowy eksport mobilny/webowy.

Nie trenuj nowego modelu i nie zastępuj trackera po cichu prostym algorytmem, zachowując stare marketingowe nazwy wyników.

Zanim uzależnisz od wybranego runtime całe UI:
1. Odtwórz wynik obecnego silnika dla legalnego testowego klipu i zapisz referencję.
2. Uruchom rzeczywiste wagi przez proponowany lokalny runtime na iOS, Androidzie i w przeglądarce.
3. Sprawdź zgodność trajektorii, klatek/timestampów i repów, nie tylko zakończenie wywołania bez błędu.
4. Zmierz czas, pamięć, wymagany download i faktyczny backend CPU/GPU.
5. Zapisz przetestowaną macierz: model/wersja, eksport/runtime, urządzenie/system/przeglądarka, wynik i ograniczenia.

ONNX jest preferowanym kierunkiem tylko przy poprawnym eksporcie i kompatybilności. Native runtime może wymagać innego artefaktu niż browserowy. Samo zapisanie pliku `.onnx` nie potwierdza poprawności.

Brak wag, niezgodny operator albo nieakceptowalna jakość oznacza konkretny blocker ML. Kontynuuj niezależne funkcje mobile, ale nie oznaczaj analizy jako gotowej i nie generuj fikcyjnych pomiarów. Zmiana modelu lub istotne obniżenie zakresu wymaga osobnej decyzji.

## 17. Podział silnika lokalnej analizy

Wspólny kontrakt, osobne platformowe implementacje. Przykładowe odpowiedzialności:

- AnalysisCore: konfiguracja, typy wyników, walidacja, czas/jednostki, testowana logika postprocessingu możliwa do współdzielenia.
- VideoSource/FrameDecoder: dostęp do klipu, klatki, orientacja, rzeczywiste timestampy.
- LocalInferenceEngine: przygotowanie sesji, przetwarzanie, anulowanie i zwalnianie zasobów.
- ModelRepository: manifest wersji, pobranie, weryfikacja integralności, cache.
- AnalysisPersistence: lokalny zapis roboczy i osobne zapisanie wyniku do API.

Nie twórz abstrakcji dla dowolnego AI. Kontrakty mają rozwiązywać konkretną analizę liftów.

Stan ML: Preparing, DownloadingModel, Processing, Completed, Interrupted, Cancelled, Failed. Osobny stan synchronizacji: LocalOnly, UploadingResult, Synced, SyncFailed. Błąd sieci przy zapisie nie zmienia ukończonego lokalnie pomiaru w Failed.

Progress bazuje na faktycznie przetworzonych klatkach/etapach, nie losowym pasku 99%. Pause/Resume pokazuj tylko wtedy, gdy zapisano również wymagany stan modelu i dekodera. W przeciwnym razie oferuj jawne ponowne uruchomienie.

## 18. Lokalna analiza mobilna

Kandydat: `onnxruntime-react-native`, gdy rzeczywisty model i runtime są kompatybilne. Gdy potrzebna jest natywna integracja, wykorzystaj ograniczony Expo Module w Swift/Kotlin/C++ i zweryfikowany runtime mobilny.

Nie zakładaj automatycznej dostępności akceleracji Core ML/GPU/NPU tylko dlatego, że zainstalowano paczkę. Ustal faktycznie dołączone execution providers, operator placement i porównaj czas z CPU. Nie nazywaj CPU fallbacku akceleracją GPU.

Dekodowanie, przygotowanie dużych tensorów i inferencja nie mogą blokować JS/UI thread. Przetwarzaj ograniczone okno/małe partie klatek. Nie przekazuj całego filmu jako Base64 ani każdej pełnej klatki w JSON przez granicę JS-native.

Zachowaj poprawne timestampy, orientację, proporcje, colour conversion i preprocessing modelu. Zwolnij bufory i sesje przy końcu, anulowaniu i błędzie. Monitoruj pamięć; nie obiecuj działania w tle po zablokowaniu telefonu.

W v1 obliczenia działają przy aplikacji w pierwszym planie. Przy przejściu w tło zastosuj kontrolowane przerwanie/checkpoint, jeśli technicznie prawidłowy, oraz czytelny stan po powrocie. Nigdy nie pokazuj Completed tylko dlatego, że proces został przerwany.

Można zapobiegać uśpieniu podczas analizy, jeśli użytkownik o tym wie; nie traktuj tego jako gwarancji nieprzerwanego wykonania. Nie dodawaj background permissions niesłużących rzeczywistej funkcji.

## 19. Lokalna analiza w obecnym webie

Dostosuj istniejący VideoAnalysis UI, nie buduj osobnej webowej aplikacji.

Dla kompatybilnego ONNX sprawdź `onnxruntime-web`:
- WebGPU, jeśli dostępne i obsługujące rzeczywisty model;
- lokalny WebAssembly CPU fallback, jeśli mieści się w rozsądnych wymaganiach;
- Unsupported/InsufficientResources, jeśli nie ma poprawnej ścieżki.

Fallback nigdy nie oznacza serwera. Obecność `navigator.gpu` nie dowodzi obsługi wszystkich operatorów ani wielkości modelu.

Ciężką pracę odseparuj w Web Workerze. Sprawdź konfigurację runtime: mechanizm `wasm.proxy` nie jest tym samym co własny Worker obsługujący WebGPU i nie jest z nim dowolnie wymienny.

Decoder musi obsługiwać kontener filmu oraz jego codec. Sam WebCodecs nie rozwiązuje demuxingu MP4/WebM. Feature-detect dekoder; zapewnij testowaną lokalną alternatywę tam, gdzie realna, albo czytelny brak obsługi. Nie wprowadzaj ogromnego ffmpeg.wasm bez oceny downloadu, pamięci i licencji.

Nie zakładaj stałego FPS. Odwzoruj presentation timestamps, VFR, slow motion i trim do oryginalnego pliku. Nie obliczaj prędkości z numeru klatki / deklarowane FPS bez weryfikacji.

Zapewnij właściwe MIME i ścieżki zasobów WASM, zgodność wersji JS/WASM, CSP i CORS. Wielowątkowy WASM może wymagać cross-origin isolation; nie włączaj globalnie COOP/COEP bez testów Supabase Auth callbacks, okien logowania, plików i innych integracji. Single-threaded fallback musi być jawny i oceniony wydajnościowo.

Nie inicjalizuj runtime/GPU podczas SSR/prerenderu. Ładuj ML, modele i dekoder dopiero w ekranie analizy; landing, Dashboard i pozostałe ekrany nie powinny ich pobierać.

Po zamknięciu karty nie obiecuj dalszego działania analizy. Persistuj konfigurację/wynik, obsłuż przerwanie, brak uprawnienia do ponownego dostępu do pliku, limit lokalnego storage i ewentualną konieczność ponownego wskazania tego samego klipu.

## 20. Dane, kalibracja i jakość wyników

Wspólny UX: wybór lokalnego/importowanego filmu, opcjonalny trim, wskazanie punktu na właściwej klatce, konfiguracja/kalibracja, analiza, wykresy, porównanie i zapis.

Wskazany punkt przelicz do układu źródłowego: uwzględnij letterboxing, obrót, skalę i obszar crop. Nie traktuj współrzędnych ekranu jako wejścia modelu.

Zachowaj istniejące możliwości silnika: tracking punktu i ewentualnie pose, repy/fazy, tor, pozycję i prędkość. Nie deklaruj funkcji, których referencyjny pipeline nie oblicza.

Bez kalibracji pokazuj piksele/piksele na sekundę lub poprawnie opisany układ znormalizowany. Nie zamieniaj ich w metry/m/s i nie przedstawiaj pomiaru 2D jako rzeczywistego ruchu 3D.

Do wyników dołącz jakość/visibility/occlusion, braki danych, sposób filtrowania, model i wersję silnika. Nie interpoluj długich zasłonięć tak, jakby były obserwowanym ruchem. Zmiana próbkowania może zmienić wynik; nie redukuj klatek po cichu tylko dla szybkości.

Wersjonuj manifest, preprocessing i postprocessing. Optymalizacja/kwantyzacja wymagają porównania z referencją i deklarowanych tolerancji, ustalonych przed testem. Nie obchodź testu przez dowolne powiększenie tolerancji.

Porównania sprawdzają ćwiczenie/metodę, skalę i jednostki. Wynik nie jest diagnozą ani automatyczną oceną ryzyka urazu.

## 21. Modele i limity lokalne

Manifest zawiera źródło i licencję wag, checksum, wersję, rozmiar, oczekiwane wejścia/wyjścia, runtime i wymagania. Pobieraj wyłącznie z zaufanych skonfigurowanych lokalizacji; nie wykonuj modeli/skryptów z dowolnego URL użytkownika.

Download jest wersjonowany, sprawdzany i cache'owany. Aktualizacje atomowe: uszkodzony download nie zastępuje poprawnej wersji. Przed dużym pobraniem pokaż rozmiar; brak wag/internetu ma konkretny komunikat. Caching wag jest oddzielny od prywatnego cache klienta.

Nie traktuj model weights jako sekretu, którego nie da się wydobyć z aplikacji. Sprawdź prawo redystrybucji. Kod natywny i bundle aktualizuj normalną ścieżką build/release, nie pobieraniem wykonywalnego kodu jako „model update”.

Startowo: jedna ciężka analiza aktywna na urządzeniu i do dwóch lokalnych oczekujących; identycznie Free/Pro. Koordynuj między kontami na tym urządzeniu. W webie koordynuj karty, jeśli dostępny mechanizm to umożliwia; w przeciwnym razie wyraźnie pokaż lokalny zakres limitu.

To ochrona zasobów klienta, nie gwarantowany globalny limit użytkownika. Dawny limit 20 oczekujących na serwerze i jeden worker GPU nie mogą blokować lokalnego obliczania. Backend nadal ogranicza uploady, rozmiar wyników i częstotliwość zapisów.

## 22. API, zapis wyników i migracja starej analizy

Utrzymujemy istniejącą bibliotekę analiz i prawa do jej zasobów. Dodaj minimalny kontrakt zapisu lokalnie policzonego wyniku, z idempotencją, wersją schematu i weryfikacją powiązań.

Zapis zawiera m.in. lokalny identyfikator analizy, wersję modelu/silnika, `executionLocation = client`, parametry, jednostki, timestampy, pochodzenie filmu oraz opcjonalny uprawniony `MediaId`/`WorkoutExecutionId`/serię.

Backend nie ufa wartościom klienta: waliduje strukturę, limity, typy, skończone liczby, kolejność czasu i własność wszystkich odwołań. Nie wykonuje powtórnej inferencji dla każdego zapisu. Nie nazywa rezultatu zweryfikowanym przez serwer tylko dlatego, że klient przesłał hash wag.

Wynik bez filmu może być widoczny na drugim urządzeniu z informacją „Source video is not stored in cloud”. Brak oryginału nie może prowadzić do fikcyjnego odtwarzania ani trwałych linków do lokalnego path innego urządzenia.

Lokalny wynik nie oznacza, że klient faktycznie wykonał trening; nie modyfikuj automatycznie Activity lub zapisu obciążenia. Powiązanie analizy i udostępnienie wymaga uprawnionej akcji.

Nowy web/mobile nie zlecają serwerowej inferencji. Istniejące analizy, wyniki i rekordy kolejki zachowaj. Nie uruchamiaj ich ponownie i nie migruj automatycznie plików z chmury na telefon. Wygaszanie starego workera i istniejących queued jobs zaproponuj bez destrukcyjnych zmian; nie wyłączaj wspólnego workera odpowiedzialnego również za check-iny/płatności/powiadomienia.

## 23. Jakość i obserwowalność

Naprawiaj przyczyny, nie dodawaj dziesiątek platformowych wyjątków w ekranach. Wspólne problemy rozwiąż w adapterze sesji, komponentach formularza, transporcie lub runnerze ML.

Nie dodawaj globalnego store'a dla wszystkiego, powielonych systemów cache i nieużywanych abstrakcji. Małe komponenty mają sens wtedy, gdy oddzielają odpowiedzialności.

Mierz renderowanie list i Workout Execution w buildzie zbliżonym do release. Raportuj czas analizy, inicjalizację modelu, pamięć szczytową oraz runtime, nie obiecuj uniwersalnego FPS.

Telemetry nie może wysyłać klatek, filmu, tensorów, prywatnych notatek i tokenów. W trybie diagnozy używaj niesensytywnych metadanych i jawnych testowych danych.

## 24. Testy odbioru

Uruchom istniejące testy jako baseline. Dodaj testy logiki, komponentów, integracji API i E2E mobilne narzędziem pasującym do repo. Krytyczne przypadki wymagają urządzeń lub właściwych emulatorów, nie tylko testów snapshot.

### Mobile / UI / konta

- Natywna nawigacja, Back, panele i menu działają na iOS i Androidzie.
- Obsługiwany iOS używa prawdziwego Liquid Glass; starszy/fallback i Reduce Transparency są czytelne.
- Zmiana tokenu/komponentu zmienia reprezentatywne ekrany bez ich przepisywania.
- EN/PL, długie etykiety, skalowanie tekstu i klawiatura nie blokują działań.
- Dwa konta i Coach/Client nie mieszają query cache, draftów, wyników ani SignalR.
- Logout w trakcie uploadu/zapisu/analizy nie przekazuje rezultatu nowemu kontu.
- Logowanie, linki, onboarding i reset działają w prawdziwym dev buildzie.

### Codzienne funkcje

- Plan → wykonanie → autosave → Finish → historia → korekta → widok trenera.
- Zmiana zaleceń nie przepisuje historycznego wykonania; konflikt dwóch urządzeń zachowuje draft.
- Przełączenie aplikacji i restart nie gubią już utrwalonego lokalnego wykonania.
- Lead, zaproszenie, przypisanie programu/formularza, odpowiedź check-inu i review działają na API.
- Pomiary, pliki i prywatne notatki respektują Team/Private i status współpracy.
- Czat tekstowy, głosówka, plik, retry, przeczytanie i reconnect zachowują historię i uprawnienia.
- Push otwiera właściwy zasób na właściwym koncie; odmowa zgody nie blokuje aplikacji.
- Mobile nie oferuje żadnego checkoutu, również symulowanego.

### ML — obowiązkowy test prawdziwego pipeline'u

- Legalny, jawny klip testowy z rzeczywistym modelem na fizycznym iPhonie, reprezentatywnym Androidzie oraz desktopowej przeglądarce.
- Sama obecność pakietu, tokenu lub modelu w bundle nie jest dowodem inferencji.
- Browser WebGPU i WASM fallback sprawdzone tam, gdzie deklarujesz wsparcie; braki oznaczone.
- Referencja ↔ mobile/web: poprawne osie, orientacja, crop, timestampy, visibility, trajektorie i repy w ustalonych tolerancjach.
- Obrócony klip, VFR/slow motion, utrata trackingu, anulowanie, zła kalibracja, niewspierany codec/model i presja pamięci.
- Po pobraniu modelu test z lokalnym filmem i zablokowaną siecią nadal oblicza wynik. Brak sieci uniemożliwia tylko potrzebną synchronizację, nie powoduje uploadu/fallbacku.
- Network trace potwierdza brak wysyłania klatek i filmu w przepływie lokalnej analizy.
- Zapis wyniku do API bez filmu działa, retry nie duplikuje rekordu; cudzy MediaId/WorkoutExecutionId jest odrzucany.
- Zmiana konta, background/interruption i zakończenie karty nie fabrykują Completed.
- Wagi są weryfikowane; pamięć GPU/CPU oraz dekoder są zwalniane.

### Regresja web/API

- Stare wyniki analiz nadal są czytelne.
- Nowy web analizuje lokalnie i zachowuje obecny wygląd/pozostałe funkcje.
- Prerender/build, login/callback, Storage i CSP działają po dodaniu Workers/WASM.
- Model/ML nie zwiększają początkowego transferu landingu przez eager import.
- Wszystkie rozszerzone endpointy zachowują isolation, role i limity.

## 25. Migracje i uprawnienia wykonania

Zachowaj istniejący mechanizm migracji EF Core/Npgsql. Nie edytuj tych samych tabel niezależnie przez ręczny SQL i drugi system migracji.

Możesz zastosować niedestrukcyjne migracje tylko do jednoznacznie potwierdzonego Supabase DEV. Najpierw project ref/host, środowisko, historia i przegląd SQL. Brak pewności oznacza wykonanie lokalne i raport, nie wybór pierwszego projektu z listy.

Nie resetuj bazy, nie kasuj starych danych analizy, nie zmieniaj schematów zarządzanych auth/storage. Nie włączaj Data API i nie rozszerzaj roli runtime do superusera dla wygody.

Nie publikuj aplikacji, nie kupuj usług, nie wykonuj push ani deploymentu produkcji bez osobnej zgody.

## 26. Etapy i dowody zakończenia

To jeden zakres produktowy, ale kilka osobnych kamieni milowych. Nie implementuj całego projektu jako jednej nieprzejrzystej zmiany.

A. Audyt, mapa kontraktów, granice UI, macierz wsparcia natywnego.
B. Wczesny eksperyment lokalnego runtime na rzeczywistym modelu dla mobile i web; jawne wyniki i ewentualne blockery przed finalnym związaniem kodu z silnikiem.
C. Szkielet mobile, motyw, używane komponenty, routing i konta.
D. Client: plany, wykonanie, historia, progres i check-iny.
E. Coach: klienci/Leads/invitations, istniejące zasoby i Client Details.
F. Czat, pliki, głosówki, kalendarz i push.
G. Docelowy lokalny pipeline mobile + web, zapis wyników i kompatybilność starej analizy.
H. Testy urządzeń, bezpieczeństwa, regresji, build i dokumentacja.

Nie odkładaj sprawdzenia modelu na koniec. Nie blokuj jednak całego mobile, jeśli trzeba rozwiązać konkretną zależność ML. Na koniec rozdziel części zrealizowane od niezweryfikowanych.

Wymagane dokumenty:
- architektura i granice pakietów;
- instrukcja zmiany motywu/komponentów, z krótkim przykładem;
- mapa ekranów, endpointów i ograniczeń względem web;
- konfiguracja lokalna, dev builds iOS/Android oraz push;
- lifecycle sesji, lokalnych draftów i danych prywatnych;
- model manifest/export scripts i reprodukcja referencji ML;
- macierz modeli/runtime/urządzeń/przeglądarek z pomiarami;
- migracja webowej analizy z server inference do client inference;
- lista braków dla wydania sklepowego.

Raport końcowy: IMPLEMENTED / TESTED / DEVICE VERIFIED / WEB LOCAL ML VERIFIED / MIGRATIONS CREATED / APPLIED TO DEV / BLOCKED / DEFERRED. Podaj rzeczywiste komendy i wyniki.

Nie zgłaszaj „lokalna analiza działa”, jeśli działa tylko UI, mock lub inference w Pythonie na serwerze. Nie zgłaszaj „iOS działa” na podstawie samego Android builda.

**Wynik:** funkcjonalne mobile z natywnymi interakcjami, minimalną stylizacją i przygotowaną biblioteką/motywem do późniejszego designu; analiza liftów rzeczywiście wykonywana lokalnie na telefonie i w przeglądarce, z bezpiecznym opcjonalnym zapisem wyników do wspólnego API.

## 27. Oficjalna dokumentacja do sprawdzenia przy wdrożeniu

Stan bibliotek i platform sprawdzaj dla faktycznie wybranych wersji; odnośniki nie zastępują testów naszego modelu.

- React Native — platform-specific code: https://reactnative.dev/docs/platform-specific-code
- Expo — development builds: https://docs.expo.dev/develop/development-builds/introduction/
- Expo — Native tabs: https://docs.expo.dev/router/advanced/native-tabs/
- Expo — GlassEffect: https://docs.expo.dev/versions/latest/sdk/glass-effect/
- Expo UI — SwiftUI i Jetpack Compose: https://docs.expo.dev/versions/latest/sdk/ui/
- Expo Modules: https://docs.expo.dev/modules/overview/
- Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
- Expo Push: https://docs.expo.dev/push-notifications/overview/
- Supabase Auth / React Native: https://supabase.com/docs/guides/auth/quickstarts/react-native
- ONNX Runtime React Native: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html
- ONNX Runtime Web: https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- ONNX Web — konfiguracja Worker/WASM: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- ONNX Web — wdrożenie: https://onnxruntime.ai/docs/tutorials/web/deploy.html
- ONNX mobile: https://onnxruntime.ai/docs/tutorials/mobile/
- Oficjalne repozytorium TAP/TAPIR/TAPNext: https://github.com/google-deepmind/tapnet
- Apple App Review: https://developer.apple.com/app-store/review/guidelines/
- Google Play Payments: https://support.google.com/googleplay/android-developer/answer/9858738
