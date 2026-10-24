import { AuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AppMessages } from "~/shared/i18n/messages/app.en";

/**
 * Supabase answers HTTP 500 "Error sending confirmation email" (or similar) when its mailer or SMTP fails.
 * Only the message is matched; it is never shown to the person.
 */
export function isEmailDeliveryFailure(error: unknown): boolean {
  return error instanceof AuthError && (error.status ?? 0) >= 500 && /(sending|send).*(e-?mail|confirmation|magic link|otp)|smtp|mail(er)? (server|provider)/i.test(error.message);
}

/** Maps Supabase Auth errors to copy. Never echoes server text containing user input. */
export function authErrorText(m: AppMessages, error: unknown): string {
  // In development the console keeps the server's reason (it only describes the service, not the person).
  if (import.meta.env.DEV && error instanceof AuthError) console.warn(`Supabase Auth ${error.status ?? ""} ${error.code ?? ""}: ${error.message}`);
  if (isEmailDeliveryFailure(error)) return m.auth.errors.emailDelivery;
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
/** The most used passwords of at least 8 characters, lower-cased (leaked-password lists). */
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "11111111", "00000000", "87654321", "123123123", "1q2w3e4r", "1qaz2wsx",
  "password", "password1", "password12", "password123", "passw0rd", "qwertyui", "qwertyuiop", "qwerty123", "qwerty12", "asdfghjk",
  "iloveyou", "sunshine", "princess", "football", "baseball", "superman", "trustno1", "welcome1", "letmein1", "abcd1234",
  "zaq12wsx", "q1w2e3r4", "aaaaaaaa", "abcdefgh", "admin123", "changeme", "computer", "michael1", "internet", "starwars",
  "trainflow", "trainflow1", "trainflow123", "haslo123", "kochamcie", "polska12", "qazwsxedc", "zxcvbnm1", "monkey12", "dragon12",
]);

/**
 * Length limits first, then the obvious guesses: a very common password, one character repeated, or the
 * email's name part. Supabase Auth keeps its own rules (and leaked-password protection when enabled).
 */
export function passwordProblem(m: AppMessages, password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return m.auth.errors.passwordShort;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return m.auth.errors.passwordLong;
  const lower = password.toLowerCase();
  const name = email?.split("@")[0]?.toLowerCase() ?? "";
  if (COMMON_PASSWORDS.has(lower) || new Set(lower).size <= 2 || (name.length >= 4 && lower.includes(name))) return m.auth.errors.passwordWeak;
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
