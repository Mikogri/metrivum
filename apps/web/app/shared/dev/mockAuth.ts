import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { slotStorageKey, type SlotId } from "~/shared/session/storage-keys";

/** In-memory stand-in for Supabase Auth in developer mock mode. Accepts any email/password. */
export function mockAuthClient(slot: SlotId): SupabaseClient {
  const key = slotStorageKey(slot);
  const read = (): Session | null => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Session) : null;
  };
  const write = (session: Session | null) => (session ? localStorage.setItem(key, JSON.stringify(session)) : localStorage.removeItem(key));
  const make = (email: string): Session =>
    ({
      access_token: `mock-${slot}`,
      refresh_token: `mock-refresh-${slot}`,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: { id: `00000000-0000-4000-8000-00000000000${slot}`, email, is_anonymous: false, aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }) as unknown as Session;
  const ok = (session: Session | null) => ({ data: { session, user: session?.user ?? null }, error: null });
  const auth = {
    getSession: async () => ok(read()),
    refreshSession: async () => ok(read()),
    signInWithPassword: async ({ email }: { email: string }) => {
      const session = make(email);
      write(session);
      return ok(session);
    },
    signUp: async ({ email }: { email: string }) => {
      const session = make(email);
      write(session);
      return ok(session);
    },
    signInWithOtp: async () => ({ data: {}, error: null }),
    verifyOtp: async ({ email }: { email?: string }) => {
      const session = make(email ?? "coach@trainflow.test");
      write(session);
      return ok(session);
    },
    resend: async () => ({ data: {}, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async () => ({ data: { user: read()?.user ?? null }, error: null }),
    exchangeCodeForSession: async () => ok(read()),
    signOut: async () => {
      write(null);
      return { error: null };
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  };
  return { auth } as unknown as SupabaseClient;
}
