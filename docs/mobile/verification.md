# Mobile delivery evidence — 2026-10-10

## IMPLEMENTED

Expo 57 / React Native 0.86 mobile workspace, strict TypeScript, isolated native navigation and mobile UI theme; three secure Auth slots; Coach/Client mode; SQLCipher drafts; versioned workout saving and conflict review; plans/history/progress; clients/leads/invitations/groups/details; check-ins, documentation, chat with native PCM voice and private files, calendar, notifications, Team and read-only subscription/dues. Typed EN/PL support currently covers Auth, navigation, settings and shared controls; see [coverage](localization.md).

Shared API transport now retains account cancellation and timeout until response bodies finish reading. API extensions include client-analysis provenance/results, Expo device/receipt transport, owner-filtered single-notification lookup, and additive actual-set identifiers. Business rules stay in existing modules. Native links expose only a static allowlisted route; PKCE alone consumes original Auth URL data.

A focused independent review found and fixed two cross-feature mechanisms: deferred local writes outside the account store could be lost on switch; invalid numeric text could submit an older valid value. Store registration is now synchronous, pending database work drains on close, and forms/executions block invalid submission. Tests reproduce the original failures before the fixes.

## TESTED

All commands run from repository root unless stated otherwise. `node.exe` denotes `C:/Program Files/nodejs/node.exe`; do not use this host's empty extensionless System32 `node` shim. Test counts below overlap between suites and must not be summed as distinct coverage.

| Command / scope | Result |
|---|---|
| `node.exe node_modules/vitest/vitest.mjs run --project mobile-core --maxWorkers=1` | 49 tests / 12 files passed: queue drain/conflict/backlog, draft restoration, duplicate-submit locks, form validity, set identity, PKCE replay/slot checks, chunk storage, notification routing, dates/DST, real-value charts, messaging ordering/receipts and translation keys. |
| `node.exe apps/mobile/node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json` | Passed (mobile TypeScript 6.0.3). |
| `node.exe node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` | Passed; additive contracts remain compatible. |
| Scoped ESLint for mobile/UI/shared transport and touched analysis files, `--max-warnings 0` | Passed. |
| Web tests for `shared/http`, `modules/video-analysis`, `modules/messaging` | 93 tests / 20 files passed, including 20 shared transport tests and no-new-server-analysis admission. |
| `npm run build` | Passed: client/server compilation, all public EN/PL pages, sitemap resource and SPA fallback. Earlier concurrent builds timed out during preview; the final unchanged-source run passed after reducing competing native workload. Logs preserve both failures and success; this is not evidence of a source fix. |
| `node.exe --test apps/web/scripts/hosting-rules.test.mjs` | 2 passed, including malformed request handling. |
| `dotnet test tests/Unit/TrainFlow.UnitTests --artifacts-path .local/mobile-backend-build` | 217 passed. |
| `dotnet test tests/Architecture/TrainFlow.ArchitectureTests --artifacts-path .local/mobile-backend-build` | 2 passed. |
| PostgreSQL integration filter `MobileBackendTests|MobileWorkoutAnalysisTests` | 4 passed against local test DB. |
| Media/notification/training integration regression filter | 31 passed. |
| `NotificationAccountRevocationTests` | 1 passed. |
| `NotificationsTests` after adding individual lookup | 12 passed: owner access, foreign/cancelled/future/missing denial, anonymous denial, durable reads/delivery regressions. |
| `expo export --platform android --platform ios --max-workers 1` from `apps/mobile` | Both Hermes bundles built. This is not an iOS native build. |
| `expo install --check` | Dependencies up to date for SDK 57. |
| `expo-doctor` | 20/21: reports web React 19.3 and mobile React 19.2.3 in the monorepo. Metro explicitly resolves the mobile runtime to its own React; bundles pass. Do not silently downgrade the existing web or claim a clean doctor run. |
| `apps/mobile/modules/trainflow-voice/test-wav.ps1` | Java WAV header tests passed; module autolinking found the local Android class. |
| Android `:app:assembleDebug` | Passed, `BUILD SUCCESSFUL in 2m 59s`, 520 tasks (33 executed / 487 up to date), exit 0 after resolving Windows object-path limits. Includes custom voice Kotlin/Java and native C++/SQLCipher. Earlier pressure-driven interruption is preserved in its separate log. |
| Build-script CMake job pools | Subsequent screens configure passed (1m 5s, exit 0); generated Ninja files use `trainflow_native` with depth 2. The Gradle init script applies to Android app/library projects after prebuild. This avoids relying on a Gradle worker limit to constrain native compilers. |
| Real TAPNext++ integrity probe/tamper tests | Source/checkpoint manifest validated; exporter preflight blocked before inference. See [actual commands](local-ml.md). |
| Mobile production dependency audit | 31 affected nodes (20 high/11 moderate) from four underlying advisories. Not audit-clean; see [reachability and remaining work](dependency-review.md). |
| Maestro native smoke flows | Two flows authored and YAML parsed; NOT RUN on a device. See [runner prerequisites](../../apps/mobile/e2e/README.md). |
| `graphify update .` | Passed; refreshed code graph after implementation. |

Raw logs are under ignored `.local/mobile/` and `.local/mobile-*.log`. PostgreSQL integration uses private `TRAINFLOW_TEST_DATABASE` supplied locally; no connection secret is recorded in source. API builds used isolated outputs to avoid replacing a running user's binary. DOM-adapted component tests prove state logic, not native controls or device encryption.

Android artifact: `.local/mobile/trainflow-mobile-dev-arm64.apk`, 105,827,368 bytes, package `com.trainflow.app`, version `0.1.0` / code 1. SHA-256: `9C1B3259C6ACE3989350BBD7B83AE26E36A1AC7EDD103298B150D568130F8D46`. This is an arm64 debug development client requiring Metro and reachable API configuration, not a standalone release or device acceptance result. Assembly log: `.local/mobile/gradle-final.log`.

## DEVICE VERIFIED

**Android launch only (2026-10-10 follow-up).** After explicit user authorization, installed the verified APK on Samsung SM-G973F, forwarded Metro/API through USB, and confirmed the Polish sign-in screen in the native UI. Metro uses IPv4-first DNS because localhost originally bound only to IPv6, which the USB reverse connection could not reach. No login or authenticated acceptance scenarios were performed. Native iOS compilation is unavailable on this Windows host. Navigation after login, keyboard, glass/accessibility, SQLCipher reopen, microphone, push and account-switch lifecycle still require the [device acceptance run](device-acceptance.md).

## WEB LOCAL ML VERIFIED

**No.** The actual model is TAPNext++ PyTorch, with a ~2.36 GiB checkpoint and no verified portable artifact. Exporter prerequisites and host memory admission are unmet. No ONNX runtime, decoder/parity result or fabricated tracking output is claimed. The web keeps historical analysis and local file/point selection; its Run action explicitly reports the blocker and never enqueues new server inference. The old server endpoint/worker remains for compatibility and is not silently retired.

## MIGRATIONS CREATED

EF `20261010155332_ClientAnalysisResults` and `20261010155339_MobilePushTransport`. Both are additive and retain old analysis rows. Original EF history and ownership are preserved. Local predecessor upgrade, repeated application and restricted-role CRUD/cascade tests passed.

## APPLIED TO DEV

Applied to user-confirmed TrainFlow Supabase DEV `atclvdkpbccafakzpwls` after checking project identity, exact module history and SQL. Verified both history entries, nullable media and narrow grants. A transaction using the actual `trainflow_api` connection performed device registration CRUD and rolled back successfully. Browser/worker token reads remain denied. See [deployment evidence](backend.md). No managed Auth/Storage schema or production change, no Git push/store publication.

## BLOCKED

- Real local ML export/runtime/operator/decoder/parity and physical-device/browser inference evidence.
- Device acceptance and native iOS compilation; APNs/FCM/Expo project credentials and delivery tests.
- Confirmation/recovery acceptance requires the documented Supabase redirect allowlist; it was not changed in this task.
- Store release must resolve/review outstanding dependency advisories, signing, privacy declarations and complete native acceptance.

## DEFERRED / INCOMPLETE

Complete secondary-screen EN/PL extraction; native E2E execution and coverage beyond the two authored smoke flows; full assigned-program revision browsing (missing authorized client contract); workout/per-set media and form file answers (current API limitations); full paging for bounded assignment pickers; advanced group/message moderation and calendar check-in aggregation; measurement/note editing. These are not passing acceptance items. See [screen/API gaps](screen-api-map.md) for exact boundaries. Builders and mobile checkout remain intentionally excluded by the product spec.

## UI/UX pass — 2026-10-10

Scope: mobile theme, shared components, native bottom sheets, motion and every feature screen. Direction and decisions are in [visual direction](visual-direction.md). No backend, ML or web styling change.

### Implemented

- `packages/ui-mobile` is now a typed design system: semantic colours (dark and light), Outfit type scale, spacing/radius/motion tokens, platform icons (`expo-symbols`), press/enter/layout motion (Reanimated 4), haptics for confirmations only.
- One sheet foundation on the native sheet of `@expo/ui` (Material 3 `ModalBottomSheet` on Android, SwiftUI sheet on iOS): `BottomSheet`, `ActionSheet`, `ConfirmationSheet`, `SelectionSheet`, `SelectField`, plus imperative `confirm()` / `chooseAction()`. A request made while a sheet is open becomes a step inside that sheet; pickers used inside a sheet render in place. Nothing stacks.
- No `Alert.alert`, `ActionSheetIOS`, context menu, popover or centred dialog remains in the mobile app. The only React Native `Modal` is the web/test fallback of the sheet adapter, which iOS and Android never load. System pickers (Android date/time dialog, file and photo pickers, permission prompts) are untouched.
- Unsaved input in a sheet: closing asks inside the same sheet and the form stays mounted with its values.
- Workout execution: large reps/load entry with step buttons, a round "set done" control that saves and starts the rest timer, set details in a sheet, visible save state, pinned Save/Finish actions.

### Tested on this host

| Command / scope | Result |
|---|---|
| `tsc --noEmit -p apps/mobile` | Passed. |
| `eslint apps/mobile/src packages/ui-mobile/src --max-warnings 0` | Passed. |
| `vitest run --project mobile-core` | 49 tests / 12 files passed. `daily-persistence.test.ts` was updated for the new labels and components; its guarantees are unchanged (the duration field is now in minutes, the API still receives seconds). |
| `expo export --platform android --platform ios` | Both Hermes bundles built (`.local/mobile/export-ui`). This compiles the iOS-only sheet adapter but is not an iOS run. |
| `expo install --check` | Reports `react-native-reanimated` 4.7.1 (expects 4.5.1) and `react-native-worklets` 0.13.0 (expects 0.10.1). These are the versions already resolved in the lockfile and compiled into the installed development client; they were only made explicit dependencies. Aligning them needs a native rebuild and was not done in a UI pass. |

### Device verified (Android, Samsung SM-G973F, Android 12, development client + Metro over USB)

Checked on the component catalog (`/components`, dev only) and the sign-in screen, because no signed-in account was available to the agent:

- Theme, Outfit font, Material Symbols icons, dark and light theme.
- Native Material sheet with React Native content: action sheet, confirmation, tall scrolling sheet, form sheet.
- Keyboard: the sheet rises above the IME and the focused field stays visible.
- Draft protection: Android Back with typed text shows the discard question in the same sheet; "Keep editing" returns the form with the text intact; "Discard" closes it.
- Toast (success and error), segmented control, chips, numeric entry with step buttons, the set check control.

### Not verified

- **Any signed-in screen on a device** (Today, Workout, Clients, Messages, Check-ins and the rest). They pass type checks, lint and the persistence tests, and were not visually reviewed with real data.
- **iOS entirely**: SwiftUI sheet, Liquid Glass (`GlassView` toolbar surface and toast, system tab bar), SF Symbols, detents, `interactiveDismissDisabled`, keyboard avoidance. No macOS/Xcode on this host.
- Reduce Motion, Reduce Transparency, large text sizes and a small screen were not exercised on a device. The code follows the system settings (Reanimated's default reduce-motion handling, an opaque fallback for glass, capped font scaling) but this is unproven.
- Account switching, long real lists and sheets holding real drafts.

## UI revision — 2026-10-10 (second pass)

Feedback on the first pass: typeface, oversized buttons, switches, in-screen tabs, tab bar, sheet material, page transitions and a slow Coach/Client switch.

### Changed

- Typeface Geist instead of Outfit; compact controls; own `Switch`, sliding `SegmentedControl`, pill `Tabs`; borderless section cards; inline empty/error states.
- Floating icon-only tab bar over the content (JS tabs with a custom bar), icons from the web app; notifications and the profile avatar at the trailing edge of every tab title; account settings moved from "More" to a Profile screen, "More" is a grid of the remaining features.
- Translucent sheets over a blurred backdrop (see [visual direction](visual-direction.md)).
- Stack transition `ios_from_right` on Android, tab transition `shift`.
- Coach/Client switch: the root stack is no longer remounted and the query cache is no longer cleared; role tabs are guarded routes; account-level queries (`/api/v1/me/...`) are keyed without the role.

### Tested on this host

| Command / scope | Result |
|---|---|
| `tsc --noEmit -p apps/mobile` | Passed. |
| `eslint apps/mobile/src packages/ui-mobile/src --max-warnings 0` | Passed. |
| `vitest run --project mobile-core` | 49 tests / 12 files passed, unchanged. |
| `expo export --platform android --platform ios` | Both Hermes bundles built. Not an iOS run. |

### Device verified (Android, Samsung SM-G973F, Android 12, development client, signed-in Coach account that also has the Client view)

- Today, Clients, Messages, Calendar, More, Profile and Check-ins with real account data: font, header with notifications and avatar, floating bar with the sliding indicator, tiles, switches, segmented controls, pill tabs.
- Sheets: the new-message form sheet and the client filter sheet are translucent and the app behind them is blurred.
- Coach ↔ Client switch from Profile: tabs change in place, no remount. Measured in the development build with a temporary probe (removed): 306–392 ms from the tap to the second following frame, four switches. The time before the change was not measured.
- No top gap under native headers (the screen no longer adds a status-bar inset there).

### Not verified

- **iOS entirely**: Liquid Glass tab bar and sheets, the material fallback below iOS 26, the stack transition, SF Symbols.
- Light theme of the new bar and sheets, Reduce Motion / Reduce Transparency, large text, Android 11 or lower (opaque sheet path), the keyboard hiding the bar, account switching.
- Workout execution, plans, history, client details and conversations were not opened after this revision; they share the changed components and pass type checks, lint and tests only.
- The round gear at the screen edge on the test phone is the Expo development-menu button of the development client. It is not part of the app and does not exist in release builds.
