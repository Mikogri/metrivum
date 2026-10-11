# Android build on Windows

After installing workspace packages and running Expo Android prebuild, run from the repository root:

```powershell
pwsh -File apps/mobile/scripts/build-android.ps1
```

The script verifies the executable selected by `cmd /c node`, uses JDK 17 and the local Android SDK, and builds an arm64 debug APK with one Gradle worker and a 1536 MiB JVM heap. Its Gradle init script passes a two-job CMake/Ninja compile/link pool to every Android application/library project. This applies after clean Expo prebuilds too. Gradle's worker limit alone does not constrain Ninja; an environment-only `CMAKE_BUILD_PARALLEL_LEVEL` would not constrain AGP's direct Ninja invocation. The script starts a single-use Gradle daemon and restores its process environment afterward. It does not install the APK or connect to a device.

Override `-NodePath`, `-JavaHome`, or `-AndroidHome` for a different installation. Detailed output and the Gradle exit code are saved to `.local/mobile/gradle-retry.log`; use `-LogPath` to keep another run separately. Build output is `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` only after a successful assembly.

To isolate the screens codegen task:

```powershell
pwsh -File apps/mobile/scripts/build-android.ps1 -Task ':react-native-screens:generateCodegenArtifactsFromSchema' -LogPath .local/mobile/codegen-retry.log
```

The initial local screens codegen failure reported only `cmd` exit 1. Both the direct Node command and the Gradle task subsequently succeeded without dependency/source changes; the original cause is unconfirmed. The script captures the actual command and resolved toolchain for diagnosing a recurrence. First builds may need to download Android dependencies.

The subsequent full build exposed a separate Windows Ninja limit: the Gesture Handler C++ object path exceeded 260 characters. The checked-in `withAndroidShortCxx` Expo plugin moves the app's CMake staging directory to the ignored repository `.local/cxx` directory. This leaves room for CMake's normal object-path hashing and survives subsequent prebuilds, without changing dependencies or global Windows settings. See [Android CMake staging configuration](https://developer.android.com/reference/tools/gradle-api/8.0/com/android/build/api/dsl/Cmake) and [CMake object path limits](https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html).

Verification on 2026-10-10: full arm64 debug assembly succeeded (`.local/mobile/gradle-final.log`, exit 0). After host memory pressure interrupted our Ninja process, its remaining target was completed explicitly with `-j2` and assembly resumed using the existing objects. The subsequent job-pool configure proof also passed (`.local/mobile/gradle-job-pool-proof.log`): all 21 Android projects received the pool arguments, and the actual screens CMake command produced `pool trainflow_native`, `depth = 2`, and compile/link assignments in its Ninja files. A complete clean assembly with the new pool settings was not repeated. The cap applies through this wrapper; direct Gradle or `expo run:android` calls must also load `native-job-pools.gradle` to receive it. See [CMake job pools](https://cmake.org/cmake/help/latest/prop_gbl/JOB_POOLS.html).
