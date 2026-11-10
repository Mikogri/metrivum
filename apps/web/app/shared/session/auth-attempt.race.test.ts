import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { BroadcastChannel as NodeBroadcastChannel } from "node:worker_threads";
import { afterEach, expect, it, vi } from "vitest";
import { SessionManager } from "./manager";
import { slotStorageKey, type SlotId } from "./storage-keys";

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture(holdPrimaryRefresh = false) {
  const ids = {
    a: "11111111-1111-4111-8111-111111111111",
    b: "22222222-2222-4222-8222-222222222222",
    c: "33333333-3333-4333-8333-333333333333",
    d: "44444444-4444-4444-8444-444444444444",
  };
  const user = (name: keyof typeof ids) => ({
    id: ids[name],
    email: `${name}@example.test`,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    email_confirmed_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  });
  const token = (name: keyof typeof ids) =>
    `${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ sub: ids[name], email: `${name}@example.test`, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshRequestStarted!: () => void;
  const refreshStarted = new Promise<void>((resolve) => {
    refreshRequestStarted = resolve;
  });
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    let name: keyof typeof ids = "a";
    if (url.endsWith("/challenge"))
      return new Response(
        JSON.stringify({
          id: "challenge",
          expires_at: Math.floor(Date.now() / 1000) + 1000,
        }),
        { headers: { "content-type": "application/json" } },
      );
    if (
      url.includes("/token?") ||
      url.endsWith("/signup") ||
      url.endsWith("/verify")
    ) {
      const body = JSON.parse(String(init?.body));
      name =
        body.email?.[0] ??
        (url.includes("/factors/") || body.refresh_token ? "a" : "c");
      if (body.refresh_token && holdPrimaryRefresh) {
        refreshRequestStarted();
        await refreshGate;
      } else if (
        name === "c" ||
        url.includes("/factors/") ||
        body.refresh_token
      ) {
        requestStarted();
        await gate;
      }
      return new Response(
        JSON.stringify({
          access_token: token(name),
          refresh_token: `refresh-${name}`,
          token_type: "bearer",
          expires_in: 3600,
          user: user(name),
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/user"))
      name = JSON.parse(
        atob(new Headers(init?.headers).get("authorization")!.split(".")[1]!),
      ).email[0];
    return new Response(JSON.stringify(user(name)), {
      headers: { "content-type": "application/json" },
    });
  };
  const clients = new Map<SlotId, SupabaseClient>();
  const clientFor = (slot: SlotId) => {
    let client = clients.get(slot);
    if (!client) {
      client = createClient("http://auth.test", "public", {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: slotStorageKey(slot),
        },
        global: { fetch: fakeFetch },
      });
      clients.set(slot, client);
    }
    return client;
  };
  const manager = new SessionManager(clientFor);
  vi.stubEnv("VITE_SUPABASE_URL", "http://auth.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public");
  vi.stubGlobal("fetch", fakeFetch);
  await manager.start();
  for (const [slot, name] of [
    [0, "a"],
    [1, "b"],
  ] as const) {
    const result = await manager.client(slot).auth.signInWithPassword({
      email: `${name}@example.test`,
      password: "test",
    });
    await manager.completeSignIn(slot, result.data.session!);
  }
  manager.activate(0);
  localStorage.setItem(
    `${slotStorageKey(0)}-code-verifier`,
    JSON.stringify("initiated-verifier"),
  );
  return {
    manager,
    ids,
    release,
    clients,
    started,
    refreshStarted,
    releaseRefresh,
  };
}

const operations = [
  "password",
  "signup",
  "otp",
  "pkce",
  "mfa",
  "refresh",
] as const;
async function authenticate(
  client: SupabaseClient,
  operation: (typeof operations)[number],
): Promise<Session | null> {
  const result =
    operation === "password"
      ? await client.auth.signInWithPassword({
          email: "c@example.test",
          password: "test",
        })
      : operation === "signup"
        ? await client.auth.signUp({
            email: "c@example.test",
            password: "test",
          })
        : operation === "otp"
          ? await client.auth.verifyOtp({
              email: "c@example.test",
              token: "123456",
              type: "email",
            })
          : operation === "pkce"
            ? await client.auth.exchangeCodeForSession("initiated-code")
            : operation === "refresh"
              ? await client.auth.refreshSession({ refresh_token: "refresh-a" })
              : await client.auth.mfa.challengeAndVerify({
                  factorId: "factor",
                  code: "123456",
                });
  if (result.error) throw result.error;
  return "session" in result.data
    ? result.data.session
    : (await client.auth.getSession()).data.session;
}

it.each(operations)(
  "does not persist or emit a successful %s response after its account generation changes",
  async (operation) => {
    const { manager, ids, release, clients, started } = await fixture();
    const generation = manager.getState().generation;
    const authenticated = operation === "mfa" || operation === "refresh";
    const candidate = manager.client(
      0,
      () => manager.getState().generation === generation,
      authenticated ? { userId: ids.a } : { email: "c@example.test" },
    );
    const events: string[] = [];
    candidate.auth.onAuthStateChange((event) => {
      events.push(event);
    });
    const pending = authenticate(candidate, operation);
    await started;
    events.length = 0;
    manager.activate(1);
    release();
    await expect(pending).rejects.toMatchObject({ name: "StaleAccountError" });
    await candidate.auth.dispose();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(manager.getState().activeSlot).toBe(1);
    expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
      ids.a,
    );
    expect(
      manager.getState().accounts.find((account) => account.slot === 0)?.userId,
    ).toBe(ids.a);
    expect(events).not.toContain("SIGNED_IN");
    expect(events).not.toContain("PASSWORD_RECOVERY");
    await Promise.all(
      [...clients.values()].map((client) => client.auth.dispose()),
    );
  },
);

it.each(operations)(
  "persists a current %s candidate, preserving the session after disposal",
  async (operation) => {
    const { manager, ids, release, clients } = await fixture();
    const generation = manager.getState().generation;
    const current = () => manager.getState().generation === generation;
    const authenticated = operation === "mfa" || operation === "refresh";
    const expected = authenticated ? ids.a : ids.c;
    const candidate = manager.client(
      0,
      current,
      authenticated ? { userId: ids.a } : { email: "c@example.test" },
    );
    const pending = authenticate(candidate, operation);
    release();
    const result = await pending;
    expect(result?.user.id).toBe(expected);
    expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
      expected,
    );
    await manager.completeSignIn(0, result!, current);
    await candidate.auth.dispose();
    expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
      expected,
    );
    expect(manager.getState().activeSlot).toBe(0);
    expect(
      (await manager.client(0).auth.getSession()).data.session?.user.id,
    ).toBe(expected);
    await Promise.all(
      [...clients.values()].map((client) => client.auth.dispose()),
    );
  },
);

it("rejects a substituted callback identity before it reaches storage or subscribers", async () => {
  const { manager, ids, release, clients } = await fixture();
  const candidate = manager.client(0, () => true, { email: "a@example.test" });
  const events: string[] = [];
  candidate.auth.onAuthStateChange((event) => {
    events.push(event);
  });
  const pending = authenticate(candidate, "otp");
  release();
  await expect(pending).rejects.toMatchObject({ name: "StaleAccountError" });
  await candidate.auth.dispose();
  expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
    ids.a,
  );
  expect(events).not.toContain("SIGNED_IN");
  await Promise.all(
    [...clients.values()].map((client) => client.auth.dispose()),
  );
});

it("does not let an older primary-client refresh overwrite an accepted candidate identity", async () => {
  const { manager, ids, release, clients, refreshStarted, releaseRefresh } =
    await fixture(true);
  const oldRefresh = manager
    .client(0)
    .auth.refreshSession({ refresh_token: "refresh-a" });
  await refreshStarted;
  const candidate = manager.client(0, () => true, { email: "c@example.test" });
  const pending = authenticate(candidate, "password");
  release();
  const accepted = await pending;
  await manager.completeSignIn(0, accepted!);
  await candidate.auth.dispose();
  releaseRefresh();
  const discarded = await oldRefresh;
  expect(discarded.error).not.toBeNull();
  expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
    ids.c,
  );
  expect(
    (await manager.client(0).auth.getSession()).data.session?.user.id,
  ).toBe(ids.c);
  expect(manager.getState().accounts.find((a) => a.slot === 0)?.userId).toBe(
    ids.c,
  );
  await Promise.all(
    [...clients.values()].map((client) => client.auth.dispose()),
  );
});

it.each([true, false])(
  "forwards only accepted candidate sessions through the real BroadcastChannel (stale=%s)",
  async (stale) => {
    vi.stubGlobal("BroadcastChannel", NodeBroadcastChannel);
    const { manager, ids, release, clients, started } = await fixture();
    const generation = manager.getState().generation;
    const candidate = manager.client(
      0,
      () => manager.getState().generation === generation,
      { email: "c@example.test" },
    );
    const observer = new NodeBroadcastChannel(slotStorageKey(0));
    const events: string[] = [];
    observer.onmessage = (event) => {
      events.push((event.data as { event: string }).event);
    };
    const pending = authenticate(candidate, "password");
    await started;
    if (stale) manager.activate(1);
    release();
    if (stale)
      await expect(pending).rejects.toMatchObject({
        name: "StaleAccountError",
      });
    else await pending;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events.includes("SIGNED_IN")).toBe(!stale);
    expect(manager.getState().accounts.find((a) => a.slot === 0)?.userId).toBe(
      stale ? ids.a : ids.c,
    );
    await candidate.auth.dispose();
    observer.close();
    await Promise.all(
      [...clients.values()].map((client) => client.auth.dispose()),
    );
  },
);

it("rejects a late candidate after another tab replaces that slot, even before its auth event is delivered", async () => {
  const { manager, ids, release, clients, started } = await fixture();
  const earlier = manager.client(0, () => true, { email: "c@example.test" });
  const pending = authenticate(earlier, "password");
  await started;
  const winner = manager.client(0, () => true, { email: "d@example.test" });
  await winner.auth.signInWithPassword({
    email: "d@example.test",
    password: "test",
  });
  release();
  await expect(pending).rejects.toMatchObject({ name: "StaleAccountError" });
  expect(JSON.parse(localStorage.getItem(slotStorageKey(0))!).user.id).toBe(
    ids.d,
  );
  await Promise.all([
    earlier.auth.dispose(),
    winner.auth.dispose(),
    ...[...clients.values()].map((client) => client.auth.dispose()),
  ]);
});
