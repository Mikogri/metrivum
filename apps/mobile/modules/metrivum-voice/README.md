# Metrivum Android PCM voice recorder

A local Android-only Expo module. iOS keeps `expo-audio` PCM recording. Expo autolinking discovers this directory under `apps/mobile/modules`; there are no hand edits in generated `android/` projects or new backend formats.

`AudioRecord` captures 16,000 Hz, one channel, signed 16-bit samples. The writer encodes little-endian PCM into an account-scoped native cache directory and finalizes a 44-byte RIFF/WAVE header. Capture stops at 300 seconds or 9,600,000 data bytes. Timing derives from captured samples; no JS timer controls the file duration. A single worker owns the file and recorder release. Stop/cancel request termination, unblock reads and wait up to three seconds before allowing another recording.

API: `startAsync(accountId)`, `statusAsync(sessionId)`, `stopAsync(sessionId)`, `cancelAsync(sessionId)`. Status includes sample duration, normalized peak level, recording state, finalized URI or error. Every stop/cancel targets the returned session token. Invalid account identifiers and absent microphone permission are rejected. JS requests permission through the already configured `expo-audio` module. The Android manifest also declares `RECORD_AUDIO`.

Native activity background stops capture; module destruction discards it. JS additionally cancels on account abort/unmount, and cancels a start that completes after its owner disappeared. Incomplete files are deleted. Starting a new recording removes only module-created orphan WAV/partial files inside that account's native cache directory. Files are never created in public/external storage. There is no background recording service.

On a device missing this local module, the UI requests a new development build and retains WAV-file import. The module reports unsupported sample-rate/device initialization and audio-read errors; it does not substitute AAC or another format.

Verification commands, from repository root:

```powershell
./apps/mobile/modules/metrivum-voice/test-wav.ps1
& 'C:/Program Files/nodejs/node.exe' node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js resolve --platform android --project-root apps/mobile --json
& 'C:/Program Files/nodejs/node.exe' node_modules/typescript/bin/tsc -p apps/mobile/tsconfig.json --noEmit
```

Observed: header tests pass, module appears as `expo.modules.metrivumvoice.MetrivumVoiceModule`, and TypeScript passes. The Java check uses the production header writer directly without Android or a test framework. It verifies signatures, lengths, sample format/rate, maximum duration and invalid byte counts.

Native Kotlin and Java compilation passed on 2026-10-10 (`:metrivum-voice:compileDebugKotlin`, `compileDebugJavaWithJavac`, and `bundleLibCompileToJarDebug`; full log `.local/mobile/gradle-retry.log`). Real microphone encoding, stop/unmount/background races, permission denial/revocation, rapid account changes, device storage failures, preview and authenticated upload still require an Android device run. Do not interpret compilation or the header test as a successful microphone recording.

Implementation references: [Expo local modules](https://docs.expo.dev/modules/get-started/), [Expo autolinking](https://docs.expo.dev/modules/autolinking/), [Android AudioRecord](https://developer.android.com/reference/android/media/AudioRecord).
