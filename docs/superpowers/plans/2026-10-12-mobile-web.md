# Mobile Web Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` and independent scoped agents. Preserve the existing dirty working tree.

**Goal:** Give the existing web app a phone presentation based on the current Expo screens while preserving desktop and API behavior.

**Architecture:** Keep account-scoped queries, mutations and authorization in their existing modules. Introduce a small responsive shell/navigation model and adapt shared web overlays; use distinct presentations only where the native information hierarchy differs. No native UI imports, new backend or duplicate feature data model.

**Tech stack:** React Router, TypeScript, React Aria, existing ui-web tokens, TanStack Query, Vitest and Playwright.

**Spec:** User-provided “TrainFlow — Mobile Responsive Web UI”, attachment `654cf8ee-eea0-47ab-a41a-bd792f80c766`.

## Constraints and review focus

- Preserve desktop layouts, web checkout, resource permissions, dirty guards and account lifetime checks.
- Phone layout at <=767px; tablet/desktop retain their current shell. Test 320, 390, 430, 768 and 1440px.
- No new dependencies, backend changes or real payment/device/ML claims.
- Account/role switches must clear private local state and keep native role destinations.
- Back/deep links must work even without an existing browser history entry.
- Bottom sheets must retain modal focus, dismissal and scroll lock; touch actions cannot depend on hover.
- A keyboard must not leave the composer behind fixed navigation or obscure focused controls.
- Advanced direct links and long content must remain usable without page-wide horizontal overflow.

## Work areas

- [x] Audit native screens and document the route/API map from current source.
- [x] Shell: replace the phone sidebar drawer with five role-based bottom destinations, compact header, More and native-priority Today; retain desktop shell. Test pure navigation matching and browser transitions.
- [x] ui-web: adapt dialogs, confirmations and action menus to one accessible phone sheet pattern. Test dismissal/focus and desktop compatibility.
- [x] Coaching/training: compare native lists/details/schedule/history/workout with web; reuse queries and improve mobile rows, fields and controls. Preserve all desktop functionality and existing dirty changes.
- [x] Messaging/calendar: separate phone conversations, viewport/keyboard handling, visible touch actions, native-style calendar priorities without removing desktop modes.
- [x] Verify TypeScript, lint, affected unit tests, browser Coach/Client flows and representative screenshots; fix actual mobile/desktop regressions.
- [x] Record exact verification and remaining real-device limits, refresh Graphify, and selectively commit this work without committing unrelated pre-existing edits.

## Native → web map (current source)

| Expo source / screen | Mobile web route | Existing feature/API |
|---|---|---|
| `(tabs)/index`, `features/today` | `/app/today` | Schedule, check-in requests, calendar events, coach client/lead counts |
| `(tabs)/plans`, training Plans | `/app/my-training?tab=plans` | Training assignments and purchased/assigned plans |
| `(tabs)/history`, training History | `/app/my-training?tab=history` | Training schedule and Progress |
| `(tabs)/clients`, client detail | `/app/clients`, `/app/clients/:id` | Coaching list/detail and existing detail tabs |
| `(tabs)/messages`, conversation | `/app/messages`, `?conversation=:id` | Existing Messaging REST/SignalR and private uploads |
| `(tabs)/calendar`, events | `/app/calendar` | Calendar events and existing meeting/check-in actions |
| `(tabs)/more`, settings More | `/app/more` | Check-ins, notifications, client events, coaches, Team, analysis and Profile |
| workout | `/app/my-training/workouts/:id` or `/app/training/workouts/:id` | Existing execution versions, draft saving and dirty protection |
| check-in / application / invitation | Existing detail URLs | Existing form/intake operations |
| profile / Team / analysis | `/app/settings`, `/app/team`, `/app/analysis` | Existing web modules; no native checkout added |

`Plans` and `History` exact sections are verified against the native training implementation during the training work area. Desktop routes remain available by direct link. Mobile web checkout remains reachable through account/subscription controls.
