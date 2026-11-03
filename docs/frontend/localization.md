# Localization

Web application and authentication screens use `AppLocaleProvider` and `useT()` from `apps/web/app/shared/i18n/AppLocale.tsx`. English defines the `AppMessages` shape; Polish implements it. Dictionaries contain strings and typed formatting/plural functions. The `ui` section covers common interface labels; existing domain-specific keys remain preferred for domain copy.

The provider remembers the selected language, applies the profile language when requested, updates `document.documentElement.lang`, and wraps React Aria with the matching locale. Dates/numbers use locale-aware formatting helpers. Public marketing pages have separate dictionaries and URL-based English/Polish routes, including canonical and hreflang metadata.

Native mobile has its own `src/infrastructure/i18n` context and flat typed dictionaries. Its `t(key, values)` interpolates named placeholders and stores the language through SecureStore; it does not consume the web dictionaries.

Translate visible strings, placeholders, accessibility names, menus and notifications at the rendering boundary. Never translate API enum values, identifiers, stored values, user content or formula syntax. Key parity tests detect missing dictionary entries, not hard-coded UI text: components must actually read the dictionary. Dynamic interface templates use numbered placeholders; substitution is a single pass so user-provided braces and replacement characters remain literal. Matching keys alone does not establish complete coverage: raw server messages, catalog names and user content must be handled separately from application copy. Public product names, keyboard shortcuts, unit symbols and formula syntax remain unchanged.
