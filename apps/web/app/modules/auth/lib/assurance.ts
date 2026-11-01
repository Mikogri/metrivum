import { AuthError, type Factor, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import type { AppMessages } from "~/shared/i18n/messages/app.en";
import type { SlotId } from "~/shared/session/storage-keys";

/**
 * Authentication levels as Supabase Auth defines them: `aal1` after a password, code or link, `aal2` after a
 * second factor in the same session. Read from the signed access token the API also receives; the API checks the
 * level again against Auth's own records, so this only decides what the browser shows.
 */
export type AssuranceLevel = "aal1" | "aal2";

function tokenClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    const claims: unknown = JSON.parse(json);
    return claims && typeof claims === "object" ? claims as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function sessionAal(session: Session): AssuranceLevel | null {
  const claim = tokenClaims(session.access_token)?.aal ?? (MOCK_MODE ? (session as Session & { aal?: string }).aal : undefined);
  return claim === "aal1" || claim === "aal2" ? claim : null;
}

/** Second factors that can be used at sign-in: verified authenticator apps (and phones, once offered). */
export function verifiedFactors(user: User | null | undefined): Factor[] {
  return (user?.factors ?? []).filter(f => f.status === "verified" && (f.factor_type === "totp" || f.factor_type === "phone"));
}

export function verifiedTotp(user: User | null | undefined): Factor[] {
  return verifiedFactors(user).filter(f => f.factor_type === "totp");
}

/** Signed in with the first step only, while the account has a second factor: the code must come first. */
export function needsSecondFactor(session: Session): boolean {
  return verifiedFactors(session.user).length > 0 && sessionAal(session) !== "aal2";
}

/** Accounts created with a sign-in code have no password until they set one. */
export function hasPassword(user: User | null | undefined): boolean {
  if (!user) return true;
  return user.identities?.some(identity => identity.provider === "email")
    ?? user.app_metadata.providers?.includes("email") ?? true;
}

/**
 * Checks a code from an authenticator app. Each check creates a fresh challenge, so it also works as a renewed
 * confirmation in a session that is already at `aal2`. Returns the session Supabase upgraded.
 */
export async function verifyAuthenticatorCode(client: SupabaseClient, factorId: string, code: string): Promise<Session> {
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, "") });
  if (error) throw error;
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error("No session");
  return data.session;
}

export function isSixDigitCode(code: string): boolean {
  return /^\d{6}$/.test(code.replace(/\s/g, ""));
}

/** Copy for Supabase MFA errors. Codes are never echoed back. */
export function mfaErrorText(m: AppMessages, error: unknown): string {
  const t = m.accountSecurity.errors;
  if (error instanceof AuthError) {
    switch (error.code) {
      case "mfa_verification_failed":
      case "mfa_verification_rejected":
        return t.wrongCode;
      case "mfa_challenge_expired":
        return t.codeExpired;
      case "too_many_enrolled_mfa_factors":
        return t.tooManyFactors;
      case "mfa_factor_name_conflict":
        return t.nameTaken;
      case "insufficient_aal":
        return t.needsSecondFactor;
      case "mfa_totp_enroll_not_enabled":
      case "mfa_totp_verify_not_enabled":
        return t.notEnabled;
      case "over_request_rate_limit":
        return m.auth.errors.rateLimited;
      default:
        if (error.status === 429) return m.auth.errors.rateLimited;
    }
  }
  return m.auth.errors.generic;
}

/**
 * Marks that this browser tab arrived from a password reset link for this account. The reset form refuses to
 * open without it, so a signed-in session alone cannot set a new password from the app: changing a password
 * always goes through the email link. Session storage: it ends with the tab and is cleared once used.
 */
const RECOVERY_LIFETIME = 60 * 60 * 1000;
const recoveryKey = (slot: SlotId) => `tf.auth.recovery.${slot}`;

export function markPasswordRecovery(slot: SlotId, userId: string) {
  try { sessionStorage.setItem(recoveryKey(slot), JSON.stringify({ userId, at: Date.now() })); } catch { /* storage unavailable */ }
}

export function hasPasswordRecovery(slot: SlotId, userId: string): boolean {
  try {
    const raw = sessionStorage.getItem(recoveryKey(slot));
    if (!raw) return false;
    const value = JSON.parse(raw) as { userId?: unknown; at?: unknown };
    return value.userId === userId && typeof value.at === "number" && Date.now() >= value.at && Date.now() - value.at < RECOVERY_LIFETIME;
  } catch {
    return false;
  }
}

export function clearPasswordRecovery(slot: SlotId) {
  try { sessionStorage.removeItem(recoveryKey(slot)); } catch { /* storage unavailable */ }
}

/** Seconds a person waits before asking for another email (Supabase refuses repeats within about a minute). */
export const EMAIL_RESEND_SECONDS = 60;
