# Mobile web

The phone presentation follows the current Expo screens in `apps/mobile/src/features`, not the desktop sidebar. It uses the existing web modules, account-scoped queries and API contracts. Native components and business rules are not copied into web UI.

## Screen map

| Native screen | Web route | Shared data/actions |
|---|---|---|
| Today | `/app/today` | In-progress/today workouts, check-in requests, weekly events; coach client/lead counts |
| Client Plans | `/app/my-training?tab=plans` | Assigned programs and owned plan copies |
| Client History | `/app/my-training?tab=history` | Workout history and progress; `historyView=progress` restores the selected section |
| Coach Clients | `/app/clients`, `/app/clients/:id` | Existing relationships; Overview, Activity, Progress, Profile, Documentation, Check-ins |
| Messages | `/app/messages?conversation=:id` | Existing messages, optimistic sends, private uploads, audio and realtime |
| Calendar | `/app/calendar?event=:id` | Month agenda, event details, meetings and check-in scheduling |
| More | `/app/more` | Check-ins, notifications, client calendar, coaches, Team, saved analysis and account settings |
| Workout | `/app/my-training/workouts/:id` | Existing execution versions, conflict handling, draft save and completion |
| Saved analysis | `/app/analysis` | Existing analysis list/result queries |

At widths up to 767px the shell uses five bottom destinations. Client: Today, Plans, History, Messages, More. Coach: Today, Clients, Messages, Calendar, More. Tablet and desktop retain their existing navigation. Phone `/app/dashboard` redirects to Today; desktop keeps its dashboard.

## Shared presentation rules

- `useMobileLayout` is an SSR-safe media query subscription. Layout does not depend on user-agent strings.
- The shell owns scroll restoration by browser history entry and uses VisualViewport, dynamic height and safe-area insets. Conversation/draft and editor/workout flows can hide bottom navigation. Pinch zoom is not treated as a keyboard.
- Phone messaging starts on the inbox; selecting a conversation pushes history. Desktop retains automatic selection. Back returns to the inbox.
- `ui-web` Dialog, confirmations and action menus share a phone bottom-sheet treatment with React Aria focus/dismissal behavior. Desktop popovers and drawers remain intact.
- `ResponsiveFilters` moves the same controlled route fields into a phone sheet. `useLibraryView` and `DataView` reuse card renderers on phones without overwriting desktop preferences; forms, exercises, video and formula lists use the same rule. Neither creates a second query or filter model.
- Training uses touch rows and stacked, labelled set fields. Existing draft saving and conflict protection remain authoritative. Advanced editors remain accessible and editable according to permissions, including on narrow screens.
- Web checkout remains reachable from More. Quote, currency, payment and subscription state continue to come from the existing API. No native checkout was added.
- Account/workspace scopes still own query caches and component lifetimes. Responsive components do not authorize resources or change mutations.

## Verification and limits

Browser regression specs are in `apps/web/e2e-coaching`: `mobile-web`, `messaging`, `training-delivery`, `subscription`, `coaching` and `generator`. They use explicit API fixtures, including payment simulation; they do not prove a live Supabase deployment or charge a card. Screenshot and test evidence is kept in ignored local output directories.

Verified on 2026-10-12: workspace TypeScript checks, ESLint and production web build passed; web unit tests passed 274/274 and ui-web passed 21/21. Browser runs covered 320/390/1440px. Initial failures exposed stale fixture/selectors and a save-completion race in the test; corrected cases passed targeted reruns. Phone-only scenarios are intentionally skipped on desktop. These results describe the working tree, including pre-existing changes; the commit contains only this responsive UI work.

Phone checks cover 320/390/430px, with tablet/desktop checks at 768/1440px: shell roles/accounts, filters, Back, chat and attachments/audio, calendar, plans/history, workout saves/conflicts, client details, checkout and the editor/export sheet. Unit tests cover navigation, viewport interpretation, sheets and calendar deep links.

Physical iOS/Android browser keyboards, device safe-area behavior and real authentication/payment integrations still require device/live testing. Saved video results remain available; new browser analysis retains the existing explicit unavailable state until the validated local analyzer is integrated. There is no server-analysis fallback.
