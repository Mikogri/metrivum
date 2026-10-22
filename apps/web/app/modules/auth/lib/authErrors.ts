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

/** Supabase stores passwords with bcrypt, which ignores everything after 72 bytes; refuse longer ones openly. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export function passwordProblem(m: AppMessages, password: string): string | null {
  if (password.length < PASSWORD_MIN) return m.auth.errors.passwordShort;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return m.auth.errors.passwordLong;
  return null;
}

/** Sign-up for an address that already has an account. Treated like success so the form does not reveal accounts. */
export function isExistingAccount(error: unknown): boolean {
  return error instanceof AuthError && (error.code === "user_already_exists" || error.code === "email_exists");
}

/** Passwordless sign-in for an address without an account (Supabase refuses to create one here). */
export function isUnknownAccount(error: unknown): boolean {
  return error instanceof AuthError && (error.code === "otp_disabled" || error.code === "signup_disabled" || error.code === "user_not_found");
}

export function isEmailNotConfirmed(error: unknown): boolean {
  return error instanceof AuthError && error.code === "email_not_confirmed";
}
