# MotionTrace lift analysis

The desktop web analysis form freezes a selected frame and accepts two source-video points. New analyses use an explicitly paired [local companion](../../tools/TrainFlow.LocalAnalyzer/README.md), which runs MotionTrace's Python tracker and .NET correction, movement and phase helpers on the user's computer. After inference, the original video is uploaded to private Storage and its result is saved to the existing client-result library. No cloud GPU queue is used. Results show repetition lifting speeds and selectable phase charts in px/s. Browser-only ML remains unavailable without a validated model export.

Both points must be visible to contribute a midpoint. Tracking gaps split chart lines. Signed vertical velocity is positive down; phase mean/peak speeds are positive and repetition speeds describe lifting. Pause speed metrics are omitted. Only the two marked points are measured (no lifter detection, no exercise classification); an unspecified movement is split into repetitions as "down, then up". There is no physical calibration or camera stabilization.

## Existing server worker setup

The following setup is for the existing server worker and historical cloud workflow; the new desktop web flow does not invoke it. The loopback companion needs no database or Storage credentials.

1. Install/configure MotionTrace's existing Python environments and models. Build the bridge using [its instructions](../../tools/TrainFlow.MotionTraceBridge/README.md). Rebuild after changes to the referenced MotionTrace source.
2. Configure `Analysis:MotionTrace` in API and worker settings using the worker's `appsettings.Example.json`. Paths are absolute server paths. Keep real settings in ignored `appsettings.Local.json`; environment variables override them.
3. Set `ConnectionStrings:WorkerDatabase` using the dedicated restricted worker role, and provide the same server-side Storage configuration as the API. Never reuse the API role or expose Storage secrets in the browser.
4. Start the worker from its project directory and restart the API. The API queues jobs; it does not start the worker.

```powershell
cd C:\Work\Projects\train-flow\workers\TrainFlow.Worker
./start-worker.ps1
```

The dedicated worker connection is stored outside the repository in .NET User Secrets (`trainflow-worker-development`). `start-worker.ps1` defaults to Development and loads these settings. Environment variables override User Secrets. The worker password was rotated with owner approval; API and administrator credentials were not changed. New tracking configuration and result metrics use existing JSON fields and require no database migration.

## Runtime and verification

The adapter bounds source/result sizes, runs each job in a private temporary directory, terminates the process tree on cancellation/timeout, and cleans up job files. Keep the work directory accessible only to the service account. API readiness checks bridge/configuration presence; installed models, GPU and sufficient memory are still required at execution time.

The bridge inherits only allowlisted OS, user-directory, runtime and accelerator settings; application credentials and arbitrary environment variables are excluded. This is not an OS sandbox: the bridge and Python children retain the worker's file/network permissions and OS identity. Deploy untrusted media processing with a dedicated service identity and external memory, disk and network limits.

Tests cover invalid points, process failures, size limits, cancellation and chart gaps. Cached real tracking data was checked against MotionTrace calculations. A fresh local GPU trial reached tracking but was refused by MotionTrace's RAM guard; fresh end-to-end inference remains to be verified with sufficient free memory.
