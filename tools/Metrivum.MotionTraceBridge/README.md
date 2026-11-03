# MotionTrace bridge

Optional local .NET 10 tool, deliberately outside the Metrivum solution. It references the existing MotionTrace Core/Infrastructure projects and runs its `ai/comparison/analyze_session.py` two-point TAPNext++ pipeline. MotionTrace must already have its Python environments and verified models installed. Nothing is installed, downloaded or trained by this tool.

Build from the repository root (all dependency outputs stay under this tool):

```powershell
./tools/Metrivum.MotionTraceBridge/build.ps1 -MotionTraceRoot C:/Work/Projects/MotionTrace
./tools/Metrivum.MotionTraceBridge/build.ps1 -Check
```

The DLL is `artifacts/bin/Metrivum.MotionTraceBridge/debug/Analysis.Bridge.dll`. `MotionTraceRoot` is also a configurable MSBuild property; the default source location is the sibling `MotionTrace` repository. For direct `dotnet build`, pass `--artifacts-path` to a directory inside Metrivum.

```powershell
dotnet <bridge.dll> --request request.json --output result.json
```

Request:

```json
{
  "videoPath": "C:/private/job/video.mp4",
  "motionTraceRoot": "C:/Work/Projects/MotionTrace",
  "cacheDirectory": "C:/private/job/cache",
  "timeoutSeconds": 7200,
  "configuration": {
    "movement": "bench-press",
    "tracking": {
      "timestampSeconds": 0,
      "videoWidth": 360,
      "videoHeight": 640,
      "points": [{"x": 114, "y": 252}, {"x": 312, "y": 286}]
    }
  }
}
```

Optional `settingsPath` must reference an existing MotionTrace `settings.json`. Otherwise `PythonOptions.Load()` uses the current user's settings/defaults, with the source repository's `.models/vision` preferred when present. Points/samurai model paths retain MotionTrace's resolution rules. Use a separate private job directory for each request; manifests, targets and intermediate tracker results contain private video data. The caller owns cleanup. Default cache is adjacent to the output, never inside MotionTrace.

Coordinates are source-video pixels after decoder rotation, not CSS/display pixels. The selected timestamp is resolved by MotionTrace to the nearest decoded frame. Width/height mismatch and a timestamp past the end are rejected by the points-only preparation (which reads the video anyway) before tracking starts; there is no separate probe process. `movement` accepts `squat`, `deadlift`, `bench-press`, or `unspecified`. Analysis is points only (`--points-only`): no lifter detection and no exercise classifier; `unspecified` is split into reps as "down, then up", and phases follow the direction the points move.

The result uses schema version 1 with `positionUnit: "px"` and no metric calibration. Positions are exact two-visible-point midpoints. Velocity is signed vertical px/s, positive down; mean/peak speeds are positive phase speeds and rep metrics refer to lifting. Smoothing, gap handling, phase rules and rep boundaries come directly from `ProviderPreparation`/`MovementAnalyzer`. Missing endpoints omit that timestamp and split `segment`; they never become fake stationary points. `quality` is the smaller endpoint visibility confidence, not calibrated measurement accuracy. No camera stabilization is applied.

Python processes use argument lists, offline model mode, bounded output tails and process-tree cancellation. Failed/NotInstalled session statuses produce a nonzero exit even when Python itself exits zero. The adapter must only accept a result after exit code zero.

Verification includes exact midpoint and one-frame visibility-gap tests, points-only reps for an unspecified movement, and parity with the MotionTrace helpers for all three movements. To verify an existing real **two-point** tracker result without running inference:

```powershell
./tools/Metrivum.MotionTraceBridge/build.ps1 -Check -RawFixture C:/private/cache/tapnextpp/analysis.json
```

The fixture remains in its original location and is read only. Tests require the same MotionTrace source dependency as the bridge; normal Metrivum builds do not require it.

Local validation (2026-10-08): a cached 2,008-frame two-point result matched all 1,039 available velocity samples and repetition metrics for all three movement rules. A real 8-second bench clip completed shared pose preparation, then the existing TAPNext++ scheduler refused inference because available RAM/Windows commit was below its threshold. The bridge correctly returned exit code 1 with the scheduler error and no result file. Full fresh GPU inference still requires sufficient free memory; this is not a successful fresh tracking run.

Version 1.5 tracks both before and after the selected frame using independent recurrent state. A bounded 4 GiB temporary prefix spool avoids retaining decoded video in RAM; inference caches include adapter source hashes. Unspecified movements use direction-only sequences: repeated strokes and stationary pauses survive, and return to the starting height separates cycles. This is not an exercise classifier or a guarantee of a completed Olympic lift. Explicit bench/squat/deadlift detectors remain unchanged. Old saved results are immutable and require a new analysis to recover previously untracked frames.

Verification (2026-10-23): 36 Python adapter/session tests, synthetic double/triple strokes, pauses, repeated cycles and visibility gaps passed. A fresh 1,282-frame GPU run covered 0-42.67 seconds with 1,217 usable samples, including 142 before the seed. Existing detector parity and API result validation passed on that output. The three saved user analyses were read only; their complete Olympic lifts have not yet been re-run with the new installed runtime.
