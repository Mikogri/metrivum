import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { mockAuthClient } from "~/shared/dev/mockAuth";
import { slotStorageKey, type SlotId } from "./storage-keys";

const clients = new Map<SlotId, SupabaseClient>();

export function supabaseConfigured(): boolean {
  if (MOCK_MODE) return true;
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
}

/**
 * One Supabase Auth client per account slot, each with its own storage key, PKCE verifier
 * and refresh timer, so signing in a second account never overwrites the first.
 * Only Auth is used; business data comes from the Metrivum API.
 */
export function authClient(slot: SlotId): SupabaseClient {
  if (typeof window === "undefined") throw new Error("Supabase Auth is browser-only and must not run during pre-rendering.");
  let client = clients.get(slot);
  if (!client && MOCK_MODE) {
    client = mockAuthClient(slot);
    clients.set(slot, client);
  }
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase Auth is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).");
    client = createClient(url, key, {
      auth: {
        storageKey: slotStorageKey(slot),
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        // Callbacks are handled explicitly on /auth/callback so the right slot exchanges the code.
        detectSessionInUrl: false,
      },
      global: { headers: { "X-Client-Info": "trainflow-web" } },
    });
    clients.set(slot, client);
  }
  return client;
}

/** For tests only. */
export function resetAuthClients() {
  clients.clear();
}
