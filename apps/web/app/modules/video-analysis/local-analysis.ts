import type {
  AnalysisResult,
  AnalysisTracking,
} from "@metrivum/api-client-web";

export const LOCAL_ANALYZER_UNAVAILABLE =
  "Browser-only analysis needs a validated browser export. Desktop web uses the paired MotionTrace companion and saves completed videos/results privately. This action does not start a server GPU queue. Historical results remain available.";
export function requireLocalAnalyzer(): never {
  throw new Error(LOCAL_ANALYZER_UNAVAILABLE);
}

export type CompanionState =
  | "unreachable"
  | "pairing_required"
  | "ready"
  | "analyzing"
  | "runtime_missing"
  | "incompatible";
export async function checkLocalAnalyzer(
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<CompanionState> {
  const timeout = AbortSignal.timeout(3000);
  const combined = AbortSignal.any([signal, timeout]);
  try {
    const discovery = await fetcher("http://127.0.0.1:59121/discovery", {
      signal: combined,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    if (!discovery.ok) return "unreachable";
    const info = await discovery.json();
    // Background queue (1.2+) is required: older analyzers ask for an update.
    if (
      info.application !== "Metrivum.LocalAnalyzer" ||
      info.protocolVersion !== 1 ||
      !Array.isArray(info.features) ||
      !info.features.includes("jobs") ||
      !info.features.includes("preprocess")
    )
      return "incompatible";
    if (!token.trim()) return "pairing_required";
    const status = await fetcher("http://127.0.0.1:59121/status", {
      signal: combined,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    if (status.status === 401) return "pairing_required";
    if (!status.ok) return "unreachable";
    const data = await status.json();
    return data.protocolVersion === 1 &&
      ["ready", "analyzing", "runtime_missing"].includes(data.state)
      ? (data.state as CompanionState)
      : "incompatible";
  } catch {
    signal.throwIfAborted();
    return "unreachable";
  }
}

const COMPANION = "http://127.0.0.1:59121";
const TOKEN_KEY = "trainflow.localAnalyzer.token";

/** The token is remembered in this browser, so pairing happens once per computer and browser. */
export function storedPairing(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}
export function storePairing(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: pairing lasts for this page only */
  }
  try {
    window.dispatchEvent(new Event("trainflow:analyzer-changed"));
  } catch {
    /* no window (tests, SSR) */
  }
}

/** Analyzer 1.1+ hands its token to the configured site directly; older builds need it pasted. */
export async function pairLocalAnalyzer(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(`${COMPANION}/pair`, {
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { token?: unknown };
    return typeof data.token === "string" && /^[0-9A-F]{64}$/i.test(data.token)
      ? data.token
      : null;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

/** Asks Windows to start the installed analyzer through its registered link (the browser may ask first). */
export function launchLocalAnalyzer() {
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = "metrivum-analyzer://start";
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 2000);
}

/** Polls until the analyzer answers (or the time runs out); returns the last state seen. */
export async function waitForLocalAnalyzer(
  token: string,
  signal: AbortSignal,
  timeoutMs = 60000,
  fetcher: typeof fetch = fetch,
): Promise<CompanionState> {
  const until = Date.now() + timeoutMs;
  let state: CompanionState = "unreachable";
  while (Date.now() < until) {
    state = await checkLocalAnalyzer(token, signal, fetcher);
    if (state !== "unreachable") return state;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1500);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }
  return state;
}

/** A video queued in the local analyzer. The analyzer keeps it on disk until a signed-in browser saves it. */
export interface AnalyzerJob {
  id: string;
  name: string;
  fileName: string;
  size: number;
  state: "queued" | "analyzing" | "done" | "failed";
  /** Estimated 0..1 (the analyzer reports no real progress); 1 once done. */
  progress: number;
  /** 1 = next in line; only for queued jobs. */
  position: number | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  /** Set once the video was uploaded to the library, so a later save never uploads it twice. */
  mediaId: string | null;
  sourceVideo: { durationSeconds: number; width: number; height: number };
  configuration: { movement: string; tracking: AnalysisTracking };
  /** video/mp4 once the analyzer trimmed or stabilized the clip (that clip is what gets saved). */
  contentType?: string;
  trim?: VideoTrim | null;
  stabilize?: boolean;
  /** What the analyzer is doing right now ("Stabilizing video", "Tracking the points"), with real progress in `progress`. */
  stage?: string | null;
}

/** Part of the video to analyze, in seconds of the original video. */
export interface VideoTrim {
  startSeconds: number;
  endSeconds: number;
}

export interface QueueRequest {
  name: string;
  /** The signed-in user the result belongs to; another user on this computer never sees or saves it. */
  account: string;
  movement: string;
  tracking: AnalysisTracking;
  sourceVideo: { durationSeconds: number; width: number; height: number };
  /** Analyze only this part of the video. */
  trim?: VideoTrim | null;
  /** Align every frame to the marked one, removing camera movement, before tracking. */
  stabilize?: boolean;
}

/** The analyzer keeps at most this many videos (waiting, analyzing or not yet saved). */
export const QUEUE_LIMIT = 10;

export class AnalyzerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function companion(
  path: string,
  token: string,
  init: RequestInit & { signal: AbortSignal },
  fetcher: typeof fetch,
) {
  const response = await fetcher(`${COMPANION}${path}`, {
    ...init,
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token.trim()}`,
    },
  });
  if (response.status === 401)
    throw new AnalyzerError(
      "This browser is not paired with the local analyzer.",
      401,
    );
  if (!response.ok) {
    let detail = "";
    try {
      detail = ((await response.json()) as { detail?: string }).detail ?? "";
    } catch {
      /* no body */
    }
    throw new AnalyzerError(
      detail ||
        (response.status === 409
          ? `The analyzer already holds ${QUEUE_LIMIT} videos.`
          : "The local analyzer could not complete the request."),
      response.status,
    );
  }
  return response;
}

export async function listJobs(
  token: string,
  account: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AnalyzerJob[]> {
  const response = await companion(
    `/jobs?account=${encodeURIComponent(account)}`,
    token,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
    fetcher,
  );
  const jobs = (await response.json()) as AnalyzerJob[];
  return Array.isArray(jobs) ? jobs : [];
}

/** Hands one video to the analyzer. Once this resolves the browser may close: the analyzer works on its own. */
export async function enqueueJob(
  file: File,
  request: QueueRequest,
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AnalyzerJob> {
  const response = await companion(
    "/jobs",
    token,
    {
      method: "POST",
      signal,
      body: file,
      headers: {
        "Content-Type": videoType(file),
        // URI-encoded so names in any language survive the HTTP header.
        "X-Metrivum-Job": encodeURIComponent(
          JSON.stringify({ ...request, fileName: file.name }),
        ),
      },
    },
    fetcher,
  );
  return (await response.json()) as AnalyzerJob;
}

export async function jobVideo(
  token: string,
  job: AnalyzerJob,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<File> {
  const response = await companion(
    `/jobs/${encodeURIComponent(job.id)}/video`,
    token,
    { signal },
    fetcher,
  );
  const blob = await response.blob();
  // A trimmed or stabilized clip is re-encoded as MP4: name it so, the upload derives its type from the name.
  const name =
    job.contentType === "video/mp4" && !/\.mp4$/i.test(job.fileName)
      ? job.fileName.replace(/\.[^.]+$/, "") + ".mp4"
      : job.fileName;
  return new File([blob], name, { type: blob.type || "video/mp4" });
}

export async function jobResult(
  token: string,
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AnalysisResult> {
  const response = await companion(
    `/jobs/${encodeURIComponent(id)}/result`,
    token,
    { signal },
    fetcher,
  );
  const result = (await response.json()) as AnalysisResult;
  if (
    result.schemaVersion !== 1 ||
    !Array.isArray(result.trajectory) ||
    !Array.isArray(result.repetitions) ||
    !Array.isArray(result.warnings)
  )
    throw new Error("Unsupported local analyzer result.");
  return result;
}

export async function rememberJobMedia(
  token: string,
  id: string,
  mediaId: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  await companion(
    `/jobs/${encodeURIComponent(id)}/media`,
    token,
    {
      method: "PUT",
      signal,
      body: JSON.stringify({ mediaId }),
      headers: { "Content-Type": "application/json" },
    },
    fetcher,
  );
}

/** Opens the analyzer's window on this computer (it creates one if it was started without a window). */
export async function showAnalyzerWindow(
  token: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  await companion(
    "/window",
    token,
    {
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    },
    fetcher,
  );
}

export async function retryJob(
  token: string,
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  await companion(
    `/jobs/${encodeURIComponent(id)}/retry`,
    token,
    { method: "POST", signal },
    fetcher,
  );
}

export async function removeJob(
  token: string,
  id: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  try {
    await companion(
      `/jobs/${encodeURIComponent(id)}`,
      token,
      { method: "DELETE", signal },
      fetcher,
    );
  } catch (error) {
    if (!(error instanceof AnalyzerError && error.status === 404)) throw error;
  }
}

function videoType(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".mov")
    ? "video/quicktime"
    : name.endsWith(".webm")
      ? "video/webm"
      : "video/mp4";
}
