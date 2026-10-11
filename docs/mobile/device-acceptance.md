# Native acceptance checklist — NOT RUN

Use disposable, explicit DEV fixtures and distinct authorized Coach/Client accounts. Do not use real private health records or include credentials in scripts, screenshots or logs. Follow-up on 2026-10-10: with explicit permission, installed and launched the development APK on Samsung SM-G973F and confirmed the Polish sign-in screen. The scenarios below remain NOT RUN; no account was signed in. iOS needs a separate macOS/Xcode environment.

| Scenario | Required observation |
|---|---|
| Cold start, email confirmation, recovery | Native route opens; only the requesting slot consumes the single-use PKCE code; recovery cannot open private screens before password reset. |
| Three accounts, two roles | Identity and role remain distinct; no previous user's cache/draft/files; fourth account cannot overwrite a slot. |
| Logout/switch during slow save/upload | Account request aborts; already accepted local edits drain before database close; next account receives no late data; logout wipes only selected account. |
| Workout edit, background, process death | Durable actuals restore; no planned values fabricated as performed; timer uses elapsed clock time. |
| Two-device workout/check-in conflict | Local work survives 409; server comparison is visible; explicit reconciliation required; Finish drains all saves. |
| Invalid numeric edit after valid value | Submission is blocked rather than silently submitting the older numeric value. |
| Client and group coaching actions | API allowedActions respected; private/Team scope correct; assignment preview accurate; ended relationships deny private access. |
| Private files and measurements | Unauthorized reads denied; measurement units/meaning stay separate; cancelled picker/upload leaves no falsely completed item. |
| Chat send/retry/reconnect | Optimistic pending bubble, stable idempotency key on retry, bounded history, correct latest receipt, no duplicate send. |
| Voice and images | Genuine PCM WAV duration validated by API; recording stops on background; logout cancels; images within bounds; no media leaks after switch. |
| Push and denied permission | Denial leaves app usable; current-conversation suppression is account-specific; tap resolves correct account/resource; no private lockscreen payload. |
| Calendar DST/all-day/RSVP | Exclusive API end dates round-trip; old attendee state never shown as accepted; version conflicts preserve edits. |
| iOS accessibility | True native glass on supported runtime; opaque Reduce Transparency fallback; Reduce Motion respected; large text/VoiceOver/keyboard. |
| Android accessibility | TalkBack, native pickers/action dialogs/Back, keyboard dismissal and small-screen reachability. |
| Language and theme | Covered EN/PL screens expand without clipping; role/account changes apply correct locale; system/light/dark persist. |
| Payment boundary | Read-only dues/subscription, no checkout/confirm-payment/price-purchase link or hidden payment webview. |
| Local ML | Blocked until actual model export/runtime/decoder exists. A disabled button or historical result is not a passing inference test. |

Two [Maestro smoke flows](../../apps/mobile/e2e/README.md) are authored for native Client navigation/session restart and Coach/Client mode switching. They are not run; YAML parsing alone does not verify native selectors. Extend the runner with the remaining scenarios above using the same fixtures and real API. The current component tests use DOM adapters to test asynchronous state transitions; they do not prove React Native rendering, keyboard behavior, SQLCipher binaries or OS lifecycle.

## UI pass acceptance (added 2026-10-10)

Run on Android and iOS with a signed-in Coach and Client account. Status of each item is in [verification](verification.md#uiux-pass--2026-10-10).

- Small screen and the largest system text size: no clipped primary action, rows wrap instead of truncating meaning.
- Every sheet: opens from the bottom, closes with its button, the swipe and Android Back; a second sheet never appears above it.
- Sheets with a draft (new message request, invitation, note, measurement, check-in details, assign program/check-in): close attempts ask inside the sheet and "Keep editing" preserves every value.
- Keyboard in a sheet and in the chat composer: the focused field stays visible.
- Workout: enter reps and load, use the step buttons, tick a set (haptic, rest timer, save state changes), open set details, substitute an exercise, finish.
- Clients: the "…" button on a row and on the details screen opens the same action sheet.
- Messages: long-press and the "…" button beside a bubble open the same sheet; a new message animates in once, scrolling history does not replay it.
- iOS 26: tab bar and sheets use the system material, the rest timer bar and toast use Liquid Glass; with Reduce Transparency they are opaque. iOS 18 or lower: opaque fallback.
- Reduce Motion: no movement, and every result (set ticked, saved, error) is still shown.
- Switch account and Coach/Client view with a sheet open and with a workout draft.
