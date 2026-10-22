# Local web analyzer

Runs the existing MotionTrace Python tracker and .NET Core measurement engine on the **browser user's Windows computer**, through a separately started loopback companion. This is not in-browser ML and never invokes the server GPU queue. After inference, web uploads the original video to private Storage and saves the result through the existing authenticated client-result API.

## End users

### Updates (1.4+)

One account-scoped provider checks `/downloads/analyzer/update.json` (five-minute cache) and the loopback discovery version. The notification center pins an unread device update until discovery confirms the installed version is current; opening it or marking all notifications read cannot resolve it. The separate amber banner can be closed for this release in the current browser session, without dismissing the pinned notification. The last observed device version is remembered while the companion is offline. Older companions offer an installer download. Clicking Update alone never resolves the notice.

Paired `POST /update` accepts no URL or command arguments. The companion downloads the installer only from its configured web origin, rejects redirects, checks a bounded byte count and SHA-256, and requires a valid Authenticode signature for HTTPS releases. Loopback HTTP development releases can be unsigned. A queue lock excludes active analysis/uploads and new worker starts while updating; queued videos/results remain in the profile. Installer `--update` applies the existing staged update/rollback flow and restarts the analyzer. A busy or failed update leaves the banner visible. Initial migration from pre-1.4 companions requires downloading/opening the new installer once.

Build with a monotonically increasing three-part `-Version`. The build publishes `update.json` last; upload that file only after all immutable assets and the installer are available. HTTPS releases require `-SigningCertificateThumbprint` and Windows SDK `signtool`. Serve `update.json` and the installer at the web origin's `/downloads/analyzer/` path; larger runtime assets may use the embedded release's separate base URL. There is no Windows service, scheduled task or silent background installation.

Download **TrainFlowAnalyzerSetup.exe** from the connection card in New analysis. The per-user Windows x64 installer downloads hash-pinned runtime assets, relocates isolated Python environments and installs the offline models, self-contained .NET host and a Start menu shortcut. No developer checkout, Conda or separately installed .NET is required. Allow 35 GB free disk space; the current GPU runtime requires NVIDIA/CUDA compatibility and sufficient RAM/VRAM. Start **TrainFlow Analyzer** (New analysis can start it) and keep its window open; it pairs with the browser automatically once.

Connection states distinguish unreachable (not proof of being uninstalled), pairing required, ready, running, repair and incompatible protocol. Discovery discloses only the application/protocol/version; readiness requires pairing. An HTTPS production origin or exact local HTTP origin is allowed by explicit installed configuration. A phone's loopback address refers to the phone, so Windows companion installation does not enable native phone inference.

## Background queue (analyzer 1.2+)

New analysis takes up to 10 videos at once; each gets its own two tracking points, name and movement. The page sends them to the analyzer (`POST /jobs`), which keeps each video with its settings in `%LOCALAPPDATA%\TrainFlowAnalyzer\jobs\<id>` and analyzes them one at a time, oldest first. The browser may then be closed; only closing the analyzer window pauses the queue (an interrupted analysis starts again on the next start).

- **Limit:** 10 videos per computer, counting waiting, analyzing and analyzed-but-not-saved ones (`409` above that).
- **Progress:** the analyzer reports an estimate per video (fast at first, slowing near the end, never 100 % before the result exists). The browser adds upload and save steps on the same bar.
- **Saving:** while any TrainFlow page is open and signed in, the browser checks the queue (every 2 s while work is running, otherwise every 20 s), downloads each finished video and result from the analyzer, uploads the video to the private library, saves the result, shows a notification and removes the job (`DELETE /jobs/<id>`). Results finished while the browser was closed are saved the next time TrainFlow opens. Saving uses the job id as idempotency key, and the uploaded media id is stored with the job (`PUT /jobs/<id>/media`), so retries never create duplicates or upload twice. Failed saves (for example while the database is unavailable) keep the job and are retried every minute. Only one open tab saves a given job (Web Locks).
- **Accounts:** each job records the signed-in user id; a browser only lists and saves its own user's jobs.
- **Why the analyzer does not save to the database itself:** that would require storing a TrainFlow session on the computer. Keeping results on disk until a signed-in browser saves them avoids that.
- **Endpoints** (all require the pairing token and the exact Origin): `GET /jobs?account=`, `POST /jobs` (video body; settings in the URI-encoded `X-TrainFlow-Job` header), `GET /jobs/<id>/video`, `GET /jobs/<id>/result`, `PUT /jobs/<id>/media`, `POST /jobs/<id>/retry`, `DELETE /jobs/<id>`. Discovery advertises `features: ["jobs"]`; older analyzers are reported as needing an update.

## Trim and stabilization (analyzer 1.3+)

Before a video is queued the coach can trim it to the part that matters and turn on stabilization. The
browser first checks whether the camera moved (it compares the picture's edges over a dozen frames); if it did,
stabilization is required and switched on.

The analyzer then runs `preprocess.py` (from the MotionTrace bridge, using the vision environment's PyAV and
OpenCV) before tracking: it cuts the chosen part and, when asked, aligns every frame to the frame the points were
marked on (similarity transform from background corners, RANSAC), so the marked points stay valid. The result is
re-encoded as H.264 MP4 at the original size. The tracker, the result and the video saved to the library all use
this clip; the job then reports the clip's length, the marked frame's time inside it and `contentType: video/mp4`.
Discovery advertises the `preprocess` feature; the web app asks to update analyzers without it.

## Troubleshooting pairing

The web page talks to the analyzer at `http://127.0.0.1:59121`. Every request must come from the **exact site address** the analyzer was configured for (`WebOrigin` in `analyzer.json` next to the installed program, taken from `release.json` at build time) and carry the current pairing token. New analysis shows which state applies:

- **Not detected:** the analyzer is not running, is blocked, or was built for another address. A different origin (for example `http://localhost:5175` when the build says `http://localhost:5173`) is refused before CORS, so the browser cannot tell it from "not running"; New analysis compares `release.json` with the page address and says so. Fix: open TrainFlow at the configured address, or change `WebOrigin` in the installed `analyzer.json` and restart the analyzer (development), or rebuild the installer with `-WebOrigin`.
- **Pairing:** analyzer 1.1+ pairs automatically: the page calls `POST /pair` once and keeps the token in the browser; the analyzer keeps the same token in `%LOCALAPPDATA%\TrainFlowAnalyzer\pairing-token` across restarts (delete it to unpair every browser). Older builds print a token that changes at every start; paste it under Pair manually.
- **Starting from the browser:** the installer registers `trainflow-analyzer://`, so Start analysis can launch the installed analyzer (the browser asks once). A second start while it already runs exits quietly.
- **Setup log:** the installer writes every step and any failure to `%LOCALAPPDATA%\TrainFlowAnalyzer-setup.log`.
- **Windows "Unknown publisher" / "Windows protected your PC":** the development installer is not code-signed. Choose More info → Run anyway, or sign the release build for distribution.
- **Local network permission:** some browsers ask before a page may reach `127.0.0.1`; allow it.

## Source development

From the TrainFlow repository:

```powershell
./tools/TrainFlow.LocalAnalyzer/start.ps1
# If the web app uses a different local origin:
./tools/TrainFlow.LocalAnalyzer/start.ps1 -WebOrigin http://127.0.0.1:5173
```

Open Analyze → New analysis, paste the terminal's pairing token, choose a video and exercise, mark two points on a frame, then start. Restarting rotates the token; Ctrl+C stops the companion. The browser may ask permission to access the local network.

`-MotionTraceRoot` defaults to `C:/Work/Projects/MotionTrace`. The bridge loads the current user's MotionTrace `settings.json`/Python defaults and prefers the source `.models/vision`; see [bridge setup](../TrainFlow.MotionTraceBridge/README.md). Only TAPNext++ runs, rather than all comparison trackers. Reps, phases, continuity and signed vertical px/s use the original Core engine. No physical calibration or camera stabilization is introduced.

The HTTP host binds only `127.0.0.1:59121`. It requires an exact configured Origin, exact Host and random per-process bearer token. Do not publish/proxy this port. Browser requests contain video bytes and tracking configuration, never caller-provided filesystem paths. There is one job at a time, a 256 MiB limit and a two-hour timeout. Cancel, account change and leaving the page abort the request and kill Python subprocess trees. Private temporary inputs/cache are removed after each job; forced termination/power loss may leave temporary files under `%TEMP%/TrainFlow.LocalAnalyzer`.

The UI reports local inference, private upload and result save separately. Failed library saves retain the result and frozen retry receipt in the current page; retry reuses finalized media and the same idempotency key, without running ML again. Leaving/reloading before a successful save loses that in-memory retry state; JSON download remains available. Historical results remain unchanged. Browser-only inference still requires a validated TAPNext++ export.

## Build the installer

Use a Windows build host with the existing three MotionTrace environments and models, and a separate packaging interpreter with `conda-pack==0.8.1` and `setuptools==80.9.0` (the latter retains conda-pack's pkg_resources dependency). Do not install packaging tools into the ML environments.

```powershell
./tools/TrainFlow.LocalAnalyzer/build-installer.ps1 -PackagingTools C:/path/to/isolated/packaging/site-packages
# Production distribution must rebuild with its exact public origin and HTTPS asset URL:
# -WebOrigin https://app.example.com -BaseUrl https://downloads.example.com/analyzer
```

Generated assets live under ignored `apps/web/public/downloads/analyzer`; Vite serves them locally. Deploy the EXE and **all** adjacent release assets to the chosen asset URL. The installer embeds asset hashes; a partial build does not publish a new EXE. Existing environment/model archives are reused for interrupted builds; remove these generated archives explicitly when updating runtime dependencies/models. Host and source archives are rebuilt. Keep release directories immutable after publication. Assets must not go into Git.

The source pose environment contains pip replacements for Conda packaging/setuptools records. Packaging audits this exact known metadata mismatch, rejects other missing packages or any missing executable/DLL, and requires a clean `pip check`; no model dependency error is waived. `packaging-audit.json` records the reviewed replacements. Model manifests, dependency licenses and ThirdPartyNotices are retained; no account configuration, videos, analysis caches or secrets are bundled. Setup supports per-user Windows uninstall; upgrades are explicitly initiated from the web app. The generated development EXE is unsigned: production distribution still needs a code-signing certificate and release testing on a clean supported Windows machine.

Verification:

```powershell
dotnet build tools/TrainFlow.LocalAnalyzer --artifacts-path .local/local-analyzer-artifacts -p:MotionTraceRoot=C:/Work/Projects/MotionTrace
python infra/local-analysis/test_companion.py
dotnet run --project infra/local-analysis/update-check --artifacts-path .local/analyzer-update-check
./tools/TrainFlow.MotionTraceBridge/build.ps1 -Check
```

The HTTP checks do not run inference. Local resource inspection on 2026-10-17 found about 1.7 GiB free RAM and 6.2 GiB available Windows commit, below the existing TAPNext++ scheduler admission threshold (4,524 MiB free RAM, or 2,560 MiB free RAM plus 10,240 MiB commit). Fresh model inference was not verified on this resource-constrained host; no guard was bypassed.
