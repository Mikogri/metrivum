import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "./manager";
import { StaleAccountError } from "../http/errors";
import { slotStorageKey, type SlotId } from "./storage-keys";

function session(userId: string, email: string): Session {
  return { access_token: `at-${userId}`, refresh_token: `rt-${userId}`, expires_in: 3600, token_type: "bearer", user: { id: userId, email, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false } } as unknown as Session;
}

function fakeClient(initial: Session | null) {
  let current = initial;
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: current?.user ?? null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: current } })),
      refreshSession: vi.fn(async () => ({ data: { session: current }, error: null })),
      signOut: vi.fn(async () => {
        current = null;
        return { error: null };
      }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  } as unknown as SupabaseClient;
}

describe("SessionManager (three independent accounts)", () => {
  let clients: Map<SlotId, SupabaseClient>;
  let manager: SessionManager;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clients = new Map<SlotId, SupabaseClient>([
      [0, fakeClient(session("u1", "a@example.test"))],
      [1, fakeClient(null)],
      [2, fakeClient(null)],
    ]);
    localStorage.setItem(slotStorageKey(0), JSON.stringify({ refresh_token: "rt-u1" }));
    manager = new SessionManager((slot) => clients.get(slot)!);
  });

  it("restores stored sessions and activates one", async () => {
    await manager.start();
    const state = manager.getState();
    expect(state.phase).toBe("ready");
    expect(state.accounts.map((a) => a.email)).toEqual(["a@example.test"]);
    expect(state.activeSlot).toBe(0);
  });

  it("removes a stored session whose Auth user was deleted", async () => {
    vi.mocked(clients.get(0)!.auth.getUser).mockResolvedValue({ data: { user: null }, error: { status: 401 } } as never);
    await manager.start();
    expect(manager.getState().accounts).toEqual([]);
    expect(clients.get(0)!.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(localStorage.getItem(slotStorageKey(0))).toBeNull();
  });

  it("does not confuse a re-created account with the old ID sharing its email", async () => {
    await manager.start();
    await manager.completeSignIn(1, session("new-id", "A@example.test"));
    expect(manager.getState().accounts.map(a => a.userId)).toEqual(["new-id"]);
    expect(manager.getState().activeSlot).toBe(1);
    expect(clients.get(0)!.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("accepts a re-created account without mistaking its own old-identity cleanup for an external switch", async () => {
    await manager.start();
    const generation = manager.getState().generation;
    await manager.completeSignIn(1, session("new-id", "A@example.test"), () => manager.getState().generation === generation);
    expect(manager.getState().accounts.map(a => a.userId)).toEqual(["new-id"]);
    expect(manager.getState().activeSlot).toBe(1);
  });

  it("abandons a re-created account when an external switch happens during old-identity cleanup", async () => {
    await manager.start();
    await manager.completeSignIn(2, session("other", "other@example.test"));
    manager.activate(0);
    const generation = manager.getState().generation;
    let finish!: () => void;
    vi.mocked(clients.get(0)!.auth.signOut).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ error: null }); }));
    const pending = manager.completeSignIn(1, session("new-id", "A@example.test"), () => manager.getState().generation === generation);
    manager.activate(2);
    finish();
    await expect(pending).rejects.toBeInstanceOf(StaleAccountError);
    expect(manager.getState().accounts.map(a => a.userId)).toEqual(["other"]);
    expect(manager.getState().activeSlot).toBe(2);
  });

  it("retains credentials without granting a session when Auth is temporarily rate limited", async () => {
    vi.mocked(clients.get(0)!.auth.getUser).mockResolvedValue({ data: { user: null }, error: { status: 429 } } as never);
    await manager.start();
    expect(manager.getState().accounts).toEqual([]);
    expect(localStorage.getItem(slotStorageKey(0))).not.toBeNull();
    expect(clients.get(0)!.auth.signOut).not.toHaveBeenCalled();
  });

  it("does not restore a deleted identity from a deferred initial Auth event", async () => {
    vi.mocked(clients.get(0)!.auth.onAuthStateChange).mockImplementation(callback => {
      callback("INITIAL_SESSION", session("u1", "a@example.test"));
      return { data: { subscription: { id: "test", callback, unsubscribe: vi.fn() } } };
    });
    vi.mocked(clients.get(0)!.auth.getUser).mockResolvedValue({ data: { user: null }, error: { status: 401 } } as never);
    await manager.start();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(manager.getState().accounts).toEqual([]);
  });

  it("does not restore a slot after sign-out while another-tab identity is being verified", async () => {
    await manager.start();
    let release!: (value: never) => void;
    vi.mocked(clients.get(0)!.auth.getUser).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const event = vi.mocked(clients.get(0)!.auth.onAuthStateChange).mock.calls[0]![0];
    event("SIGNED_IN", session("u2", "b@example.test"));
    await new Promise(resolve => setTimeout(resolve, 0));
    await manager.signOut(0);
    release({ data: { user: session("u2", "b@example.test").user }, error: null } as never);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(manager.getState().accounts).toEqual([]);
  });

  it("deduplicates restored slots by Auth ID", async () => {
    clients.set(1, fakeClient(session("u1", "a@example.test")));
    localStorage.setItem(slotStorageKey(1), JSON.stringify({ refresh_token: "rt-u1" }));
    await manager.start();
    expect(manager.getState().accounts).toHaveLength(1);
  });

  it("adds a second account in a free slot without touching the first", async () => {
    await manager.start();
    expect(manager.slotForNewSignIn()).toBe(1);
    await manager.completeSignIn(1, session("u2", "b@example.test"));
    const state = manager.getState();
    expect(state.accounts).toHaveLength(2);
    expect(state.activeSlot).toBe(1);
    expect(clients.get(0)!.auth.signOut).not.toHaveBeenCalled();
  });

  it("keeps one copy when the same person signs in twice", async () => {
    await manager.start();
    const slot = await manager.completeSignIn(1, session("u1", "a@example.test"));
    expect(slot).toBe(0);
    expect(manager.getState().accounts).toHaveLength(1);
    expect(clients.get(1)!.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("bumps the generation on every switch so late responses can be rejected", async () => {
    await manager.start();
    await manager.completeSignIn(1, session("u2", "b@example.test"));
    const before = manager.getState().generation;
    manager.activate(0);
    expect(manager.getState().generation).toBe(before + 1);
    expect(sessionStorage.getItem("tf.auth.active-slot")).toBe("0");
  });

  it("signing out the active account falls back to a remaining one", async () => {
    await manager.start();
    await manager.completeSignIn(1, session("u2", "b@example.test"));
    await manager.signOut(1);
    const state = manager.getState();
    expect(state.accounts.map((a) => a.userId)).toEqual(["u1"]);
    expect(state.activeSlot).toBe(0);
    expect(clients.get(0)!.auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a fourth account", async () => {
    await manager.start();
    await manager.completeSignIn(1, session("u2", "b@example.test"));
    await manager.completeSignIn(2, session("u3", "c@example.test"));
    expect(manager.slotForNewSignIn()).toBeNull();
  });

  it("uses the slot's own client for tokens and refresh", async () => {
    await manager.start();
    await manager.accessToken(0, true);
    expect(clients.get(0)!.auth.refreshSession).toHaveBeenCalledOnce();
    expect(clients.get(1)!.auth.refreshSession).not.toHaveBeenCalled();
  });

  it("invalidates in-flight work when a sign-in replaces the active slot", async () => {
    await manager.start();
    const generation = manager.getState().generation;
    await manager.completeSignIn(0, session("u2", "b@example.test"));
    expect(manager.getState().generation).toBe(generation + 1);
    expect(manager.getState().accounts[0]!.userId).toBe("u2");
  });

  it("invalidates a replaced active identity from another tab but preserves ordinary refreshes", async () => {
    await manager.start();
    const generation = manager.getState().generation;
    const event = vi.mocked(clients.get(0)!.auth.onAuthStateChange).mock.calls[0]![0];
    event("TOKEN_REFRESHED", session("u1", "a@example.test"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(manager.getState().generation).toBe(generation);
    vi.mocked(clients.get(0)!.auth.getUser).mockResolvedValue({ data: { user: session("u2", "b@example.test").user }, error: null });
    event("SIGNED_IN", session("u2", "b@example.test"));
    await vi.waitFor(() => expect(manager.getState().accounts[0]!.userId).toBe("u2"));
    expect(manager.getState().generation).toBe(generation + 1);
  });

  it("shares concurrent refresh work within a slot without sharing tokens across slots", async () => {
    await manager.start();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(clients.get(0)!.auth.refreshSession).mockImplementation(async () => {
      await pending;
      return { data: { session: session("u1", "a@example.test"), user: null }, error: null };
    });
    const first = manager.accessToken(0, true);
    const second = manager.accessToken(0, true);
    expect(await manager.accessToken(1, true)).toBeNull();
    release();
    expect(await Promise.all([first, second])).toEqual(["at-u1", "at-u1"]);
    expect(clients.get(0)!.auth.refreshSession).toHaveBeenCalledTimes(1);
    await manager.accessToken(0, true);
    expect(clients.get(0)!.auth.refreshSession).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("rejects a replacement identity before its deferred auth event (refresh: %s)", async forceRefresh => {
    await manager.start();
    const replacement = session("u2", "b@example.test");
    vi.mocked(clients.get(0)!.auth.getSession).mockResolvedValue({ data: { session: replacement }, error: null });
    vi.mocked(clients.get(0)!.auth.refreshSession).mockResolvedValue({ data: { session: replacement, user: replacement.user }, error: null });
    await expect(manager.accessToken(0, forceRefresh, "u1")).rejects.toBeInstanceOf(StaleAccountError);
  });
});
