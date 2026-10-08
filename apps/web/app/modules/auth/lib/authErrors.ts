import { AuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AppMessages } from "~/shared/i18n/messages/app.en";

/** Maps Supabase Auth errors to copy. Never echoes server text containing user input. */
export function authErrorText(m: AppMessages, error: unknown): string {
  // Supabase also uses retryable fetch errors for HTTP 5xx (including SMTP failures).
  if (isAuthRetryableFetchError(error)) return error.status && error.status >= 500
    ? m.auth.errors.serviceUnavailable
    : m.auth.errors.network;
  if (error instanceof AuthError) {
    switch (error.code) {
      case "invalid_credentials":
        return m.auth.errors.invalidCredentials;
      case "email_not_confirmed":
        return m.auth.errors.emailNotConfirmed;
      case "over_request_rate_limit":
      case "over_email_send_rate_limit":
        return m.auth.errors.rateLimited;
      case "weak_password":
        return m.auth.errors.weakPassword;
      case "user_already_exists":
      case "email_exists":
        return m.auth.errors.userExists;
      case "otp_expired":
      case "flow_state_expired":
      case "flow_state_not_found":
      case "bad_code_verifier":
        return m.auth.errors.invalidCode;
      case "email_address_invalid":
        return m.auth.errors.emailInvalid;
      default:
        if (error.status === 429) return m.auth.errors.rateLimited;
    }
  }
  return m.auth.errors.generic;
}

export function isEmailNotConfirmed(error: unknown): boolean {
  return error instanceof AuthError && error.code === "email_not_confirmed";
}
