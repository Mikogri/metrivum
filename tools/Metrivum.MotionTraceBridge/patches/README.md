# Lossless tracking runtime optimization

`model-input-spool.patch` records the changes to the external MotionTrace adapter used by the local analyzer.
It stores already prepared float32 inputs instead of full video frames, preserving values, dtype, device and
strides. Forward/backward recurrent state and every original timestamp remain unchanged. GPU observations are
copied to CPU in bounded batches of 16; model state is never batched or shared between videos.

For a fresh compatible MotionTrace checkout, apply from its root:

```powershell
git apply --check C:/Work/Projects/train-flow/tools/Metrivum.MotionTraceBridge/patches/model-input-spool.patch
git apply C:/Work/Projects/train-flow/tools/Metrivum.MotionTraceBridge/patches/model-input-spool.patch
```

If the patch does not apply, reconcile the adapter changes and rerun parity checks; do not replace unrelated
MotionTrace work. Packaging copies the verified external `ai` sources into `source.tar.gz`.

Analyzer 1.7 additionally requires `resident-worker.patch`, applied after `model-input-spool.patch` from the
MotionTrace root. It adds the private worker loop, strict mapped checkpoint loading and weight-only residency.
Its tests cover model-key changes, cleanup after failed tracking, per-request receipts, integrity-before-reuse
and resource accounting. The normal standalone/multi-provider subprocess path remains available.

Full-pipeline benchmark (requires the installed points environment and enough free RAM):

```powershell
<points-python> tools/Metrivum.AnalyzerChecks/generate_benchmark.py .local/analyzer-worker-benchmark
dotnet run --project tools/Metrivum.AnalyzerChecks --artifacts-path .local/analyzer-checks -- .local/analyzer-worker-benchmark --benchmark C:/Work/Projects/MotionTrace
```

The transport checks additionally accept the points Python executable as their second argument. They verify
process reuse, bounded stderr draining, idle release, cancellation, failed receipts and process crashes.

Run `ai/tests/test_tap_backends.py` and `test_comparison_session.py` with the points Python environment.
Queue checks: `dotnet run --project tools/Metrivum.AnalyzerChecks --artifacts-path .local/analyzer-checks -- .local/analyzer-queue-checks`.

With a copy of the pre-patch adapter, run the opt-in GPU probe from the repository root:
`<points-python> tools/Metrivum.AnalyzerChecks/check_tracker.py --motiontrace-root C:/Work/Projects/MotionTrace --baseline <old-tap_backends.py> --seed 9`.
Repeat with `--seed 0` to verify the forward-only path. Generated frames avoid copying private videos into tests.

Verification on RTX 3070 Ti: original and optimized adapters produced exactly equal observations on generated
1080p sequences (10 and 24 frames), including backward tracking. A five-frame prefix used 31,104,640 bytes
before and 3,932,800 bytes after (7.9x smaller). Peak GPU allocation was effectively unchanged. Short warmed
runs were comparable; these are not full-video throughput or accuracy benchmarks.
