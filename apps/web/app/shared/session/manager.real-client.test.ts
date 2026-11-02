// @vitest-environment jsdom
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "./manager";
import { slotStorageKey, type SlotId } from "./storage-keys";

// A real Supabase Auth client against a fake Auth server: the event order is the SDK's own.
const users: Record<string, string> = { "a@test.test": "11111111-1111-4111-8111-111111111111", "b@test.test": "22222222-2222-4222-8222-222222222222" };
const jwt = (sub: string, email: string) => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, email, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", aud: "authenticated" })}.sig`;
};
const unconfirmed = new Set<string>();
const user = (email: string) => ({ id: users[email], email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, email_confirmed_at: unconfirmed.has(email) ? undefined : "2026-01-01T00:00:00Z", created_at: new Date().toISOString(), is_anonymous: false });
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  await new Promise(r => setTimeout(r, 30));
  if (url.includes("/token?grant_type=password")) {
    const { email } = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ access_token: jwt(users[email]!, email), refresh_token: `r-${email}`, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(email) }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.endsWith("/user")) {
    const token = new Headers(init?.headers).get("authorization")!.slice(7);
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return new Response(JSON.stringify(user(payload.email)), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
};
const clients = new Map<SlotId, SupabaseClient>();
const clientFor = (slot: SlotId) => {
  let c = clients.get(slot);
  if (!c) { c = createClient("http://auth.test", "anon", { auth: { storageKey: slotStorageKey(slot), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: "pkce" }, global: { fetch: fakeFetch } }); clients.set(slot, c); }
  return c;
};

async function signIn(manager: SessionManager, slot: SlotId, email: string) {
  const { data, error } = await manager.client(slot).auth.signInWithPassword({ email, password: "x" });
  if (error) throw error;
  await manager.completeSignIn(slot, data.session!);
}

describe("SessionManager with the real Supabase client", () => {
  afterEach(() => { unconfirmed.clear(); clients.clear(); localStorage.clear(); sessionStorage.clear(); });

  it("rejects password sessions before confirmation, including the SDK SIGNED_IN event", async () => {
    unconfirmed.add("a@test.test");
    const manager = new SessionManager(clientFor);
    await manager.start();
    await expect(signIn(manager, 0, "a@test.test")).rejects.toMatchObject({ code: "email_not_confirmed" });
    await new Promise(r => setTimeout(r, 150));
    expect(manager.getState().accounts).toEqual([]);
    expect(manager.getState().activeSlot).toBeNull();
  });

  it("does not restore a previously saved session without Auth confirmation", async () => {
    const first = new SessionManager(clientFor);
    await first.start();
    await signIn(first, 0, "a@test.test");
    await new Promise(r => setTimeout(r, 150));
    unconfirmed.add("a@test.test");
    const restored = new SessionManager(clientFor);
    await restored.start();
    expect(restored.getState().accounts).toEqual([]);
  });

  it("removes an active account when Auth no longer confirms its email", async () => {
    const manager = new SessionManager(clientFor);
    await manager.start();
    await signIn(manager, 0, "a@test.test");
    unconfirmed.add("a@test.test");
    await manager.revalidate();
    expect(manager.getState().accounts).toEqual([]);
  });

  it("keeps a second account signed in and active after adding it", async () => {
    const manager = new SessionManager(clientFor);
    await manager.start();
    await signIn(manager, 0, "a@test.test");
    await new Promise(r => setTimeout(r, 200));
    expect(manager.getState().activeSlot).toBe(0);

    await signIn(manager, manager.slotForNewSignIn(1)!, "b@test.test");
    await new Promise(r => setTimeout(r, 300));
    const state = manager.getState();
    expect(state.accounts.map(a => a.email).sort()).toEqual(["a@test.test", "b@test.test"]);
    expect(state.activeSlot).toBe(1);
  });

  it("restores both accounts after a reload", async () => {
    const first = new SessionManager(clientFor);
    await first.start();
    await signIn(first, 0, "a@test.test");
    await signIn(first, 1, "b@test.test");
    await new Promise(r => setTimeout(r, 300));
    clients.clear();
    const second = new SessionManager(clientFor);
    await second.start();
    expect(second.getState().accounts.map(a => a.email).sort()).toEqual(["a@test.test", "b@test.test"]);
    expect(second.getState().activeSlot).toBe(1);
  });
});
