import { AuthError, type Factor, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { slotStorageKey, type SlotId } from "~/shared/session/storage-keys";

/** The code the mock authenticator accepts. */
export const MOCK_TOTP_CODE = "123456";

const MOCK_QR = `data:image/svg+xml;utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1zM13 1h7v7h-7zM1 13h7v7H1z" fill="#000"/><path d="M2 2h5v5H2zM14 2h5v5h-5zM2 14h5v5H2z" fill="#fff"/><path d="M3 3h3v3H3zM15 3h3v3h-3zM3 15h3v3H3zM10 2h1v3h-1zM9 9h3v3H9zM13 10h2v1h-2zM16 12h3v2h-3zM10 14h2v5h-2zM14 15h1v4h-1zM17 16h2v3h-2z" fill="#000"/></svg>')}`;

/**
 * In-memory stand-in for Supabase Auth in developer mock mode. Accepts any email/password; authenticator apps
 * accept the code 123456. Sessions carry their level in `aal` instead of a signed token.
 */
export function mockAuthClient(slot: SlotId): SupabaseClient {
  const key = slotStorageKey(slot);
  const factorsKey = `${key}.mock-factors`;
  const read = (): Session | null => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Session) : null;
  };
  const write = (session: Session | null) => (session ? localStorage.setItem(key, JSON.stringify(session)) : localStorage.removeItem(key));
  const factors = (): Factor[] => JSON.parse(localStorage.getItem(factorsKey) ?? "[]") as Factor[];
  const saveFactors = (list: Factor[]) => {
    localStorage.setItem(factorsKey, JSON.stringify(list));
    const session = read();
    if (session) write({ ...session, user: { ...session.user, factors: list } });
  };
  const setAal = (aal: "aal1" | "aal2") => {
    const session = read();
    if (session) write({ ...session, aal } as Session);
  };
  const make = (email: string): Session =>
    ({
      access_token: `mock-${slot}`,
      refresh_token: `mock-refresh-${slot}`,
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      aal: "aal1",
      user: { id: `00000000-0000-4000-8000-00000000000${slot}`, email, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, aud: "authenticated", app_metadata: { providers: ["email"] }, user_metadata: {}, identities: [{ provider: "email" }], factors: factors(), created_at: new Date().toISOString() },
    }) as unknown as Session;
  const ok = (session: Session | null) => ({ data: { session, user: session?.user ?? null }, error: null });
  const signIn = (email: string) => {
    const session = make(email);
    write(session);
    return ok(session);
  };
  const mfa = {
    enroll: async ({ friendlyName }: { friendlyName?: string }) => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      if (factors().some(f => f.friendly_name === friendlyName)) return { data: null, error: new AuthError("Name taken", 422, "mfa_factor_name_conflict") };
      saveFactors([...factors(), { id, friendly_name: friendlyName, factor_type: "totp", status: "unverified", created_at: now, updated_at: now }]);
      return { data: { id, type: "totp", friendly_name: friendlyName, totp: { qr_code: MOCK_QR, secret: "JBSWY3DPEHPK3PXPMOCKMOCK", uri: "otpauth://totp/Metrivum:mock" } }, error: null };
    },
    challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
      if (code !== MOCK_TOTP_CODE) return { data: null, error: new AuthError("Invalid TOTP code entered", 422, "mfa_verification_failed") };
      saveFactors(factors().map(f => f.id === factorId ? { ...f, status: "verified" as const, updated_at: new Date().toISOString() } : f));
      setAal("aal2");
      return { data: read(), error: null };
    },
    unenroll: async ({ factorId }: { factorId: string }) => {
      saveFactors(factors().filter(f => f.id !== factorId));
      return { data: { id: factorId }, error: null };
    },
    listFactors: async () => ({ data: { all: factors(), totp: factors().filter(f => f.status === "verified"), phone: [], webauthn: [] }, error: null }),
    getAuthenticatorAssuranceLevel: async () => {
      const session = read() as (Session & { aal?: string }) | null;
      return { data: { currentLevel: session?.aal ?? null, nextLevel: factors().some(f => f.status === "verified") ? "aal2" : "aal1", currentAuthenticationMethods: [] }, error: null };
    },
  };
  const auth = {
    getSession: async () => ok(read()),
    getUser: async () => ({ data: { user: read()?.user ?? null }, error: null }),
    refreshSession: async () => ok(read()),
    signInWithPassword: async ({ email }: { email: string }) => signIn(email),
    signUp: async ({ email }: { email: string }) => signIn(email),
    signInWithOtp: async () => ({ data: {}, error: null }),
    verifyOtp: async ({ email }: { email?: string }) => signIn(email ?? "coach@trainflow.test"),
    resend: async () => ({ data: {}, error: null }),
    resetPasswordForEmail: async () => ({ data: {}, error: null }),
    updateUser: async ({ email }: { email?: string; password?: string }) => {
      const session = read();
      if (session && email) write({ ...session, user: { ...session.user, new_email: email } });
      return { data: { user: read()?.user ?? null }, error: null };
    },
    exchangeCodeForSession: async () => ok(read()),
    signOut: async ({ scope }: { scope?: string } = {}) => {
      if (scope !== "others") write(null);
      return { error: null };
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    mfa,
  };
  return { auth } as unknown as SupabaseClient;
}
