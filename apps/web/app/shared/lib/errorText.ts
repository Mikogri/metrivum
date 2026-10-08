import { ApiError, NetworkError } from "~/shared/http/errors";
import type { AppMessages } from "~/shared/i18n/messages/app.en";

/** Turns any thrown value into a sentence for the user, preferring stable API codes. */
export function errorText(m: AppMessages, error: unknown): string {
  if (error instanceof NetworkError) return error.timedOut ? m.errors.timeout : m.errors.network;
  if (error instanceof ApiError) {
    if (error.status === 429) return m.errors.rateLimited(error.retryAfterSeconds);
    if (error.code && m.errors.byCode[error.code]) return m.errors.byCode[error.code]!;
    if (error.status === 404) return m.errors.byCode.RESOURCE_NOT_FOUND!;
    if (error.status === 412) return m.errors.byCode.VERSION_CONFLICT!;
    if (error.status >= 500) return m.errors.byCode.INTEGRATION_UNAVAILABLE!;
  }
  return m.errors.generic;
}

/** First validation message per field from a 400 response, for inline field errors. */
export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError) || error.status !== 400) return undefined;
  const errors = error.fieldErrors;
  const key = Object.keys(errors).find((name) => name.toLowerCase() === field.toLowerCase() || name.toLowerCase().endsWith(`.${field.toLowerCase()}`));
  return key ? errors[key]?.[0] : undefined;
}

export function traceIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? (error.traceId ?? undefined) : undefined;
}
