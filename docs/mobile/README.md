# TrainFlow mobile

Native React Native / Expo application at `apps/mobile`, using the existing ASP.NET API and Supabase **Auth only**. Business permissions, relationships, training rules, prices and billing remain server-owned. Mobile contains no checkout or payment mutation. The shared `@trainflow/api-client-web` package keeps its historical name, but its `transport` and generated contracts are platform-neutral.

## Interface

The mobile theme and components live in `packages/ui-mobile` and are independent of the web styling. Everything TrainFlow presents modally is a bottom sheet built on the native sheet of `@expo/ui`; there are no context menus or centred dialogs. See [visual direction](visual-direction.md) for the decisions and [verification](verification.md#uiux-pass--2026-10-10) for what was and was not checked on devices. A development-only component catalog is at the `/components` route.

## Run locally

Use Node 22.22+ and the repository npm lockfile. Android requires JDK 17 and the Android SDK; iOS native compilation requires macOS/Xcode or a separately configured remote build. This app requires a development build: Expo Go cannot supply SQLCipher or the custom Android WAV recorder.

```powershell
cd C:\Work\Projects\train-flow
& 'C:\Program Files\nodejs\npm.cmd' ci
Copy-Item apps/mobile/.env.example apps/mobile/.env.local
# Fill only the public API URL, Supabase URL and publishable key.
& 'C:\Program Files\nodejs\npm.cmd' run android --workspace @trainflow/mobile
& 'C:\Program Files\nodejs\npm.cmd' run dev:mobile
```

Do not overwrite an existing `.env.local`. The current workstation already has an ignored mobile config populated from existing public web settings. `http://10.0.2.2:59120` addresses the local API from an Android emulator; a real phone needs a reachable development host and an appropriately bound API. Production requires HTTPS. Never copy a database password, service-role key or worker secret into mobile configuration.

`apps/mobile/scripts/build-android.ps1` compiles an Android APK without installing it. It verifies the actual Node executable, uses a bounded Gradle JVM and records a diagnostic log. The normal Expo Android command also installs/runs, so choose the script for build-only verification. Generated `android/` and `ios/` directories are ignored; native changes belong in config plugins or `modules/trainflow-voice`, and must survive prebuild. EAS `local`, `development` and `preview` profiles are supplied; no EAS project, signing credentials, paid build or store release was created.

The verified local Android development APK is copied to `.local/mobile/trainflow-mobile-dev-arm64.apk` (arm64, about 101 MiB). It needs a running Metro development server and reachable API; it is not a standalone store build. It was subsequently installed with permission on Samsung SM-G973F and verified up to the sign-in screen. The hash and build evidence are in [verification](verification.md).

For that physical phone, the ignored local API URL is now `http://127.0.0.1:59120`, with `adb reverse tcp:59120 tcp:59120` and `adb reverse tcp:8081 tcp:8081`. From `apps/mobile`, start Metro with `node.exe --dns-result-order=ipv4first ../../node_modules/expo/bin/cli start --dev-client --localhost --port 8081`. This keeps development traffic over USB and avoids this host's IPv6-only localhost binding. Keep the USB connection and Metro running. Restore `http://10.0.2.2:59120` when using an Android emulator without reverse forwarding.

## Authentication and push prerequisites

- Auth uses three independent SecureStore-backed PKCE clients. Allow the exact development callback family `trainflow://auth/callback**` in the confirmed Supabase project's redirect allowlist before testing confirmation/recovery. Only `trainflow://auth/callback` with validated slot/nonce/code is accepted by the app. This task did not change the Auth allowlist, email confirmation policy or templates. Request and open recovery links on the same device; attempts expire after one hour and are single-use. Recovery sessions must set a new password within fifteen minutes.
- Restart the API with the new source after the additive DEV migrations. Existing browser/API clients remain compatible.
- Push requires an explicit Expo project ID, platform credentials, device permission and `Notifications__ExpoPush__Enabled=true` on the server. No real device delivery has been verified. Missing push setup does not disable REST/SignalR. See [backend](backend.md).
- Push data contains only notification/account/resource identifiers. A tap switches to the retained matching account and resolves an authorized notification through the API before opening its destination. Unknown accounts are ignored. Receipt alone never marks a notification read.

## Code boundaries

- `src/app`: route composition and native navigation. Native tabs are isolated in the tabs layout because the installed SDK exports them under an unstable API.
- `src/features`: daily training, clients, intake/check-ins, messaging, calendar, documentation, settings and historical analysis.
- `src/infrastructure`: account lifecycle, neutral HTTP adapter, scoped query caches, realtime/push, encrypted local drafts and serial save queue.
- `packages/ui-mobile`: semantic theme, native controls, accessible states, toast/sheet adapters and unit-aware chart rendering. No business entities, endpoints or Auth imports.
- `modules/trainflow-voice`: reproducible Android PCM WAV recording. It is not an ML runtime.

See [screen/API map](screen-api-map.md), [messaging/calendar](messaging-calendar.md), [local ML evidence](local-ml.md) and [verification](verification.md). The original [product specification](product-spec.md) remains the acceptance scope, not evidence that every milestone has passed.

## Change appearance

Edit semantic `tokens.light`, `tokens.dark`, spacing or typography in `packages/ui-mobile/src/index.tsx`. For example, changing `tokens.radius` updates buttons, fields and sections without modifying screens. Use `useTheme().colors.surface` instead of adding literal colors to features. The selected light/dark/system preference is local to the installation. `/components` is a development-only component-state catalog.

Native stacks, tab bars, date pickers and platform action menus retain platform behavior. `ToolbarSurface` uses the real Expo GlassView only when runtime APIs and accessibility preferences permit it; otherwise it uses an opaque themed surface. Charts retain text summaries and do not invent training metrics missing from the API.

## Private data lifecycle

Each active account mounts a new QueryClient and AbortController. Switching accounts aborts requests, disconnects foreground hubs, clears memory-only query data and closes the old encrypted store. Token refresh is identity-checked; an invalid session hides private screens and preserves local drafts for explicit reauthentication. Logout attempts push deregistration, removes the local session and wipes that account's drafts and encryption key. A provider notification already handed off cannot be recalled, so lockscreen text is generic.

SecureStore uses device-only, unlocked key accessibility. Long Auth payloads use atomically switched, bounded chunks. SQLCipher stores at most 100 drafts per account with a seven-day retention window; individual JSON payloads are bounded to 64 Ki UTF-16 code units. It fails closed if encryption is unavailable. No ordinary AsyncStorage token or plaintext workout draft is used. Media caches are temporary; account changes/unmount clear active files and startup clears stale chat cache files. An exported file copy remains outside application control.

Workout remote saves are serialized and versioned, while new edits persist locally independently of slow requests. Finish drains pending writes first. A version conflict preserves the draft and requires explicit comparison/reconciliation. The app does not claim complete offline operation: first load, authorization, uploads and final submission require the API; previously persisted drafts can be restored after reconnecting.

## Local analysis status

The source uses TAPNext++, not TAPIR. Its real checkpoint/source manifest is pinned and verified, but a portable model/runtime has not been proven. Mobile shows historical results and an explicit unavailable state. The web new-analysis screen accepts local video/points but cannot run inference yet and does not send new jobs to the server. Historical jobs/results remain intact. Do not advertise browser or mobile local inference until the actual model, decoder, operators, memory budget and parity tests pass; see [reproduction and blockers](local-ml.md).
