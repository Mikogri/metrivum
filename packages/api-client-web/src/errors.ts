import type { ApiErrorCode, ProblemDetails } from "@metrivum/api-client-web";

/** Error raised for any non-2xx API response. Carries the stable `code` from ProblemDetails. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string | null;
  readonly problem: ProblemDetails | null;
  readonly traceId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    problem: ProblemDetails | null,
    retryAfterSeconds: number | null = null,
  ) {
    super(problem?.detail || problem?.title || `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = problem?.code ?? problem?.title ?? null;
    this.problem = problem;
    this.traceId = problem?.traceId ?? null;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Field-level validation messages keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {};
  }
}

/** The network failed, the request timed out, or the API was unreachable (no HTTP status). */
export class NetworkError extends Error {
  readonly timedOut: boolean;
  constructor(message: string, timedOut = false) {
    super(message);
    this.name = "NetworkError";
    this.timedOut = timedOut;
  }
}

/** The request belonged to an account that is no longer active; its result must be ignored. */
export class StaleAccountError extends Error {
  constructor() {
    super(
      "Response ignored: the account changed while the request was in flight.",
    );
    this.name = "StaleAccountError";
  }
}

export function isApiError(
  error: unknown,
  code?: ApiErrorCode | string,
): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  );
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof StaleAccountError ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
