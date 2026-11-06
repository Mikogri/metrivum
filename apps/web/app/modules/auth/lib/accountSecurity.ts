import { AuthError, createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beginCallbackAttempt } from "./callback-attempt";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import type { SlotId } from "~/shared/session/storage-keys";

/** Where the email-change confirmation links return: the callback, told which signed-in slot they belong to. */
export function emailChangeUrl(slot: SlotId, email: string, userId: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("slot", String(slot));
  url.searchParams.set("flow", "email-change");
  url.searchParams.set("nonce", beginCallbackAttempt(slot, email, "email-change", userId));
  return url.toString();
}

/**
 * Checks the current password without touching the signed-in session: a throwaway client that keeps nothing
 * signs in once and drops its session locally. This is a UI check; Supabase must enforce the policy server-side
 * ("require current password"); a browser check cannot prevent direct Auth API calls.
 */
export async function verifyPassword(email: string, password: string, captchaOptions: { captchaToken?: string } = {}): Promise<boolean> {
  if (MOCK_MODE) return true;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured.");
  const probe = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `tf-verify-${crypto.randomUUID()}` },
    global: { headers: { "X-Client-Info": "trainflow-web" } },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password, options: captchaOptions });
  if (error) {
    if (error instanceof AuthError && error.code === "invalid_credentials") return false;
    throw error;
  }
  await probe.auth.signOut({ scope: "local" });
  return true;
}

/**
 * Starts an email change. Supabase sends a confirmation link to the new address (and, with secure email
 * change on, one to the current address too); the email changes only after the link(s) are opened.
 */
export async function requestEmailChange(client: SupabaseClient, slot: SlotId, email: string, userId: string) {
  const { data, error } = await client.auth.updateUser({ email }, { emailRedirectTo: emailChangeUrl(slot, email, userId) });
  if (error) throw error;
  return data.user;
}

/** Supabase error codes specific to these two forms. */
export function securityErrorCode(error: unknown): "same_password" | "current_password" | "email_exists" | null {
  if (!(error instanceof AuthError)) return null;
  if (error.code === "same_password") return "same_password";
  if (error.code === "current_password_invalid" || error.code === "current_password_mismatch" || error.code === "current_password_required" || error.code === "reauthentication_needed") return "current_password";
  if (error.code === "email_exists" || error.code === "user_already_exists") return "email_exists";
  return null;
}
