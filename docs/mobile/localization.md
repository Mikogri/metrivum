# Mobile localization coverage

`src/infrastructure/i18n/messages.ts` contains explicit typed English/Polish keys. `LocaleProvider` starts with the device language, restores the SecureStore preference, and applies `Profile.locale` when an account opens. An unsupported profile locale falls back to the device language; unsupported device languages fall back to English. Auth language buttons persist the device preference; onboarding submits the selected locale. Settings previews and persists the device language immediately; **Save profile** writes the account locale through the versioned profile API.

Covered surfaces: main native tabs, registered navigation titles, sign-in/registration/recovery controls and notices, onboarding, settings, and shared loading/retry/close/cancel/confirm/dismiss labels. Dynamic user text, names, message bodies, titles, and server-provided error messages are passed through unchanged. There is no heuristic text translation.

Coverage is partial: Today, plans/workouts/history, clients/coaches, check-ins, messaging, calendars, documentation, video analysis, notification contents, and some infrastructure/auth diagnostic errors still contain English copy. New feature copy should use `useI18n().t('explicit.key')`; add matching entries to both dictionaries. Full secondary-screen extraction, locale-aware date/number formatting throughout the app, and EN/PL device acceptance remain outstanding.

The shared toolbar uses an opaque native surface while Reduce Transparency is enabled (or its state is unknown). Sheets disable slide animation while Reduce Motion is enabled (or unknown). Both preferences subscribe to runtime accessibility changes. Device behavior, text expansion, screen-reader order, and native dialogs require iOS/Android verification; pure tests and type checks do not constitute device acceptance.

Focused tests cover dictionary key parity, regional locale resolution, and safe interpolation that preserves user-provided values.
