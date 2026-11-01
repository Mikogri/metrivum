# Local ML feasibility and reproduction

Milestone B, inspected 2026-10-10. **BLOCKED: there is no verified mobile or browser model artifact.** The repository currently integrates a desktop Python/PyTorch pipeline through a .NET bridge. The audit below verifies the real source artifact; it is not an inference success or a substitute for milestone G.

## Actual engine

`tools/Metrivum.MotionTraceBridge/Program.cs` calls the sibling MotionTrace repository's `ai/comparison/analyze_session.py`. Two selected points force provider `tapnextpp`. The active model is **TAPNext++ 256**, online recurrent PyTorch. BootsTAPIR and segmentation models remain installed for other research paths; replacing TAPNext++ with one of them changes the engine and has not been approved or validated.

The existing full reference pipeline contains:

1. PyAV video decoding and presentation timestamps, including rotation/edit lists.
2. Points-only timeline and target resolution in `comparison/points_prepare.py` (Metrivum passes `--points-only`; no RTMPose or classification).
3. TAPNext++ tracking of two independent physical points, carrying state across frames.
4. Pair spike rejection, visibility gaps and source coordinate restoration.
5. .NET temporal correction, `ProviderPreparation`, movement detection, phases and velocity.

Porting only the neural network does not reproduce this pipeline. A manually selected movement can avoid ambiguous classification, but that does not establish parity with the existing shared preparation. Historical results and the existing bridge remain intact.

## Verified source artifact

The offline [probe](../../infra/local-analysis/probe.py) produced [the source manifest](../../infra/local-analysis/tapnextpp-source-manifest.json). It verifies the checkpoint against a pinned checksum, all 60 installed source-file hashes, and records license evidence. It does not download anything or load weight storage for inference.

| Property | Observed value |
|---|---|
| Checkpoint | `MotionTrace/.models/points/tapnextpp_ckpt.pt` |
| File size | 2,532,282,370 bytes |
| SHA256 | `cb96a43444ccb4fbdb25d800b88c7ba196179a526e78f01b021a16b1c1eff6da` |
| Source revision | `730cda1c730877cfedbe01bf87fb1cadb78a565d` |
| Weight revision | `5d3fb48e76c5422841e38501514121e251beabb7` |
| Tensor metadata | 401 tensors; 244,534,529 float32 elements |
| Tensor storage sum | 978,138,116 bytes; not measured process/GPU memory |
| Installed reference | Python 3.11.16, PyTorch 2.8.0+cu126, CUDA available |
| License evidence | Local `LICENSE` and `MODEL_CARD.md`, both hashed in manifest |

The [official Google model card](https://huggingface.co/google/tapnet) labels these checkpoints Apache-2.0. Preserve copyright/license notices when redistributing a derived artifact. The local installation also retains `DEPENDENCY-LICENSES.json` and dependency license copies; a native package's complete dependency notices must be reviewed independently. The source manifest is **not** a public model download manifest: there is no exported artifact URL, signature, opset, supported native runtime or claimed mobile footprint.

Checkpoint container size differs substantially from tensor size. Do not estimate download size, ONNX size or peak inference memory from one of these values alone.

## Commands and observed results

Run from the Metrivum repository root, using the already installed MotionTrace interpreter:

```powershell
$pointsPython = 'C:/Users/Mikolaj/miniconda3/envs/motiontrace-points/python.exe'
& $pointsPython -X utf8 infra/local-analysis/probe.py `
  --model-root C:/Work/Projects/MotionTrace/.models/points `
  --output infra/local-analysis/tapnextpp-source-manifest.json --inspect-tensors
python -m unittest discover -s infra/local-analysis -v
```

Observed: integrity and metadata inspection passed; one test passed (tampered bytes and path escape rejected). `--inspect-tensors` uses installed PyTorch `FakeTensorMode`, `weights_only=True` and memory mapping. Without it the probe uses only the Python standard library. No model tensor values or video data enter the report. Source revisions/hashes are integrity evidence, not a cryptographic signature or proof of authorship.

Exporter preflight actually attempted:

```powershell
& $pointsPython -X utf8 -c 'from torch.onnx._internal.exporter import _core'
```

Observed: exit 1, `ModuleNotFoundError: No module named 'onnxscript'`. `onnx`, `onnxscript` and `onnxruntime` are all absent from this interpreter. No `.onnx`, `.ort`, `.tflite`, `.pte` or `.mlmodel` was found under the inspected point-model root. Export did **not** progress beyond preflight. No dependencies or new checkpoints were downloaded.

Reference memory admission can be reproduced without starting a model:

```powershell
& $pointsPython -X utf8 -c 'import sys,json; sys.path.insert(0,"C:/Work/Projects/MotionTrace/ai"); from comparison.scheduler import resources; print(json.dumps(resources()))'
```

Observed snapshot: 696 MiB free RAM, 4,329 MiB available commit, 6,391/8,192 MiB free/total GPU memory. These values fluctuate. MotionTrace's scheduler requires either 4,524 MiB free RAM or 2,560 MiB free RAM plus 10,240 MiB available commit for the single TAPNext++ path, in addition to GPU headroom. This host failed both RAM admission routes, so fresh full inference and weight-materializing export were not started. No applications were closed and the guard was not bypassed.

For a fresh desktop reference after meeting admission, use the existing [bridge build and request instructions](../../tools/Metrivum.MotionTraceBridge/README.md). Supply an explicit, legally usable clip and its two source-frame points, use a fresh private output/cache directory, and preserve the request, decoded timeline and raw tracker result for parity. Its output contains private data and belongs outside tracked source. Cached reference comparison in the bridge documentation is historical evidence, not a fresh run in this milestone.

## Runtime and device matrix

| Target | Candidate | This milestone | Outstanding evidence |
|---|---|---|---|
| Windows reference | Installed PyTorch CUDA | Checkpoint/source/metadata verified; exporter preflight failed | Fresh full reference under memory budget |
| Android native | ONNX Runtime RN or a native module | Not integrated or inferred | Export, native operators, decoder, memory, parity, actual device |
| iOS native | ONNX Runtime RN/CoreML execution provider candidate | Not built or inferred | macOS/Xcode, export, provider support, physical iPhone |
| Desktop browser WebGPU | ONNX Runtime Web Worker candidate | Not integrated or inferred | Export, operator coverage, decode, worker ownership, parity and network trace |
| Desktop browser WASM | ONNX Runtime Web WASM candidate | Not integrated or inferred | Operator/precision support and full memory budget; cannot promise fallback |

The [ONNX Runtime RN guide](https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html) provides a native package; its availability says nothing about this model's operator compatibility. The [web guide](https://onnxruntime.ai/docs/get-started/with-javascript/web.html) documents execution providers. No target runtime is selected as production-ready until the actual model passes it.

Android SDK exists at `%LOCALAPPDATA%/Android/Sdk`, including platforms 28, 30, 33, 34, 35, 36 and 36.1. `platform-tools/adb.exe devices -l` found one physical device in **unauthorized** state; no device inference was possible. The installed AVD is `flutter_emulator`; it was not started. This is a Windows host without a local macOS/Xcode iOS build environment. These observations do not certify the mobile application's build or native UI.

No initialization latency, clip duration throughput, peak inference memory, device temperature or browser FPS is reported because no target inference was executed.

## Contract a valid export must preserve

The pinned adapter preprocesses a fixed source-space crop as BGR to RGB, resized to 256, normalized to `[-1, 1]`. Network video input is `[B,T,H,W,3]`; initialization queries are `[t,y,x]`. The two query points use the same selected frame. Frames before initialization have no observation. Output network coordinates `[y,x]` are restored to `[x,y]` with crop/scale offsets. A point contributes only when its visibility logit is positive and its position lies inside both crop and source frame; raw invisible predictions remain diagnostics. The midpoint requires both valid points. Missing observations split continuity; they are not interpolated into a stationary barbell.

The network carries `TAPNextTrackingState`: step, original query points and 12 blocks of recurrent caches. Export needs separate initialization and recurrent-step contracts or an equivalently explicit state representation. Exporting a first-frame graph alone, resetting state each frame or dropping the caches cannot meet the tracking contract. Pin all output names, dtypes, shapes, state reset behavior, visibility thresholds, crop version and postprocessing version to the exported artifact. Verify raw positions/logits and the final trajectory/reps against the same reference clip before accepting a runtime.

The [ONNX Runtime large-model documentation](https://onnxruntime.ai/docs/tutorials/web/large-models.html) documents browser ArrayBuffer limits, the ONNX protobuf size limit, external data and WASM's memory limit. The measured tensor data is below the protobuf limit; graph/initializer duplication and working memory are not yet known. Use measured export size to decide external-data packaging, and hash each actual exported file. Do not feed a `.pt` checkpoint to ONNX Runtime or silently change resolution, FPS, precision or model to make a demo run.

## Remaining acceptance work

1. In an isolated development environment with sufficient memory, pin exporter/runtime packages and export both recurrent contracts from these verified weights; preserve upstream notices. No export script is claimed complete while export cannot run.
2. Establish one explicit rights-cleared test clip, decoded orientation/PTS, points/crop and full desktop reference; agree numerical position/logit and rep-boundary tolerances before comparison.
3. Prove actual native and browser execution, bounded decoder/frame/tensor ownership, cancellation, cleanup, interruption handling, artifact integrity and offline model cache. Port and verify the C# movement logic or explicitly version any changed method.
4. Test rotation, VFR/slow motion, visibility loss, invalid calibration, unsupported codecs/models and memory pressure. Collect runtime/version, hardware, initialization and total time, peak memory, and parity results.
5. Disable network after local model provisioning and use a network trace to demonstrate no clip/frame/tensor upload. Then separately test optional result-only synchronization and account isolation.

Until then the product must report local analysis unavailable. It must not label a mock, a server job, cached output, metadata inspection or Python process as completed on-device/browser analysis.
