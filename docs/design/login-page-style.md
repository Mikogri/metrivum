# Strona logowania Metrivum — pełna specyfikacja stylu (do odtworzenia 1:1)

Ten dokument opisuje **wszystko**, co składa się na wygląd i ruch strony logowania (`/auth/login`): tło z promieniami światła (WebGL), siatkę, górny pasek, szklaną kartę, typografię, pola, przyciski, animacje wejścia, stany (focus, błąd, ładowanie), responsywność i ograniczony ruch. Pod opisem są **dosłowne kopie** wszystkich plików źródłowych, z których strona jest zbudowana. Żeby odtworzyć stronę w innym projekcie, wystarczy przenieść te pliki (lub ich treść) zgodnie z sekcją „Jak odtworzyć”.

Stos: React 19 + React Router 7/8, CSS Modules, `react-aria-components` (pola, przyciski, przełącznik), `lucide-react` (ikony), fonty z `@fontsource-variable/*`. Efekt tła to WebGL2 (bez bibliotek).

---

## 1. Jak to wygląda (opis wizualny)

- **Tło strony**: niemal czarne `#050505`, ciemny motyw (`color-scheme: dark`).
- **Promienie światła**: z góry, ze środka (punkt źródła 20% wysokości *nad* górną krawędzią ekranu), opada miękki snop białego, neutralnego (bez koloru) światła z kilkoma delikatnie falującymi promieniami, lekką mgiełką (haze) i poświatą przy źródle. Przezroczystość całości 0.8. Promienie powoli się przesuwają (prędkość 0.45). **Nie reagują na kursor** i kliknięcia. Przy otwarciu strony światło „rozwija się” od źródła w dół przez ~1.8 s.
- **Siatka**: na całym ekranie bardzo słaba siatka linii 1 px co 4 rem (64 px), kolor `rgb(255 255 255 / 0.03)`, widoczna tylko w eliptycznym obszarze pod źródłem światła (maska radialna 60%×55% w punkcie 50% / 35%, zanika do 80%). Przy wejściu siatka pojawia się z lekkim pomniejszeniem (scale 1.06 → 1) przez 1.2 s.
- **Górny pasek**: po lewej logo (znak „M” z 3 wielokątów + słowo „Metrivum”, wysokość 1.375 rem, kolor tekstu `#ededec`, waga 500). Po prawej link „← Back to website” (szary `#8f8f8d`, 13 px, na hover biały i strzałka przesuwa się 3 px w lewo) oraz przełącznik języka EN/PL (mały segmented control). Padding paska 20 px / 32 px. Pasek wjeżdża z góry (−8 px, fade) w 600 ms.
- **Karta** (wyśrodkowana w pionie i poziomie): szerokość `min(27rem, 100%)` = 432 px, padding 24 px góra/dół i 32 px boki, odstęp między elementami 20 px, promień 8 px, ramka 1 px `rgb(255 255 255 / 0.09)`. Tło to **szkło**: półprzezroczysty grafit `rgb(18 18 18 / 0.72)` z rozmyciem `blur(20px) saturate(120%)`, a na nim **połysk** — gradient od góry `rgb(255 255 255 / 0.07)` → `0.015` (38%) → przezroczysty (70%). Cienie: wewnętrzna jasna linia u góry (`inset 0 1px 0 rgb(255 255 255 / 0.09)`), miękka jasna poświata nad kartą (`0 -20px 80px -30px rgb(255 255 255 / 0.12)`) i głęboki czarny cień pod spodem (`0 40px 90px -30px rgb(0 0 0 / 0.9)`). Na górnej krawędzi karty jest **cienka linia światła** (1 px, od 12% do 88% szerokości, gradient przezroczysty → biały 0.55 → przezroczysty), która przy wejściu rozciąga się od środka (scaleX 0.2 → 1) przez 1.1 s z opóźnieniem 200 ms.
- **Nagłówek karty**: „Sign in to Metrivum”, font **Saira** (display), 22 px, waga 500, `letter-spacing: -0.01em`, `line-height: 1.15`, wypełniony **gradientem pionowym** biały `#ffffff` → `#d6d6d4` (50%) → `#8a8a88` (100%) przyciętym do tekstu. Pod nim podtytuł 13 px, szary `#8f8f8d`, `line-height: 1.65`.
- **Pola** (Email, Password): etykieta 13 px, waga 450, biała, z gwiazdką wymagalności w kolorze `#626260`. Po prawej od etykiety hasła link „Forgot password?” (12 px, szary, hover biały). Pole: wysokość 32 px, padding poziomy 10 px, ramka 1 px `rgb(255 255 255 / 0.1)`, promień 5 px, tło `rgb(255 255 255 / 0.04)`, tekst 13 px, placeholder `#626260`. Hover: ramka `rgb(255 255 255 / 0.18)`. **Focus: jedna zielona krawędź** `color-mix(in srgb, #6ee7a0 70%, transparent)`, bez poświaty. Błąd: ramka `rgb(240 96 93 / 0.36)` i pod polem czerwony tekst 12 px `#f0605d` z ikoną kółka z wykrzyknikiem (maska SVG). Autouzupełnianie przeglądarki nie maluje niebieskiego/żółtego tła.
- **Przycisk główny** „Sign in”: pełna szerokość, wysokość 32 px, promień 5 px, **ciemnozielone szkło**: tło `#16301f`, ramka `rgb(110 231 160 / 0.38)`, tekst `#d6f5e2`, 13 px, waga 450, `letter-spacing: 0.005em`. Hover: tło `#1c3c28`, ramka `rgb(110 231 160 / 0.55)`. Wciśnięcie: `scale(0.97)` w 140 ms. Ładowanie: etykieta znika z rozmyciem 2 px, w środku obraca się spinner (640 ms na obrót).
- **Link tekstowy** pod przyciskiem: „Sign in with an email link instead”, 13 px, szary, podkreślony (offset 3 px, kolor podkreślenia `rgb(255 255 255 / 0.18)`), hover biały.
- **Stopka karty**: „New to Metrivum? Create an account” — wyśrodkowana linia 13 px, kolor `#626260`, nad nią linia 1 px `rgb(255 255 255 / 0.06)` i 16 px odstępu; link szary z podkreśleniem, na hover biały z podkreśleniem w kolorze tekstu.
- **Tagline** na dole strony: „A workspace for coaches who write training programs.”, 12 px, `#626260`, wyśrodkowany, padding 16 px / 24 px.
- **Ruch przy wejściu** (jednorazowo, przy każdym przejściu między stronami auth karta jest montowana od nowa przez `key={pathname}`): karta fade-in 400 ms; dzieci karty wchodzą po kolei (`rise`: opacity 0 → 1, `translateY(10px)` → 0, 520 ms) z opóźnieniami 120/180/240/300/360/420/480 ms; elementy wewnątrz `<form>` też po kolei (480 ms, opóźnienia 260/320/380/440/500 ms); tagline 600 ms z opóźnieniem 600 ms. Wszystkie krzywe: `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Mobile (≤ 40rem / 640 px)**: pasek padding 16 px, link „Back to website” ukryty, karta przyklejona do góry (`align-items: start`), padding main 8/12/24 px, padding karty 24 px / 20 px.
- **`prefers-reduced-motion: reduce`**: wyłączone wszystkie animacje CSS strony; promienie światła nadal są rysowane, ale bez intro i z czasem płynącym 0.35× wolniej.

## 2. Struktura DOM

```html
<div class="page" data-public-theme="night">           <!-- grid: auto / 1fr / auto, min-height 100dvh -->
  <div class="backdrop" aria-hidden="true">              <!-- position: fixed; inset: 0; z-index: -1 -->
    <LightRays class="light" ... />                      <!-- div.rays > canvas.canvas (WebGL2) -->
    <span class="grid"></span>                           <!-- siatka z maską radialną -->
  </div>
  <header class="top">
    <a class="brand"><Logo/></a>
    <div class="topEnd">
      <a class="back"><ArrowLeft/> Back to website</a>
      <SegmentedControl size="sm">EN | PL</SegmentedControl>
    </div>
  </header>
  <main id="main" class="main">                          <!-- place-items: center -->
    <div class="card" key={pathname}>                    <!-- szklana karta -->
      <header class="header">                            <!-- AuthHeader -->
        <div class="titleRow"><h1 class="title">Sign in to Metrivum</h1></div>
        <p class="subtitle">Use the email and password of your coach account.</p>
      </header>
      <form class="form" noValidate>                     <!-- grid, gap 16px -->
        <TextField label="Email" type="email" placeholder="name@example.com" isRequired />
        <TextField label="Password" type="password" placeholder="Your password" isRequired
                   labelAside={<a class="link">Forgot password?</a>} />
        <Button type="submit" variant="primary" block>Sign in</Button>
        <button type="button" class="textButton">Sign in with an email link instead</button>
      </form>
      <p class="footer">New to Metrivum? <a>Create an account</a></p>
    </div>
  </main>
  <p class="tagline">A workspace for coaches who write training programs.</p>
</div>
```

Ważne szczegóły kaskady:
- `.card h1` (w `auth-layout.module.css`) ma wyższą specyficzność niż `.title` z `AuthHeader.module.css`, więc **wygrywa rozmiar 22 px, gradient i `letter-spacing: -0.01em`**; z `.title` zostaje tylko `font-family: Saira`.
- Motyw nocny działa przez atrybut `data-public-theme="night"` na wrapperze **i** na `<html>` (ustawiany w `useEffect`), żeby menu/popovery w portalach też dostały ciemną paletę.
- Komponent `LightRays` dostaje props: `raysColor="#ffffff" lightSpread={0.85} rayLength={1.2} intensity={0.65} glow={0.3} haze={0.2} atmosphere={0} saturation={0} raysSpeed={0.45} followMouse={false} cursorShadow={false} clickPulse={false} opacity={0.8}` (pozostałe domyślne: `raysOrigin="top-center"`, `rayDensity=1`, `raySharpness=0.35`, `tilt=0`, `fadeDistance=1`, `noiseAmount=0`, `distortion=0`, `intro=true`, `lightMode=false`, `maxDevicePixelRatio=2`).

## 3. Fonty

Pakiety npm (wersja 5.3.0): `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource-variable/saira`, `@fontsource-variable/orbitron`, `@fontsource-variable/source-code-pro`. Importowane w CSS przez `@import "@fontsource-variable/geist";` itd. Na stronie logowania używane są tylko **Geist Variable** (cały tekst, 14 px bazowo, `font-feature-settings: "ss01", "cv11"`, antyaliasing) i **Saira Variable** (nagłówek). Wagi to wartości zmiennej osi: 400 / **450** (medium) / **500** (semibold) / 600.

## 4. Jak odtworzyć w innym projekcie

1. Zainstaluj: `react`, `react-dom`, `react-router`, `react-aria-components`, `lucide-react`, `@internationalized/date` (tylko dla pola daty w TextField; można usunąć tę gałąź), i 5 pakietów fontów z sekcji 3.
2. Skopiuj **tokeny** (`tokens.css`), **reset** i **motyw nocny** (`night-theme.css`) — sekcje 5.1–5.3. Zaimportuj `tokens.css` + `reset.css` globalnie i nadaj stronie `data-public-theme="night"`.
3. Skopiuj komponenty UI: `LightRays` (5.4), pola (`Field.module.css`, `FieldParts.tsx`, `TextField.tsx` — 5.5), `Button` + `Spinner` (5.6), `SegmentedControl` (5.7), `cx` (5.8).
4. Skopiuj layout (`auth-layout.tsx` + `auth-layout.module.css` — 5.9), logo (5.10), nagłówek/stopkę (`AuthHeader` — 5.11), style formularza (`form.module.css` — 5.12) i stronę (`login.tsx` — 5.13; logikę Supabase/Turnstile zastąp swoją, struktura JSX i klasy zostają).
5. Teksty i linki podmień na swoje (i18n z `useT()` → zwykłe stringi z sekcji 1).

Tokeny używane na tej stronie, których wartość nadpisuje motyw nocny, są w 5.3; reszta (odstępy, typografia, promienie, krzywe, czasy, czerwień błędów) pochodzi z 5.1. Jeśli chcesz skopiować tylko minimum, przenieś z `tokens.css` sekcje: fonty, rozmiary tekstu, leading, wagi, tracking, spacing, control, radius, shadow-sm, ease/duration oraz `--tf-color-danger*`.

---

## 5. Pliki źródłowe (dosłowne kopie)

### 5.1 `packages/ui-web/src/tokens/tokens.css`

```css
/*
 * Metrivum web design tokens.
 * Values come from docs/frontend/design-reference.md (derived from the supplied dark inspirations).
 * Components must use these semantic variables instead of raw values.
 */
:root {
  color-scheme: dark;

  /* Surfaces: neutral greys (equal RGB channels), each step one visible notch lighter. */
  --tf-color-bg: #141414;
  --tf-color-bg-sunken: #101010;
  --tf-color-sidebar: #0e0e0e;
  --tf-color-surface: #181818;
  --tf-color-surface-raised: #1d1d1d;
  --tf-color-surface-overlay: #212121;
  /* Inputs sit a touch lighter than the panel they are on, never darker. */
  --tf-color-field: rgb(255 255 255 / 0.065);
  --tf-color-field-hover: rgb(255 255 255 / 0.09);
  --tf-color-surface-hover: rgb(255 255 255 / 0.05);
  --tf-color-surface-selected: rgb(60 60 60 / 0.5);

  /* Borders: translucent white hairlines, so they read the same on every surface. */
  --tf-color-border-subtle: rgb(255 255 255 / 0.07);
  --tf-color-border: rgb(255 255 255 / 0.1);
  --tf-color-border-strong: rgb(255 255 255 / 0.17);

  /* Text. Tertiary still passes 4.5:1 on --tf-color-bg. */
  --tf-color-text: #ededed;
  --tf-color-text-secondary: #a0a0a0;
  --tf-color-text-tertiary: #8a8a8a;
  --tf-color-text-disabled: #606060;
  --tf-color-text-inverse: #0a0a0a;

  /* Actions: deep green buttons with white text; the bright green is for small details. */
  --tf-color-primary: #235337;
  --tf-color-primary-hover: #2a6342;
  --tf-color-primary-border: rgb(62 224 154 / 0.24);
  --tf-color-primary-border-hover: rgb(62 224 154 / 0.36);
  --tf-color-on-primary: #ffffff;
  --tf-color-accent: #3ee09a;
  --tf-color-accent-strong: #6eeab5;
  --tf-color-accent-deep: #163a2b;
  --tf-color-accent-deep-hover: #1c4634;
  --tf-color-accent-soft: rgb(62 224 154 / 0.12);
  --tf-color-accent-border: rgb(62 224 154 / 0.34);
  --tf-color-on-accent: #0a0a0a;
  --tf-color-accent-text: #2ebc75;

  /* Status (always paired with an icon or text, never colour alone). */
  --tf-color-success: #3ee09a;
  --tf-color-success-soft: rgb(62 224 154 / 0.12);
  --tf-color-warning: #f2a93b;
  --tf-color-warning-soft: rgb(242 169 59 / 0.12);
  --tf-color-danger: #f0605d;
  --tf-color-danger-soft: rgb(240 96 93 / 0.12);
  --tf-color-danger-border: rgb(240 96 93 / 0.36);
  --tf-color-info: #79a8ff;
  --tf-color-info-soft: rgb(121 168 255 / 0.12);
  --tf-color-violet: #a98bff;
  --tf-color-violet-soft: rgb(169 139 255 / 0.14);

  --tf-color-focus-ring: #3ee09a;
  --tf-color-scrim: rgb(0 0 0 / 0.6);

  /* Typography */
  --tf-font-sans: "Geist Variable", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --tf-font-display: "Saira Variable", "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --tf-font-brand: "Orbitron Variable", "Geist Variable", ui-sans-serif, sans-serif;
  --tf-font-label: "Source Code Pro Variable", "Geist Mono Variable", ui-monospace, monospace;
  --tf-font-mono: "Geist Mono Variable", ui-monospace, "SFMono-Regular", Consolas, monospace;

  --tf-text-2xs: 0.6875rem; /* 11 */
  --tf-text-xs: 0.75rem; /* 12 */
  --tf-text-sm: 0.8125rem; /* 13: default app density */
  --tf-text-md: 0.875rem; /* 14 */
  --tf-text-lg: 1rem; /* 16: marketing body */
  --tf-text-xl: 1.125rem; /* 18 */
  --tf-text-2xl: 1.375rem; /* 22 */
  --tf-text-3xl: 1.75rem; /* 28 */
  --tf-text-4xl: clamp(2rem, 1.4rem + 2.4vw, 2.75rem);
  --tf-text-5xl: clamp(2.5rem, 1.6rem + 4vw, 4.25rem);
  --tf-text-6xl: clamp(3rem, 1.6rem + 6.2vw, 6rem);

  --tf-leading-tight: 1.08;
  --tf-leading-snug: 1.3;
  --tf-leading-normal: 1.5;
  --tf-leading-relaxed: 1.65;

  --tf-weight-regular: 400;
  --tf-weight-medium: 450;
  --tf-weight-semibold: 500;
  --tf-weight-bold: 600; /* special cases only (404 number, file type) */

  --tf-tracking-display: -0.025em;
  --tf-tracking-tight: -0.01em;

  /* Spacing (4px grid with 2/6 half steps for dense UI) */
  --tf-space-0-5: 0.125rem;
  --tf-space-1: 0.25rem;
  --tf-space-1-5: 0.375rem;
  --tf-space-2: 0.5rem;
  --tf-space-2-5: 0.625rem;
  --tf-space-3: 0.75rem;
  --tf-space-4: 1rem;
  --tf-space-5: 1.25rem;
  --tf-space-6: 1.5rem;
  --tf-space-8: 2rem;
  --tf-space-10: 2.5rem;
  --tf-space-12: 3rem;
  --tf-space-16: 4rem;
  --tf-space-24: 6rem;
  --tf-space-32: 8rem;

  /* Control heights */
  --tf-control-sm: 1.75rem;
  --tf-control-md: 2rem;
  --tf-control-lg: 2.5rem;

  /* Radius: controls < cards < overlays */
  --tf-radius-xs: 3px;
  --tf-radius-sm: 4px;
  --tf-radius-md: 5px;
  --tf-radius-lg: 6px;
  --tf-radius-xl: 8px;
  --tf-radius-full: 999px;

  /* Elevation: shadows are dark and paired with a hairline. */
  --tf-shadow-sm: 0 1px 0 rgb(255 255 255 / 0.03) inset, 0 1px 2px rgb(0 0 0 / 0.4);
  --tf-shadow-md: 0 1px 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -8px rgb(0 0 0 / 0.6);
  --tf-shadow-lg: 0 1px 0 rgb(255 255 255 / 0.05) inset, 0 24px 64px -16px rgb(0 0 0 / 0.75);
  /* Menus and popovers: a tight shadow that only darkens the edges. */
  --tf-shadow-menu: 0 0 0 1px rgb(0 0 0 / 0.2), 0 1px 3px rgb(0 0 0 / 0.3);
  --tf-shadow-glow: 0 0 0 1px var(--tf-color-accent-border), 0 0 32px -4px rgb(62 224 154 / 0.35);

  /* Layers */
  --tf-z-base: 0;
  --tf-z-sticky: 10;
  --tf-z-header: 50;
  --tf-z-popover: 100;
  --tf-z-modal: 200;
  --tf-z-toast: 300;
  --tf-z-tooltip: 400;

  /* Motion (custom curves: built-in easings are too weak) */
  --tf-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  /* Content arriving after a load: unhurried, no overshoot. */
  --tf-ease-settle: cubic-bezier(0.25, 0.8, 0.3, 1);
  --tf-duration-settle: 560ms;
  --tf-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --tf-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --tf-ease-spring: cubic-bezier(0.34, 1.36, 0.64, 1);
  --tf-duration-press: 140ms;
  --tf-duration-fast: 160ms;
  --tf-duration-base: 200ms;
  --tf-duration-slow: 280ms;
  --tf-duration-story: 720ms;

  /* Layout */
  --tf-content-max: 75rem;
  --tf-prose-max: 40rem;
  --tf-sidebar-width: 15.625rem; /* 250px */
  --tf-sidebar-rail: 4rem;
  --tf-header-height: 3.5rem;
  --tf-appbar-height: 3.25rem;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --tf-duration-press: 0ms;
    --tf-duration-story: 200ms;
  }
}
```

### 5.2 `packages/ui-web/src/styles/index.css`, `reset.css`, `utilities.css`

```css
/* Single explicit stylesheet entry: `import "@metrivum/ui-web/styles.css"`. */
@import "@fontsource-variable/geist";
@import "@fontsource-variable/geist-mono";
@import "@fontsource-variable/saira";
@import "@fontsource-variable/orbitron";
@import "@fontsource-variable/source-code-pro";
@import "../tokens/tokens.css";
@import "./reset.css";
@import "./utilities.css";
```

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

* {
  margin: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
  hanging-punctuation: first last;
}

body {
  min-height: 100dvh;
  background: var(--tf-color-bg);
  color: var(--tf-color-text);
  font-family: var(--tf-font-sans);
  font-size: var(--tf-text-md);
  line-height: var(--tf-leading-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "ss01", "cv11";
}

img,
picture,
video,
canvas,
svg {
  display: block;
  max-width: 100%;
}

input,
button,
textarea,
select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
}

p,
h1,
h2,
h3,
h4,
h5,
h6 {
  overflow-wrap: break-word;
}

h1,
h2,
h3 {
  text-wrap: balance;
}

p {
  text-wrap: pretty;
}

a {
  color: inherit;
  text-decoration: none;
}

ul[role="list"],
ol[role="list"] {
  list-style: none;
  padding: 0;
}

::selection {
  background: rgb(62 224 154 / 0.3);
  color: var(--tf-color-text);
}

:focus-visible {
  outline: 2px solid var(--tf-color-focus-ring);
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}

/* Scrollbars are the browser defaults (dark through color-scheme); only the plan sheet styles its own. */
```

```css
/* The few global helpers components and apps are allowed to share. */
.tf-visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.tf-numeric {
  font-variant-numeric: tabular-nums;
}

.tf-skip-link {
  position: fixed;
  top: var(--tf-space-2);
  left: var(--tf-space-2);
  z-index: var(--tf-z-tooltip);
  padding: var(--tf-space-2) var(--tf-space-3);
  border-radius: var(--tf-radius-md);
  background: var(--tf-color-primary);
  color: var(--tf-color-on-primary);
  font-weight: var(--tf-weight-medium);
  transform: translateY(-200%);
  transition: transform var(--tf-duration-fast) var(--tf-ease-out);
}

.tf-skip-link:focus-visible {
  transform: translateY(0);
}
```

### 5.3 `apps/web/app/layouts/night-theme.css` (paleta strony logowania)

```css
/*
 * Night palette for the public site and the sign-in pages: a neutral near-black, glossy graphite surfaces with a
 * light top edge, white-to-grey type, and one muted green for the main action and data accents.
 */
[data-public-theme="night"] {
  color-scheme: dark;

  --tf-color-bg: #050505;
  --tf-color-bg-sunken: #030303;
  --tf-color-surface: #0d0d0d;
  --tf-color-surface-raised: #141414;
  --tf-color-surface-overlay: #1a1a1a;
  --tf-color-field: rgb(255 255 255 / 0.04);
  --tf-color-field-hover: rgb(255 255 255 / 0.07);
  --tf-color-surface-hover: rgb(255 255 255 / 0.05);
  --tf-color-surface-selected: rgb(255 255 255 / 0.08);

  --tf-color-border-subtle: rgb(255 255 255 / 0.06);
  --tf-color-border: rgb(255 255 255 / 0.1);
  --tf-color-border-strong: rgb(255 255 255 / 0.18);

  --tf-color-text: #ededec;
  --tf-color-text-secondary: #8f8f8d;
  --tf-color-text-tertiary: #626260;

  /* The main action: dark green glass with a light green edge. */
  --tf-color-primary: #16301f;
  --tf-color-primary-hover: #1c3c28;
  --tf-color-primary-border: rgb(110 231 160 / 0.38);
  --tf-color-primary-border-hover: rgb(110 231 160 / 0.55);
  --tf-color-on-primary: #d6f5e2;
  --tf-color-accent: #6ee7a0;
  --tf-color-accent-strong: #a7f3c9;
  --tf-color-accent-soft: rgb(110 231 160 / 0.1);
  --tf-color-accent-border: rgb(110 231 160 / 0.3);
  --tf-color-focus-ring: #d4d4d2;

  /* Glossy panels: a faint light from the top edge over graphite. */
  --tf-gloss: linear-gradient(180deg, rgb(255 255 255 / 0.07), rgb(255 255 255 / 0.015) 38%, transparent 70%);
  --tf-gloss-edge: inset 0 1px 0 rgb(255 255 255 / 0.09);

  --tf-glass: rgb(18 18 18 / 0.72);
  --tf-glass-border: rgb(255 255 255 / 0.09);
  --tf-glass-blur: blur(20px) saturate(120%);
  /* Product visuals on the public site use no blue: "info" reads as a quiet neutral here. */
  --tf-color-info: #c9c7c2;
  --tf-color-info-soft: rgb(255 255 255 / 0.07);
}
```

### 5.4 Tło: `LightRays` (WebGL2, adaptacja React Bits „Light Rays”, licencja MIT + Commons Clause)

```tsx
/**
 * Light Rays background from React Bits (https://reactbits.dev/backgrounds/light-rays, MIT + Commons Clause),
 * adapted: CSS module instead of a global stylesheet, `cx` for classes, a named export, decorative (aria-hidden).
 * WebGL2 only; without it nothing is drawn and the page keeps its plain background.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from "../../lib/cx";
import styles from "./LightRays.module.css";

export type RaysOrigin =
  | 'top-center'
  | 'top-left'
  | 'top-right'
  | 'right'
  | 'left'
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left';

export interface LightRaysProps {
  raysOrigin?: RaysOrigin;
  raysColor?: string;
  raysSpeed?: number;
  lightSpread?: number;
  rayLength?: number;
  rayDensity?: number;
  tilt?: number;
  raySharpness?: number;
  glow?: number;
  haze?: number;
  atmosphere?: number;
  intensity?: number;
  pulsating?: boolean;
  fadeDistance?: number;
  saturation?: number;
  followMouse?: boolean;
  mouseInfluence?: number;
  cursorShadow?: boolean;
  clickPulse?: boolean;
  noiseAmount?: number;
  distortion?: number;
  intro?: boolean;
  lightMode?: boolean;
  opacity?: number;
  maxDevicePixelRatio?: number;
  className?: string;
  style?: CSSProperties;
}

interface Origin {
  anchor: number[];
  dir: number[];
}

interface Settings {
  origin: Origin;
  color: number[];
  speed: number;
  spread: number;
  length: number;
  density: number;
  tilt: number;
  sharpness: number;
  glow: number;
  haze: number;
  atmosphere: number;
  intensity: number;
  pulsating: boolean;
  fade: number;
  saturation: number;
  follow: boolean;
  influence: number;
  cursorShadow: boolean;
  clickPulse: boolean;
  noise: number;
  distortion: number;
  intro: boolean;
  light: boolean;
  opacity: number;
  maxRatio: number;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

const PIXEL_BUDGET = 2.4e6;
const MAX_PULSES = 4;

const ORIGINS: Record<RaysOrigin, Origin> = {
  'top-left': { anchor: [0, -0.2], dir: [0, 1] },
  'top-center': { anchor: [0.5, -0.2], dir: [0, 1] },
  'top-right': { anchor: [1, -0.2], dir: [0, 1] },
  left: { anchor: [-0.2, 0.5], dir: [1, 0] },
  right: { anchor: [1.2, 0.5], dir: [-1, 0] },
  'bottom-left': { anchor: [0, 1.2], dir: [0, -1] },
  'bottom-center': { anchor: [0.5, 1.2], dir: [0, -1] },
  'bottom-right': { anchor: [1, 1.2], dir: [0, -1] }
};

const VERTEX = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uScale;
uniform float uTime;
uniform vec2 uSource;
uniform vec2 uAim;
uniform float uReach;
uniform vec3 uColor;
uniform float uSpread;
uniform float uLength;
uniform float uFade;
uniform float uSaturation;
uniform float uPulsating;
uniform float uNoise;
uniform float uDistortion;
uniform float uDensity;
uniform float uSharpness;
uniform float uGlow;
uniform float uHaze;
uniform float uAtmosphere;
uniform float uIntensity;
uniform vec4 uShadow;
uniform vec4 uPulses[${MAX_PULSES}];
uniform vec2 uIntro;
uniform float uLight;
uniform float uOpacity;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
}

float shape(float strength, float width) {
  float edge = max(mix(0.5, 0.08, uSharpness), width);
  return mix(strength, smoothstep(0.62 - edge, 0.62 + edge, strength), uSharpness);
}

void main() {
  vec2 coord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uScale;
  vec2 delta = coord - uSource;
  float distance = length(delta);
  vec2 dir = delta / max(distance, 1e-4);
  float cosAngle = dot(dir, uAim);
  float angle = cosAngle + uDistortion * sin(uTime * 2.0 + distance * 0.02) * 0.2;
  float slope = fwidth(angle);
  float depth = distance / uReach;

  float source = exp(-depth * depth * 9.0) * 0.9 + exp(-depth * 3.2) * 0.25;
  float glowLight = uGlow * source * smoothstep(-0.2, 0.6, cosAngle);
  float spread = pow(max(angle, 0.0), 1.0 / uSpread);
  float lengthFalloff = clamp(1.0 - distance / (uReach * uLength), 0.0, 1.0);
  float fadeFalloff = clamp(1.0 - distance / (uReach * uFade), 0.5, 1.0);
  float envelope = spread * lengthFalloff * fadeFalloff;
  float reveal = uIntensity * uIntro.y * (1.0 - smoothstep(uIntro.x - 0.35, uIntro.x, depth));
  if ((envelope * 1.6 + glowLight) * reveal < 0.0015) {
    fragColor = vec4(0.0);
    return;
  }

  float phaseA = angle * 36.2214 * uDensity + uTime * 1.5;
  float phaseB = -angle * 21.11349 * uDensity + uTime * 1.5;
  float phaseC = angle * 22.3991 * uDensity + uTime * 1.1;
  float phaseD = -angle * 18.0234 * uDensity + uTime * 1.1;
  float strengthA = clamp(0.75 + 0.15 * sin(phaseA) + 0.2 * cos(phaseB), 0.0, 1.0);
  float strengthB = clamp(0.75 + 0.15 * sin(phaseC) + 0.2 * cos(phaseD), 0.0, 1.0);
  float widthA = abs(0.15 * 36.2214 * cos(phaseA) + 0.2 * 21.11349 * sin(phaseB)) * uDensity * slope;
  float widthB = abs(0.15 * 22.3991 * cos(phaseC) + 0.2 * 18.0234 * sin(phaseD)) * uDensity * slope;
  float pulseA = uPulsating > 0.5 ? 0.8 + 0.2 * sin(uTime * 4.5) : 1.0;
  float pulseB = uPulsating > 0.5 ? 0.8 + 0.2 * sin(uTime * 3.3) : 1.0;
  float rayLight = envelope * (0.5 * shape(strengthA, widthA) * pulseA + 0.4 * shape(strengthB, widthB) * pulseB);

  if (uHaze > 0.0) {
    float around = atan(uAim.x * dir.y - uAim.y * dir.x, cosAngle);
    vec2 drift = vec2(around * 2.2 + uTime * 0.035, depth * 2.6 - uTime * 0.11);
    float fog = 0.65 * valueNoise(drift * vec2(3.0, 1.0)) + 0.35 * valueNoise(drift * vec2(7.0, 2.3) + 4.1);
    rayLight *= mix(1.0, 0.25 + 1.2 * fog, uHaze);
  }

  if (uShadow.z > 0.0) {
    vec2 toCursor = uShadow.xy - uSource;
    float cursorDistance = length(toCursor);
    float along = dot(delta, toCursor) / max(cursorDistance * cursorDistance, 1e-4);
    float side = abs(delta.x * toCursor.y - delta.y * toCursor.x) / max(cursorDistance, 1e-4);
    float trail = max(along - 1.0, 0.0);
    float width = uShadow.w * along + 0.22 * trail * cursorDistance;
    float behind = smoothstep(0.97, 1.25, along) * exp(-trail * 1.1);
    float shade = (1.0 - smoothstep(width * 0.3, width * 1.6, side)) * behind;
    rayLight *= 1.0 - uShadow.z * 0.62 * shade;
  }

  float boost = 0.0;
  for (int i = 0; i < ${MAX_PULSES}; i++) {
    vec4 wave = uPulses[i];
    if (wave.z <= 0.0) continue;
    float x = (depth - wave.x) / wave.y;
    boost += wave.z * exp(-x * x);
  }
  float light = (rayLight * (1.0 + boost) + glowLight) * reveal;

  if (uNoise > 0.0) {
    float n = fract(sin(dot(coord * 0.02 + uTime * 0.1, vec2(12.9898, 78.233))) * 43758.5453123);
    light *= 1.0 - uNoise + uNoise * n;
  }

  float near = clamp(1.2 - distance / (uResolution.y / uScale), 0.0, 1.0);
  vec3 tint = mix(vec3(0.9), vec3(0.1, 0.3, 0.5) + near * vec3(0.8, 0.6, 0.5), uAtmosphere);
  float gray = dot(tint, vec3(0.299, 0.587, 0.114));
  vec3 hue = max(mix(vec3(gray), tint, uSaturation), 0.0) * uColor;

  float grain = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  if (uLight > 0.5) {
    vec3 color = hue * light;
    float energy = max(color.r, max(color.g, color.b));
    vec3 tone = clamp(1.0 - (1.0 - hue / max(max(hue.r, max(hue.g, hue.b)), 1e-4)) * 1.8, 0.0, 1.0);
    float warm = clamp((min(tone.r, tone.g) - tone.b) * 2.0, 0.0, 1.0);
    vec3 ink = tone * (mix(0.66, 0.94, warm) - 0.1 * smoothstep(0.4, 1.2, energy));
    float density = clamp(0.82 * (1.0 - exp(-1.5 * energy * energy)) * uOpacity + grain, 0.0, 1.0);
    fragColor = vec4(ink * density, density);
    return;
  }
  float level = light < 0.75 ? light : 0.75 + 0.25 * (1.0 - exp(-(light - 0.75) / 0.25));
  float top = max(hue.r, max(hue.g, hue.b));
  hue = mix(hue, vec3(top), smoothstep(0.8, 1.0, level) * 0.45);
  vec3 shown = clamp(hue * level, 0.0, 1.0) * level;
  fragColor = vec4(clamp(shown + grain, 0.0, level) * uOpacity, level * uOpacity);
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseColor = (value: string): number[] | null => {
  const text = String(value || '').trim();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const full = digits.length === 3 ? digits.replace(/./g, digit => digit + digit) : digits;
    return [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16) / 255);
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  if (rgb) return [rgb[1]!, rgb[2]!, rgb[3]!].map(channel => clamp(parseFloat(channel) / 255, 0, 1));
  return null;
};

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const link = (gl: WebGL2RenderingContext): Program | null => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
    return null;
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Program['uniforms'] = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < count; index++) {
    const info = gl.getActiveUniform(program, index);
    if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

const smoother = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const LightRays = ({
  raysOrigin = 'top-center',
  raysColor = '#ffffff',
  raysSpeed = 1,
  lightSpread = 0.5,
  rayLength = 3,
  rayDensity = 1,
  tilt = 0,
  raySharpness = 0.35,
  glow = 0.6,
  haze = 0.25,
  atmosphere = 1,
  intensity = 1,
  pulsating = false,
  fadeDistance = 1,
  saturation = 1,
  followMouse = true,
  mouseInfluence = 0.1,
  cursorShadow = true,
  clickPulse = true,
  noiseAmount = 0,
  distortion = 0,
  intro = true,
  lightMode = false,
  opacity = 1,
  maxDevicePixelRatio = 2,
  className = '',
  style
}: LightRaysProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wakeRef = useRef<(() => void) | null>(null);
  const [generation, setGeneration] = useState(0);

  const settings: Settings = {
    origin: ORIGINS[raysOrigin] || ORIGINS['top-center'],
    color: parseColor(raysColor) || [1, 1, 1],
    speed: Math.max(0, raysSpeed),
    spread: Math.max(0.001, lightSpread),
    length: Math.max(0.01, rayLength),
    density: clamp(rayDensity, 0.1, 6),
    tilt: (clamp(tilt, -90, 90) * Math.PI) / 180,
    sharpness: clamp(raySharpness, 0, 1),
    glow: Math.max(0, glow),
    haze: clamp(haze, 0, 1),
    atmosphere: clamp(atmosphere, 0, 1),
    intensity: Math.max(0, intensity),
    pulsating,
    fade: Math.max(0.01, fadeDistance),
    saturation: Math.max(0, saturation),
    follow: followMouse,
    influence: clamp(mouseInfluence, 0, 1),
    cursorShadow,
    clickPulse,
    noise: clamp(noiseAmount, 0, 1),
    distortion,
    intro,
    light: lightMode,
    opacity: clamp(opacity, 0, 1),
    maxRatio: clamp(maxDevicePixelRatio, 0.5, 3)
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    wakeRef.current?.();
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance'
    });
    const shader = gl ? link(gl) : null;
    if (!gl || !shader) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const vao = gl.createVertexArray();
    const size = { width: 1, height: 1, ratio: 1 };
    const pointer = { x: 0.5, y: 0.5, inside: false, seen: false };
    const aim = { x: 0.5, y: 0.5 };
    const shade = { x: 0.5, y: 0.5, presence: 0 };
    const pulses: { age: number }[] = [];
    const pulseData = new Float32Array(MAX_PULSES * 4);
    let time = 0;
    let opening = settingsRef.current.intro && !reduced && generation === 0 ? 0 : 1;
    let raf = 0;
    let last = 0;
    let visible = true;
    let pageVisible = document.visibilityState !== 'hidden';
    let lost = false;

    const resize = () => {
      const s = settingsRef.current;
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);
      const detail = s.density * (0.35 + 0.65 * s.sharpness);
      const sampling = Math.max(clamp(0.35 + 0.3 * detail, 0.5, 2), s.noise > 0 ? 1 : 0);
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        s.maxRatio,
        sampling,
        Math.sqrt(PIXEL_BUDGET / (cssWidth * cssHeight))
      );
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      size.width = cssWidth;
      size.height = cssHeight;
      size.ratio = width / cssWidth;
    };

    const frame = (now: number) => {
      raf = 0;
      if (lost) return;
      const s = settingsRef.current;
      const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
      last = Math.max(last, now);
      time += dt * s.speed * (reduced ? 0.35 : 1);
      if (opening < 1) opening = Math.min(1, opening + dt / 1.8);

      const steer = 1 - Math.exp(-dt / 0.2);
      const aimX = s.follow && pointer.seen ? pointer.x : 0.5;
      const aimY = s.follow && pointer.seen ? pointer.y : 0.5;
      aim.x += (aimX - aim.x) * steer;
      aim.y += (aimY - aim.y) * steer;
      const glide = 1 - Math.exp(-dt / 0.08);
      shade.x += (pointer.x - shade.x) * glide;
      shade.y += (pointer.y - shade.y) * glide;
      const shading = pointer.inside && s.cursorShadow && !reduced;
      shade.presence += ((shading ? 1 : 0) - shade.presence) * (1 - Math.exp(-dt / (shading ? 0.25 : 0.5)));

      for (let index = pulses.length - 1; index >= 0; index--) {
        const pulse = pulses[index]!;
        pulse.age += dt;
        if (pulse.age >= 2) pulses.splice(index, 1);
      }
      pulseData.fill(0);
      pulses.forEach((pulse, index) => {
        const t = pulse.age;
        pulseData[index * 4] = 0.05 + t * 1.05;
        pulseData[index * 4 + 1] = 0.14 + t * 0.14;
        pulseData[index * 4 + 2] = 0.9 * smoother(t / 0.15) * (1 - smoother(t / 2));
      });

      const width = size.width;
      const height = size.height;
      const [anchorX = 0.5, anchorY = 0] = s.origin.anchor;
      const [originX = 0, originY = 1] = s.origin.dir;
      const sourceX = anchorX * width;
      const sourceY = anchorY * height;
      const cos = Math.cos(s.tilt);
      const sin = Math.sin(s.tilt);
      let dirX = originX * cos - originY * sin;
      let dirY = originX * sin + originY * cos;
      if (s.follow && s.influence > 0) {
        const mx = aim.x * width - sourceX;
        const my = aim.y * height - sourceY;
        const ml = Math.hypot(mx, my) || 1;
        const bx = dirX + (mx / ml - dirX) * s.influence;
        const by = dirY + (my / ml - dirY) * s.influence;
        const bl = Math.hypot(bx, by) || 1;
        dirX = bx / bl;
        dirY = by / bl;
      }
      const eased = 1 - Math.pow(1 - opening, 3);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(shader.program);
      gl.bindVertexArray(vao);
      const u = (name: string) => shader.uniforms[name] ?? null;
      gl.uniform2f(u("uResolution"), canvas.width, canvas.height);
      gl.uniform1f(u("uScale"), size.ratio);
      gl.uniform1f(u("uTime"), time);
      gl.uniform2f(u("uSource"), sourceX, sourceY);
      gl.uniform2f(u("uAim"), dirX, dirY);
      gl.uniform1f(u("uReach"), Math.max(width, height));
      gl.uniform3f(u("uColor"), s.color[0] ?? 1, s.color[1] ?? 1, s.color[2] ?? 1);
      gl.uniform1f(u("uSpread"), s.spread);
      gl.uniform1f(u("uLength"), s.length);
      gl.uniform1f(u("uFade"), s.fade);
      gl.uniform1f(u("uSaturation"), s.saturation);
      gl.uniform1f(u("uPulsating"), s.pulsating ? 1 : 0);
      gl.uniform1f(u("uNoise"), s.noise);
      gl.uniform1f(u("uDistortion"), s.distortion);
      gl.uniform1f(u("uDensity"), s.density);
      gl.uniform1f(u("uSharpness"), s.sharpness);
      gl.uniform1f(u("uGlow"), s.glow);
      gl.uniform1f(u("uHaze"), s.haze);
      gl.uniform1f(u("uAtmosphere"), s.atmosphere);
      gl.uniform1f(u("uIntensity"), s.intensity);
      gl.uniform4f(u("uShadow"), shade.x * width, shade.y * height, shade.presence, 16);
      gl.uniform4fv(u("uPulses"), pulseData);
      gl.uniform2f(u("uIntro"), eased * 2.6, smoother(opening / 0.5));
      gl.uniform1f(u("uLight"), s.light ? 1 : 0);
      gl.uniform1f(u("uOpacity"), s.opacity);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const settling =
        Math.abs(aim.x - aimX) > 1e-4 ||
        Math.abs(aim.y - aimY) > 1e-4 ||
        (shade.presence > 1e-3 && Math.abs(shade.x - pointer.x) + Math.abs(shade.y - pointer.y) > 1e-4) ||
        Math.abs((shading ? 1 : 0) - shade.presence) > 1e-3 ||
        pulses.length > 0;
      const busy = s.speed > 0 || opening < 1 || settling;
      if (busy && visible && pageVisible) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || lost || !visible || !pageVisible) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = () => {
      resize();
      wake();
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / Math.max(1, rect.width),
        y: (event.clientY - rect.top) / Math.max(1, rect.height),
        inside:
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const spot = locate(event);
      if (!pointer.inside && spot.inside) {
        shade.x = spot.x;
        shade.y = spot.y;
      }
      pointer.x = spot.x;
      pointer.y = spot.y;
      pointer.inside = spot.inside;
      pointer.seen = true;
      wake();
    };
    const onPointerDown = (event: PointerEvent) => {
      const s = settingsRef.current;
      const spot = locate(event);
      if (!spot.inside || !s.clickPulse || reduced) return;
      pulses.push({ age: 0 });
      if (pulses.length > MAX_PULSES) pulses.shift();
      wake();
    };
    const onLeave = () => {
      pointer.inside = false;
      wake();
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') onLeave();
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);

    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onRestored = () => setGeneration(value => value + 1);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const resizeObserver = new ResizeObserver(() => {
      resize();
      wake();
    });
    resizeObserver.observe(container);

    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      wake();
    });
    intersection.observe(container);

    const onVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden';
      wake();
    };
    document.addEventListener('visibilitychange', onVisibility);

    resize();
    wake();

    return () => {
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      resizeObserver.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      if (!gl.isContextLost()) {
        gl.deleteVertexArray(vao);
        gl.deleteProgram(shader.program);
      }
    };
  }, [generation]);

  return (
    <div ref={containerRef} className={cx(styles.rays, className)} style={style} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
};
```

```css
/* LightRays.module.css */
:where(.rays) {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
```

### 5.5 Pola formularza

```css
/* Field.module.css */
/* Label, control and hint are separate lines with their own rhythm: the label reads as a title for the
   control, the hint as quieter secondary text, so neither sticks to the input. */
.field {
  display: grid;
  gap: var(--tf-space-2);
  min-width: 0;
}

/* The hint reads with its label, above the control, so it never runs into the next field's label.
   Errors stay below the control they refer to. */
.labelRow {
  order: -2;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--tf-space-2);
}

.label {
  color: var(--tf-color-text);
  font-size: var(--tf-text-sm);
  font-weight: var(--tf-weight-medium);
  line-height: var(--tf-leading-snug);
}

.required {
  color: var(--tf-color-text-tertiary);
  margin-left: 2px;
}

.description {
  order: -1;
  margin-top: calc(var(--tf-space-1) * -1);
  color: var(--tf-color-text-tertiary);
  font-size: var(--tf-text-xs);
  line-height: var(--tf-leading-normal);
}

.error {
  display: flex;
  /* Right under the input it refers to. */
  margin-top: calc(var(--tf-space-1) * -1);
  line-height: var(--tf-leading-normal);
  align-items: flex-start;
  gap: var(--tf-space-1);
  color: var(--tf-color-danger);
  font-size: var(--tf-text-xs);
  line-height: var(--tf-leading-snug);
}

.error::before {
  content: "";
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  margin-top: 1px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='none' stroke='black' stroke-width='2.4'/><path d='M12 7v6M12 16.5v.5' stroke='black' stroke-width='2.4' stroke-linecap='round'/></svg>") center / contain no-repeat;
  mask: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='none' stroke='black' stroke-width='2.4'/><path d='M12 7v6M12 16.5v.5' stroke='black' stroke-width='2.4' stroke-linecap='round'/></svg>") center / contain no-repeat;
}

/* Input shell shared by text, number, search, select and combobox. */
.control {
  display: flex;
  align-items: center;
  gap: var(--tf-space-2);
  min-width: 0;
  height: var(--tf-control-md);
  padding: 0 var(--tf-space-2-5);
  border: 1px solid var(--tf-color-border);
  border-radius: var(--tf-radius-md);
  background: var(--tf-color-field);
  color: var(--tf-color-text);
  font-size: var(--tf-text-sm);
  transition:
    border-color var(--tf-duration-fast) ease,
    box-shadow var(--tf-duration-fast) ease,
    background-color var(--tf-duration-fast) ease;
}

.control:has(:focus-visible),
.control[data-focus-within],
.control[data-focus-visible] {
  /* One clear green edge on focus, without a second faint halo around it. */
  border-color: color-mix(in srgb, var(--tf-color-accent) 70%, transparent);
  box-shadow: none;
}

.control[data-invalid],
.field[data-invalid] .control {
  border-color: var(--tf-color-danger-border);
}

.control[data-disabled],
.field[data-disabled] .control {
  opacity: 0.5;
  cursor: default;
}

@media (hover: hover) and (pointer: fine) {
  .control:hover:not(:has(:focus-visible)) {
    border-color: var(--tf-color-border-strong);
  }
}

.sm {
  height: var(--tf-control-sm);
  font-size: var(--tf-text-xs);
}

.lg {
  height: var(--tf-control-lg);
  font-size: var(--tf-text-md);
}

.input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}

.input::placeholder {
  color: var(--tf-color-text-tertiary);
}

.adornment {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--tf-color-text-tertiary);
}

.adornment :where(svg) {
  width: 0.9375rem;
  height: 0.9375rem;
}

.textarea {
  min-height: 5.5rem;
  padding: var(--tf-space-2) var(--tf-space-2-5);
  border: 1px solid var(--tf-color-border);
  border-radius: var(--tf-radius-md);
  background: var(--tf-color-field);
  color: var(--tf-color-text);
  font-size: var(--tf-text-sm);
  line-height: var(--tf-leading-normal);
  resize: vertical;
  outline: none;
  transition:
    border-color var(--tf-duration-fast) ease,
    box-shadow var(--tf-duration-fast) ease;
}

.textarea[data-focus-visible],
.textarea:focus-visible {
  /* One clear green edge on focus, without a second faint halo around it. */
  border-color: color-mix(in srgb, var(--tf-color-accent) 70%, transparent);
  box-shadow: none;
}

.textarea[data-invalid] {
  border-color: var(--tf-color-danger-border);
}

.stepper {
  display: grid;
  place-items: center;
  width: 1.375rem;
  height: 1.375rem;
  padding: 0;
  border: 0;
  border-radius: var(--tf-radius-xs);
  background: transparent;
  color: var(--tf-color-text-tertiary);
  outline: none;
}

.stepper[data-pressed] {
  background: var(--tf-color-surface-hover);
}

.stepper[data-disabled] {
  opacity: 0.35;
}

@media (hover: hover) and (pointer: fine) {
  .stepper[data-hovered] {
    color: var(--tf-color-text);
    background: var(--tf-color-surface-hover);
  }
}

.stepper :where(svg) {
  width: 0.8125rem;
  height: 0.8125rem;
}

.clear {
  composes: stepper;
}

.searchField[data-empty] .clear {
  visibility: hidden;
}

/* Search inputs bring their own clear button; hide the browser's so there is only one "x". */
.input::-webkit-search-cancel-button,
.input::-webkit-search-decoration {
  display: none;
  -webkit-appearance: none;
  appearance: none;
}

/*
 * Browser autofill paints its own blue or yellow box inside the field. The fill is held back
 * indefinitely so a saved email or password looks like any other value.
 */
.input:-webkit-autofill,
.input:-webkit-autofill:hover,
.input:-webkit-autofill:focus,
.input:autofill {
  -webkit-text-fill-color: var(--tf-color-text);
  caret-color: var(--tf-color-text);
  transition:
    background-color 600000s 0s,
    color 600000s 0s;
}
```

```tsx
// FieldParts.tsx
import type { ReactNode } from "react";
import { ButtonContext, FieldError, Label, Provider, Text, type ValidationResult } from "react-aria-components";
import styles from "./Field.module.css";

export interface FieldChromeProps {
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  isRequired?: boolean;
  /** Extra element next to the label (e.g. counter or help link). */
  labelAside?: ReactNode;
}

export function FieldLabel({ label, isRequired, labelAside }: Pick<FieldChromeProps, "label" | "isRequired" | "labelAside">) {
  if (!label && !labelAside) return null;
  return (
    <div className={styles.labelRow}>
      {label ? (
        <Label className={styles.label}>
          {label}
          {isRequired ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
      ) : (
        <span />
      )}
      {/* The field's own button context (e.g. a number field's +/− slots) must not reach a button placed here, such as an InfoTip. */}
      {labelAside ? <Provider values={[[ButtonContext, null]]}>{labelAside}</Provider> : null}
    </div>
  );
}

export function FieldFooter({ description, errorMessage }: Pick<FieldChromeProps, "description" | "errorMessage">) {
  return (
    <>
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </>
  );
}

export { styles as fieldStyles };
```

```tsx
// TextField.tsx
import type { ReactNode } from "react";
import {
  Group,
  Input,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { parseDate } from "@internationalized/date";
import { cx } from "../../lib/cx";
import { DateField } from "./DateField";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";

export interface TextFieldProps extends Omit<AriaTextFieldProps, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  iconStart?: ReactNode;
  /** Trailing element inside the input shell (unit, button). */
  end?: ReactNode;
  className?: string;
}

export function TextField({
  label,
  description,
  errorMessage,
  labelAside,
  placeholder,
  size = "md",
  iconStart,
  end,
  className,
  ...props
}: TextFieldProps) {
  // Dates use the app's own calendar picker instead of the browser's native one, keeping the "yyyy-mm-dd" string API.
  if (props.type === "date") {
    let value = null;
    try { value = props.value ? parseDate(props.value) : null; } catch { /* Invalid external date values render as an empty field. */ }
    return (
      <DateField
        label={label}
        description={description}
        errorMessage={errorMessage}
        labelAside={labelAside}
        size={size}
        className={className}
        aria-label={props["aria-label"]}
        isRequired={props.isRequired}
        isDisabled={props.isDisabled}
        isReadOnly={props.isReadOnly}
        autoFocus={props.autoFocus}
        name={props.name}
        value={value}
        onChange={(date) => props.onChange?.(date ? date.toString() : "")}
      />
    );
  }
  return (
    <AriaTextField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <Group className={cx(styles.control, styles[size])}>
        {iconStart ? (
          <span className={styles.adornment} aria-hidden="true">
            {iconStart}
          </span>
        ) : null}
        <Input className={styles.input} placeholder={placeholder} />
        {end ? <span className={styles.adornment}>{end}</span> : null}
      </Group>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

export interface TextAreaProps extends Omit<AriaTextFieldProps, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function TextArea({ label, description, errorMessage, labelAside, placeholder, rows = 4, className, ...props }: TextAreaProps) {
  return (
    <AriaTextField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <AriaTextArea className={styles.textarea} placeholder={placeholder} rows={rows} />
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
```

### 5.6 Przycisk i spinner

```css
/* Button.module.css */
.button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--tf-space-1-5);
  flex-shrink: 0;
  height: var(--tf-control-md);
  padding: 0 var(--tf-space-3);
  border: 1px solid transparent;
  border-radius: var(--tf-radius-md);
  font-size: var(--tf-text-sm);
  font-weight: var(--tf-weight-medium);
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  outline: none;
  transition:
    transform var(--tf-duration-press) var(--tf-ease-out),
    background-color var(--tf-duration-fast) ease,
    border-color var(--tf-duration-fast) ease,
    color var(--tf-duration-fast) ease,
    box-shadow var(--tf-duration-fast) ease;
}

/* Press feedback: the interface heard the click. */
.button[data-pressed] {
  transform: scale(0.97);
}

.button[data-focus-visible] {
  outline: 2px solid var(--tf-color-focus-ring);
  outline-offset: 2px;
}

.button[data-disabled] {
  cursor: default;
  opacity: 0.45;
}

.button[data-pending] {
  cursor: progress;
}

.block {
  display: flex;
  width: 100%;
}

.sm {
  height: var(--tf-control-sm);
  padding: 0 var(--tf-space-2-5);
  border-radius: var(--tf-radius-sm);
  font-size: var(--tf-text-xs);
}

.lg {
  height: var(--tf-control-lg);
  padding: 0 var(--tf-space-4);
  border-radius: var(--tf-radius-md);
  font-size: var(--tf-text-md);
}

.content {
  display: inline-flex;
  align-items: center;
  gap: inherit;
  min-width: 0;
  transition:
    opacity var(--tf-duration-fast) ease,
    filter var(--tf-duration-fast) ease;
}

/* Blur bridges the crossfade between label and spinner. */
.content[data-hidden] {
  opacity: 0;
  filter: blur(2px);
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.icon {
  display: inline-flex;
  flex-shrink: 0;
}

.icon :where(svg) {
  width: 1em;
  height: 1em;
}

.sm .icon :where(svg) {
  width: 0.875rem;
  height: 0.875rem;
}

.spinner {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

/* Variants */
.primary {
  border-color: var(--tf-color-primary-border);
  background: var(--tf-color-primary);
  color: var(--tf-color-on-primary);
  font-weight: var(--tf-weight-medium);
  letter-spacing: 0.005em;
}

.accent {
  background: var(--tf-color-accent-deep);
  border-color: transparent;
  color: var(--tf-color-text);
}

.secondary {
  background: var(--tf-color-surface-raised);
  border-color: var(--tf-color-border);
  color: var(--tf-color-text);
  box-shadow: var(--tf-shadow-sm);
}

.ghost {
  background: transparent;
  color: var(--tf-color-text-secondary);
}

/* Destructive actions are solid red, so the risky choice is never mistaken for the safe one. */
.danger {
  background: #c93a36;
  border-color: #d9524d;
  color: #ffffff;
}

/* Confirms something good and final: accepting, approving. Same green as every primary button. */
.success {
  border-color: var(--tf-color-primary-border);
  background: var(--tf-color-primary);
  color: var(--tf-color-on-primary);
}

/* Quiet destructive action: red text that turns into a red surface on hover and press. */
.danger-ghost {
  background: transparent;
  color: var(--tf-color-danger);
}

.danger-ghost[data-pressed] {
  border-color: var(--tf-color-danger-border);
  background: rgb(240 96 93 / 0.22);
  color: #ff8a86;
}

.danger[data-pressed] {
  background: #b5322f;
}

@media (hover: hover) and (pointer: fine) {
  .danger-ghost[data-hovered]:not([data-pressed]) {
    border-color: var(--tf-color-danger-border);
    background: var(--tf-color-danger-soft);
    color: #ff7c78;
  }

  .primary[data-hovered],
  .success[data-hovered] {
    border-color: var(--tf-color-primary-border-hover);
    background: var(--tf-color-primary-hover);
  }

  .accent[data-hovered] {
    background: var(--tf-color-accent-deep-hover);
  }

  .secondary[data-hovered] {
    background: var(--tf-color-surface-hover);
    border-color: var(--tf-color-border-strong);
  }

  .ghost[data-hovered] {
    background: var(--tf-color-surface-hover);
    color: var(--tf-color-text);
  }

  .danger[data-hovered] {
    background: #d6433f;
  }
}
```

```tsx
// Button.tsx
import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { Spinner } from "../../components/Spinner/Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "danger-ghost" | "success";
export type ButtonSize = "sm" | "md" | "lg";

interface SharedButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. Decorative; the label names the action. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  className?: string;
  children?: ReactNode;
}

export interface ButtonProps extends SharedButtonProps, Omit<AriaButtonProps, "className" | "children"> {
  /** Shows a spinner, keeps the width and announces the pending state. */
  loading?: boolean;
}

function Content({ iconStart, iconEnd, children, loading }: SharedButtonProps & { loading?: boolean }) {
  return (
    <>
      <span className={styles.content} data-hidden={loading || undefined}>
        {iconStart ? <span className={styles.icon} aria-hidden="true">{iconStart}</span> : null}
        {children ? <span className={styles.label}>{children}</span> : null}
        {iconEnd ? <span className={styles.icon} aria-hidden="true">{iconEnd}</span> : null}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <Spinner size="sm" tone="current" />
        </span>
      ) : null}
    </>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  iconStart,
  iconEnd,
  block,
  loading,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      isPending={loading || props.isPending}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
    >
      <Content iconStart={iconStart} iconEnd={iconEnd} loading={loading || props.isPending}>
        {children}
      </Content>
    </AriaButton>
  );
}

export interface LinkButtonProps extends SharedButtonProps, Omit<AriaLinkProps, "className" | "children"> {}

/** Navigation styled as a button. Uses the router configured through RouterProvider. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  iconStart,
  iconEnd,
  block,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <AriaLink
      {...props}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
    >
      <Content iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </Content>
    </AriaLink>
  );
}
```

```css
/* Spinner.module.css */
.spinner {
  display: inline-flex;
  flex-shrink: 0;
  color: var(--tf-color-text-secondary);
}

.spinner svg {
  width: 100%;
  height: 100%;
  /* A fast spin reads as a faster app. */
  animation: spin 640ms linear infinite;
}

.sm {
  width: 0.875rem;
  height: 0.875rem;
}

.md {
  width: 1.125rem;
  height: 1.125rem;
}

.lg {
  width: 1.75rem;
  height: 1.75rem;
}

.accent {
  color: var(--tf-color-accent);
}

.current {
  color: currentColor;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner svg {
    animation-duration: 1600ms;
  }
}
```

```tsx
// Spinner.tsx
import { cx } from "../../lib/cx";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** `current` inherits text colour (inside buttons). */
  tone?: "default" | "accent" | "current";
  /** Accessible label; omit when a surrounding element already announces loading. */
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", tone = "default", label, className }: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, styles[size], styles[tone], className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
```

### 5.7 Przełącznik języka (`SegmentedControl` / `Segment`)

Fragment `Toggle.tsx`:

```tsx
import type { ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup, type ToggleButtonGroupProps, type ToggleButtonProps } from "react-aria-components";
import { cx } from "../../lib/cx";
import styles from "./Toggle.module.css";

export interface SegmentedControlProps extends Omit<ToggleButtonGroupProps, "className" | "children" | "selectionMode"> {
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

export function SegmentedControl({ children, size = "md", className, ...props }: SegmentedControlProps) {
  return (
    <ToggleButtonGroup {...props} selectionMode="single" disallowEmptySelection
      className={cx(styles.segmented, styles[`segmented-${size}`], className)}>
      {children}
    </ToggleButtonGroup>
  );
}

export function Segment({ children, ...props }: Omit<ToggleButtonProps, "className" | "children"> & { children: ReactNode }) {
  return <ToggleButton {...props} className={styles.segment}>{children}</ToggleButton>;
}
```

Fragment `Toggle.module.css`:

```css
.segmented {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--tf-color-border);
  border-radius: var(--tf-radius-md);
  background: var(--tf-color-bg-sunken);
}

.segment {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--tf-space-1);
  min-width: var(--tf-control-sm);
  height: calc(var(--tf-control-md) - 6px);
  padding: 0 var(--tf-space-2-5);
  border: 1px solid transparent;
  border-radius: var(--tf-radius-sm);
  background: transparent;
  color: var(--tf-color-text-secondary);
  font-size: var(--tf-text-sm);
  font-weight: var(--tf-weight-medium);
  outline: none;
  transition:
    background-color var(--tf-duration-fast) ease,
    color var(--tf-duration-fast) ease,
    transform var(--tf-duration-press) var(--tf-ease-out);
}

.segmented-sm .segment {
  height: calc(var(--tf-control-sm) - 6px);
  font-size: var(--tf-text-xs);
}

.segment[data-selected] {
  border-color: var(--tf-color-border-strong);
  background: var(--tf-color-surface-overlay);
  color: var(--tf-color-text);
  box-shadow: var(--tf-shadow-sm);
}

.segment[data-focus-visible] {
  outline: 2px solid var(--tf-color-focus-ring);
  outline-offset: 1px;
}

.segment :where(svg) {
  width: 0.875rem;
  height: 0.875rem;
}

@media (hover: hover) and (pointer: fine) {
  .segment[data-hovered]:not([data-selected]) {
    color: var(--tf-color-text);
  }
}
```

### 5.8 `cx`

```ts
/** Joins truthy class names; keeps components free of a classnames dependency. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```

### 5.9 Layout strony: `auth-layout.tsx` + `auth-layout.module.css`

```tsx
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Outlet, Link as RouterLink, useLocation } from "react-router";
import { LightRays, Segment, SegmentedControl } from "@metrivum/ui-web";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { Logo } from "~/modules/marketing/components/Logo";
import "./night-theme.css";
import styles from "./auth-layout.module.css";



/**
 * Sign-in, registration and onboarding: one glossy card under soft beams of light from the top. The card
 * is keyed by the page, so switching between sign-in and registration plays the entrance again.
 */
export default function AuthLayout() {
  const m = useT();
  const { locale, setLocale } = useAppLocale();
  const { pathname } = useLocation();
  // Setting up the profile holds more fields: a wider card; choosing a plan needs room for the plan cards.
  const width = pathname === "/onboarding" ? "wide" : pathname === "/onboarding/plan" ? "plans" : undefined;
  // The night palette also applies to menus rendered in portals.
  useEffect(() => {
    document.documentElement.setAttribute("data-public-theme", "night");
    return () => document.documentElement.removeAttribute("data-public-theme");
  }, []);
  const home = locale === "pl" ? "/pl" : "/";
  return (
    <div className={styles.page} data-public-theme="night">
      <div className={styles.backdrop} aria-hidden="true">
        {/* React Bits "Light Rays" from the top: soft neutral white; it does not react to the pointer. */}
        <LightRays className={styles.light} raysColor="#ffffff" lightSpread={0.85} rayLength={1.2} intensity={0.65} glow={0.3} haze={0.2}
            atmosphere={0} saturation={0} raysSpeed={0.45} followMouse={false} cursorShadow={false} clickPulse={false} opacity={0.8} />
        <span className={styles.grid} />
      </div>
      <header className={styles.top}>
        <RouterLink to={home} className={styles.brand} aria-label={m.auth.backToSite}>
          <Logo />
        </RouterLink>
        <div className={styles.topEnd}>
          <RouterLink to={home} className={styles.back}>
            <ArrowLeft aria-hidden="true" />
            {m.auth.backToSite}
          </RouterLink>
          <SegmentedControl
            size="sm"
            aria-label={m.common.languageLabel}
            selectedKeys={[locale]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (typeof next === "string") setLocale(next);
            }}
          >
            <Segment id="en">EN</Segment>
            <Segment id="pl">PL</Segment>
          </SegmentedControl>
        </div>
      </header>
      <main id="main" className={styles.main} data-width={width}>
        <div className={styles.card} key={pathname}>
          <Outlet />
        </div>
      </main>
      <p className={styles.tagline}>{m.auth.brandLine}</p>
    </div>
  );
}
```

```css
/*
 * Sign-in pages: a glossy graphite card centred under soft beams of light, over a faint training grid.
 * Everything moves gently and once; reduced motion keeps the layout and drops the motion.
 */
.page {
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  background: var(--tf-color-bg);
  color: var(--tf-color-text);
}

/* Backdrop: a pool of light at the top, a few soft beams and a faint grid ------------------------------ */

.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.light {
  position: absolute;
  inset: 0;
}

.grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.03) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.03) 1px, transparent 1px);
  background-size: 4rem 4rem;
  mask-image: radial-gradient(ellipse 60% 55% at 50% 35%, black, transparent 80%);
  animation: grid-in 1.2s var(--tf-ease-out) both;
}

@keyframes grid-in {
  from {
    opacity: 0;
    transform: scale(1.06);
  }
}

/* Top bar ------------------------------------------------------------------------------------------- */

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tf-space-3);
  padding: var(--tf-space-5) var(--tf-space-8);
  animation: fade-down 600ms var(--tf-ease-out) both;
}

.brand img {
  display: block;
  width: auto;
  height: 1.375rem;
}

.topEnd {
  display: flex;
  align-items: center;
  gap: var(--tf-space-5);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: var(--tf-space-1-5);
  color: var(--tf-color-text-secondary);
  font-size: var(--tf-text-sm);
  font-weight: var(--tf-weight-medium);
  transition: color var(--tf-duration-fast) ease;
}

.back svg {
  width: 0.9375rem;
  height: 0.9375rem;
  transition: transform var(--tf-duration-base) var(--tf-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .back:hover {
    color: var(--tf-color-text);
  }

  .back:hover svg {
    transform: translateX(-3px);
  }
}

@keyframes fade-down {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
}

/* Card ---------------------------------------------------------------------------------------------- */

.main {
  display: grid;
  place-items: center;
  padding: var(--tf-space-6) var(--tf-space-5) var(--tf-space-10);
}

.card {
  /* Notices on these pages are warm neutrals: no blue or tinted panels. */
  --tf-color-info: var(--tf-color-text-secondary);
  --tf-color-info-soft: var(--tf-color-field);
  --tf-color-info-border: var(--tf-color-border);

  position: relative;
  display: grid;
  gap: var(--tf-space-5);
  width: min(27rem, 100%);
  padding: var(--tf-space-6) var(--tf-space-8);
  border: 1px solid var(--tf-glass-border);
  border-radius: var(--tf-radius-xl);
  background: var(--tf-gloss), var(--tf-glass);
  box-shadow:
    var(--tf-gloss-edge),
    0 -20px 80px -30px rgb(255 255 255 / 0.12),
    0 40px 90px -30px rgb(0 0 0 / 0.9);
  backdrop-filter: var(--tf-glass-blur);
  animation: card-in 400ms var(--tf-ease-out) both;
}

.main[data-width="wide"] .card {
  width: min(36rem, 100%);
}

.main[data-width="plans"] .card {
  width: min(72rem, 100%);
}

/* A thin line of light along the top edge that sweeps in with the card. */
.card::before {
  content: "";
  position: absolute;
  top: -1px;
  left: 12%;
  right: 12%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.55), transparent);
  animation: edge-in 1.1s 200ms var(--tf-ease-out) both;
}

/* The card fades in where it stands: the loading placeholder sits in the same place, so it must not move. */
@keyframes card-in {
  from {
    opacity: 0;
  }
}

@keyframes edge-in {
  from {
    opacity: 0;
    transform: scaleX(0.2);
  }
}

/* The card's content arrives one piece after another. */
.card > * {
  animation: rise 520ms var(--tf-ease-out) both;
}

.card > :nth-child(1) { animation-delay: 120ms; }
.card > :nth-child(2) { animation-delay: 180ms; }
.card > :nth-child(3) { animation-delay: 240ms; }
.card > :nth-child(4) { animation-delay: 300ms; }
.card > :nth-child(5) { animation-delay: 360ms; }
.card > :nth-child(6) { animation-delay: 420ms; }
.card > :nth-child(n + 7) { animation-delay: 480ms; }

/* Inside forms too: fields step in after the heading. */
.card form > * {
  animation: rise 480ms var(--tf-ease-out) both;
}

.card form > :nth-child(1) { animation-delay: 260ms; }
.card form > :nth-child(2) { animation-delay: 320ms; }
.card form > :nth-child(3) { animation-delay: 380ms; }
.card form > :nth-child(4) { animation-delay: 440ms; }
.card form > :nth-child(n + 5) { animation-delay: 500ms; }

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

/* Headings: white at the top fading to grey, with a light sweep when the page opens. */
.card h1 {
  background: linear-gradient(180deg, #ffffff 0%, #d6d6d4 50%, #8a8a88 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  font-size: var(--tf-text-2xl);
  font-weight: var(--tf-weight-semibold);
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.card h1 + p {
  font-size: var(--tf-text-sm);
  line-height: var(--tf-leading-relaxed);
}

.tagline {
  padding: var(--tf-space-4) var(--tf-space-6);
  color: var(--tf-color-text-tertiary);
  font-size: var(--tf-text-xs);
  text-align: center;
  animation: rise 600ms 600ms var(--tf-ease-out) both;
}

/* Small screens ------------------------------------------------------------------------------------- */

@media (max-width: 40rem) {
  .top {
    padding: var(--tf-space-4) var(--tf-space-4);
  }

  .back {
    display: none;
  }

  .main {
    align-items: start;
    padding: var(--tf-space-2) var(--tf-space-3) var(--tf-space-6);
  }

  .card {
    padding: var(--tf-space-6) var(--tf-space-5);
  }


}

@media (prefers-reduced-motion: reduce) {
  .grid,
  .top,
  .card,
  .card::before,
  .card > *,
  .card form > *,
  .card h1,
  .tagline {
    animation: none;
  }
}
```

### 5.10 Logo

```tsx
// Logo.tsx
import { BrandMark } from "~/shared/ui/BrandMark";
import styles from "./Logo.module.css";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={size === "sm" ? styles.sm : styles.md}>
      <BrandMark />
      <span>Metrivum</span>
    </span>
  );
}
```

```css
/* Logo.module.css */
.md,
.sm {
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
  color: var(--tf-color-text);
  font-weight: var(--tf-weight-semibold);
  line-height: 1;
  white-space: nowrap;
}

.md { font-size: 1.375rem; }
.sm { font-size: 1.125rem; }

.md svg,
.sm svg {
  width: auto;
  height: 1em;
  flex-shrink: 0;
}
```

```tsx
// BrandMark.tsx
/** The Metrivum symbol (the M), drawn in the current text colour so it follows the theme. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="413 233 706 556" fill="currentColor" aria-hidden="true" focusable="false">
      <polygon points="415,235 765,497 950,365 946,505 755,650 535,478 533,787 415,695" />
      <polygon points="970,345 1117,235 1117,370 972,478" />
      <polygon points="778,682 1117,418 1117,580 868,772" />
    </svg>
  );
}
```

### 5.11 Nagłówek, stopka i błąd formularza: `AuthHeader`

```tsx
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link as RouterLink } from "react-router";
import styles from "./AuthHeader.module.css";

/** `back` adds an arrow before the title that leaves the form (for example back to the app when adding an account). */
export function AuthHeader({ title, subtitle, back }: { title: string; subtitle?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        {back ? <RouterLink to={back.to} className={styles.back} aria-label={back.label} title={back.label}><ArrowLeft aria-hidden="true" /></RouterLink> : null}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className={styles.footer}>{children}</p>;
}

/** An error about the whole form (network, rate limit): one small red line, like the errors under the fields. */
export function AuthFormError({ children }: { children: ReactNode }) {
  return <p className={styles.formError} role="alert">{children}</p>;
}
```

```css
.header {
  display: grid;
  gap: var(--tf-space-2);
}

.title {
  font-family: var(--tf-font-display);
  font-size: var(--tf-text-3xl);
  font-weight: var(--tf-weight-semibold);
  letter-spacing: var(--tf-tracking-display);
  line-height: 1.1;
}

.subtitle {
  color: var(--tf-color-text-secondary);
  font-size: var(--tf-text-sm);
}

/* "New to Metrivum? Create an account": one quiet centred line, the link underlined like the form's text links. */
.footer {
  padding-top: var(--tf-space-4);
  border-top: 1px solid var(--tf-color-border-subtle);
  color: var(--tf-color-text-tertiary);
  font-size: var(--tf-text-sm);
  text-align: center;
}

.footer a {
  margin-left: 0.25rem;
  color: var(--tf-color-text-secondary);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--tf-color-border-strong);
  transition: color 160ms ease, text-decoration-color 160ms ease;
}

.footer a:hover {
  color: var(--tf-color-text);
  text-decoration-color: currentColor;
}

.titleRow {
  display: flex;
  align-items: center;
  gap: var(--tf-space-2);
}

/* Back arrow before the title: on hover it steps back a little and brightens, no background. */
.back {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-left: calc(var(--tf-space-2) * -1);
  border-radius: var(--tf-radius-sm);
  color: var(--tf-color-text-tertiary);
  transition: color 160ms ease, transform 200ms var(--tf-ease-out, ease-out);
}

.back:hover {
  color: var(--tf-color-text);
  transform: translateX(-3px);
}

.back:active {
  transform: translateX(-5px);
}

@media (prefers-reduced-motion: reduce) {
  .back,
  .back:hover,
  .back:active {
    transform: none;
  }
}

.back svg {
  width: 1.125rem;
  height: 1.125rem;
}

.formError {
  margin-top: calc(var(--tf-space-2) * -1);
  color: var(--tf-color-danger);
  font-size: var(--tf-text-xs);
  line-height: var(--tf-leading-snug);
}

.formError a {
  color: inherit;
  font-weight: var(--tf-weight-medium);
  text-decoration: underline;
  text-underline-offset: 2px;
}
```

### 5.12 `form.module.css`

```css
.form {
  display: grid;
  gap: var(--tf-space-4);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--tf-space-3);
}

.link {
  color: var(--tf-color-text-secondary);
  font-size: var(--tf-text-xs);
}

.link:hover {
  color: var(--tf-color-text);
}

.textButton {
  justify-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--tf-color-text-secondary);
  font-size: var(--tf-text-sm);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--tf-color-border-strong);
}

.textButton:hover {
  color: var(--tf-color-text);
}

.code input {
  font-size: var(--tf-text-xl);
  letter-spacing: 0.3em;
  font-variant-numeric: tabular-nums;
}


/* Terms acceptance on sign-up: the checkbox with its links, and the error right under it. */
.terms {
  display: grid;
  gap: var(--tf-space-1);
  font-size: var(--tf-text-sm);
}

.terms a {
  color: var(--tf-color-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--tf-color-border-strong);
}

.terms a:hover {
  text-decoration-color: currentColor;
}

.fieldError {
  color: var(--tf-color-danger);
  font-size: var(--tf-text-xs);
  line-height: var(--tf-leading-snug);
}

/* Quiet context under a header or after a form: who is signed in, what to do if something is lost. */
.note {
  color: var(--tf-color-text-tertiary);
  font-size: var(--tf-text-sm);
  line-height: var(--tf-leading-normal);
}
```

### 5.13 Strona: `login.tsx`

Logika logowania (Supabase, Turnstile, wiele kont) jest specyficzna dla Metrivum; do odtworzenia wyglądu liczy się zwracany JSX i klasy. Turnstile renderuje się w trybie `appearance: "interaction-only"`, `theme: "dark"`, `size: "flexible"`, więc zwykle jest niewidoczny.

```tsx
import { useState, type FormEvent } from "react";
import { Navigate, Link as RouterLink, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, TextField } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { sanitizeReturnTo } from "~/shared/session/returnTo";
import { useSessionManager, useSessionState } from "~/shared/session/SessionProvider";
import { supabaseConfigured } from "~/shared/session/supabase";
import { AddAccountSwitch } from "../components/AddAccountSwitch";
import { useTurnstile } from "../components/Turnstile";
import { AuthFooter, AuthFormError, AuthHeader } from "../components/AuthHeader";
import form from "../components/form.module.css";
import { authErrorField, authErrorText, isEmailNotConfirmed, isUnknownAccount } from "../lib/authErrors";
import { callbackUrl, slotParam } from "../lib/urls";
import { isValidEmail, normalizeEmail } from "../lib/email";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Sign in — Metrivum");

export default function Login() {
  const m = useT();
  const t = m.auth.login;
  const [params] = useSearchParams();
  const manager = useSessionManager();
  const state = useSessionState();
  const navigate = useNavigate();
  const adding = params.get("add") === "1";
  const returnTo = sanitizeReturnTo(params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "code">("password");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; field: "email" | "password" | null; unconfirmed?: boolean } | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const captcha = useTurnstile(`login:${params.toString()}:${state.generation}:${mode}:${normalizeEmail(email)}`);

  if (!supabaseConfigured()) {
    return <Alert tone="danger" title={m.shell.notConfiguredTitle}>{m.shell.notConfiguredBody}</Alert>;
  }
  // Already signed in and not adding another account: go straight in.
  if (state.phase === "ready" && state.activeSlot !== null && !adding && slotParam(params.get("slot")) === null) {
    return <Navigate to={returnTo} replace />;
  }

  const slot = manager.slotForNewSignIn(slotParam(params.get("slot")));
  if (slot === null) {
    return (
      <>
        <AuthHeader title={t.addingTitle} />
        <Alert tone="warning" title={t.full} />
      </>
    );
  }

  const emailInvalid = submitted && !isValidEmail(email);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (pending || !isValidEmail(email) || (mode === "password" && !password) || slot === null) return;
    const captchaOptions = captcha.take();
    if (!captchaOptions) return;
    const address = normalizeEmail(email);
    setPending(true);
    setError(null);
    const client = manager.client(slot, captcha.isCurrent, { email: address });
    try {
      if (mode === "code") {
        const { error: otpError } = await client.auth.signInWithOtp({
          email: address,
          options: { ...captchaOptions, shouldCreateUser: false, emailRedirectTo: callbackUrl(slot, returnTo, address) },
        });
        if (!captcha.isCurrent()) return;
        // "No such account" looks exactly like "code sent": the form must not reveal who is registered.
        if (otpError && !isUnknownAccount(otpError)) throw otpError;
        navigate(`/auth/verify?type=email&slot=${slot}&email=${encodeURIComponent(address)}&returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }
      const { data, error: signInError } = await client.auth.signInWithPassword({ email: address, password, options: captchaOptions });
      if (!captcha.isCurrent()) return;
      if (signInError) throw signInError;
      if (!data.session) throw new Error("No session");
      await manager.completeSignIn(slot, data.session, captcha.isCurrent);
      navigate(returnTo, { replace: true });
    } catch (caught) {
      if (!captcha.isCurrent()) return;
      const field = authErrorField(caught);
      setError({ text: authErrorText(m, caught), field: field === "password" && mode !== "password" ? "email" : field, unconfirmed: isEmailNotConfirmed(caught) });
    } finally {
      await client.auth.dispose?.();
      if (captcha.isCurrent()) setPending(false);
    }
  }

  return (
    <>
      <AuthHeader title={adding ? t.addingTitle : t.title} subtitle={adding ? t.addingSubtitle : t.subtitle} back={adding ? { to: "/app", label: m.common.back } : undefined} />
      {adding ? <AddAccountSwitch current="login" slot={slot} /> : null}
      <form className={form.form} onSubmit={onSubmit} noValidate>
        <TextField placeholder={m.common.ph.email}
          label={m.auth.email}
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(value) => { setEmail(value); if (error?.field) setError(null); }}
          isDisabled={pending}
          isRequired
          isInvalid={emailInvalid || error?.field === "email"}
          errorMessage={emailInvalid ? m.auth.errors.emailInvalid : error?.text}
        />
        {mode === "password" ? (
          <TextField placeholder={m.common.ph.password}
            label={m.auth.password}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(value) => { setPassword(value); if (error?.field) setError(null); }}
            isDisabled={pending}
            isRequired
            isInvalid={(submitted && !password) || error?.field === "password"}
            errorMessage={submitted && !password ? m.auth.errors.required : error?.text}
            labelAside={
              <RouterLink className={form.link} to={`/auth/forgot-password?slot=${slot}`}>
                {t.forgot}
              </RouterLink>
            }
          />
        ) : null}
        {captcha.widget}
        <Button type="submit" variant="primary" block loading={pending} isDisabled={!captcha.ready}>
          {mode === "password" ? t.submit : t.sendCode}
        </Button>
        {error && (!error.field || error.unconfirmed) ? (
          <AuthFormError>
            {error.field ? null : error.text}
            {error.unconfirmed ? <RouterLink to={`/auth/verify?type=signup&slot=${slot}&email=${encodeURIComponent(email)}`}>{m.auth.verify.title}</RouterLink> : null}
          </AuthFormError>
        ) : null}
        <button type="button" className={form.textButton} disabled={pending} onClick={() => setMode(mode === "password" ? "code" : "password")}>
          {mode === "password" ? t.useCode : t.usePassword}
        </button>
      </form>
      {adding ? null : (
        <AuthFooter>
          {t.noAccount} <RouterLink to={`/auth/register${params.get("returnTo") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>{t.register}</RouterLink>
        </AuthFooter>
      )}
    </>
  );
}
```
