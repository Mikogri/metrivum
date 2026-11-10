import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { mockAuthClient } from "~/shared/dev/mockAuth";
import { slotStorageKey, type SlotId } from "./storage-keys";
import { StaleAccountError } from "../http/errors";

const clients = new Map<SlotId, SupabaseClient>();

export function supabaseConfigured(): boolean {
  if (MOCK_MODE) return true;
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
}

/**
 * One Supabase Auth client per account slot, each with its own storage key, PKCE verifier
 * and refresh timer, so signing in a second account never overwrites the first.
 * Only Auth is used; business data comes from the Metrivum API.
 */
export function authClient(slot: SlotId): SupabaseClient {
  if (typeof window === "undefined")
    throw new Error(
      "Supabase Auth is browser-only and must not run during pre-rendering.",
    );
  let client = clients.get(slot);
  if (!client && MOCK_MODE) {
    client = mockAuthClient(slot);
    clients.set(slot, client);
  }
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      throw new Error(
        "Supabase Auth is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).",
      );
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

/** The SDK saves successful Auth responses before resolving, so guard its storage boundary too. */
export type AuthAttemptIdentity = { email?: string; userId?: string };
export function authAttemptClient(
  slot: SlotId,
  isCurrent: () => boolean,
  expected: AuthAttemptIdentity = {},
  initialSession?: Session,
): SupabaseClient {
  if (MOCK_MODE) return authClient(slot);
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured.");
  let live = true;
  let sessionValue = initialSession ? JSON.stringify(initialSession) : null;
  const sessionKey = slotStorageKey(slot);
  const storedUserId = () => {
    try {
      return (
        JSON.parse(window.localStorage.getItem(sessionKey) ?? "null")?.user
          ?.id ?? null
      );
    } catch {
      return null;
    }
  };
  const originalUserId = storedUserId();
  const candidateKey = `${sessionKey}.attempt.${crypto.randomUUID()}`;
  const storedKey = (name: string) =>
    name.startsWith(candidateKey)
      ? sessionKey + name.slice(candidateKey.length)
      : name;
  let saved = false;
  const assertCurrent = () => {
    if (!live || !isCurrent()) throw new StaleAccountError();
  };
  const client = createClient(url, key, {
    auth: {
      storageKey: candidateKey,
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        // Only an explicitly seeded authenticated attempt may load an existing session.
        getItem: (name) =>
          name === candidateKey
            ? sessionValue
            : window.localStorage.getItem(storedKey(name)),
        setItem: (name, value) => {
          assertCurrent();
          if (name === candidateKey) {
            const user = JSON.parse(value).user;
            if (
              (expected.userId && user?.id !== expected.userId) ||
              (expected.email &&
                user?.email?.trim().toLowerCase() !==
                  expected.email.trim().toLowerCase())
            )
              throw new StaleAccountError();
            const currentUserId = storedUserId();
            if (currentUserId !== originalUserId && currentUserId !== user?.id)
              throw new StaleAccountError();
            sessionValue = value;
            saved = true;
          }
          window.localStorage.setItem(storedKey(name), value);
        },
        removeItem: (name) => {
          if (!live || !isCurrent()) return;
          if (name === candidateKey) {
            const ownSession = sessionValue;
            sessionValue = null;
            if (
              !saved ||
              window.localStorage.getItem(sessionKey) !== ownSession
            )
              return;
          }
          window.localStorage.removeItem(storedKey(name));
        },
      },
    },
    global: { headers: { "X-Client-Info": "trainflow-web" } },
  });
  // Candidates have separate SDK coordination; accepted changes still reach the slot in other tabs.
  const channel =
    typeof BroadcastChannel === "undefined"
      ? undefined
      : new BroadcastChannel(sessionKey);
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (saved && live && isCurrent() && event !== "INITIAL_SESSION")
      channel?.postMessage({ event, session });
  });
  const dispose = client.auth.dispose.bind(client.auth);
  client.auth.dispose = async () => {
    live = false;
    data.subscription.unsubscribe();
    channel?.close();
    await dispose();
  };
  return client;
}

/** For tests only. */
export function resetAuthClients() {
  clients.clear();
}
