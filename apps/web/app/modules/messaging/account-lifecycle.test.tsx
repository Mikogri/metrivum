import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { AccountScope } from "~/shared/session/AccountScope";
import { SessionProvider } from "~/shared/session/SessionProvider";
import { SessionManager } from "~/shared/session/manager";
import { slotStorageKey } from "~/shared/session/storage-keys";
import { useRealtime } from "./api";
import { useDurableNotifications } from "./durable-notifications";
import { StaleAccountError } from "~/shared/http/errors";

const hubs = vi.hoisted(() => [] as Array<{ token: () => Promise<string>; stop: ReturnType<typeof vi.fn>; start: () => void }>);
vi.mock("@microsoft/signalr", () => ({
  LogLevel: { None: 6, Error: 4 },
  HubConnectionBuilder: class {
    token!: () => Promise<string>;
    withUrl(_url: string, options: { accessTokenFactory: () => Promise<string> }) { this.token = options.accessTokenFactory; return this; }
    configureLogging() { return this; }
    withAutomaticReconnect() { return this; }
    build() {
      let start!: () => void;
      const started = new Promise<void>(resolve => { start = resolve; });
      const hub = { token: this.token, stop: vi.fn(async () => {}), start };
      hubs.push(hub);
      return { on() {}, onreconnecting() {}, onreconnected() {}, onclose() {}, start: () => started, stop: hub.stop };
    }
  },
}));

vi.mock("~/shared/dev/mockMode", () => ({ MOCK_MODE: false }));
vi.mock("~/shared/http/config", () => ({ apiBaseUrl: () => "https://api.example.test" }));

afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); hubs.length = 0; });

function Connections() { useRealtime(true); useDurableNotifications(null, false); return null; }

it.each(["switch", "unmount"])("aborts both hubs and rejects their pending tokens on %s", async (leave) => {
  const session = { access_token: "token", user: { id: "coach" } } as Session;
  let release!: (value: { data: { session: Session } }) => void;
  const getSession = vi.fn(async () => ({ data: { session } }));
  // The session manager also confirms the signed-in user is still valid.
  const client = { auth: { getSession, getUser: vi.fn(async () => ({ data: { user: session.user }, error: null })), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } as unknown as SupabaseClient;
  localStorage.setItem(slotStorageKey(0), "stored");
  const manager = new SessionManager(() => client);
  await manager.start();
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('{"count":0}', { status: 200 }));
  vi.stubGlobal("fetch", fetchImpl);
  const view = () => <QueryClientProvider client={cache}><SessionProvider manager={manager}>
    <AccountScope key={manager.getState().generation} account={manager.getState().accounts.find(a => a.slot === manager.getState().activeSlot)!} generation={manager.getState().generation}><Connections /></AccountScope>
  </SessionProvider></QueryClientProvider>;
  const { unmount, rerender } = render(view());
  await waitFor(() => expect(hubs).toHaveLength(2));
  await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
  const requestSignal = fetchImpl.mock.calls[0]![1]!.signal!;
  const delayed = new Promise<{ data: { session: Session } }>(resolve => { release = resolve; });
  getSession.mockImplementation(() => delayed);
  const pending = hubs.map(hub => hub.token());
  const rejected = pending.map(token => expect(token).rejects.toBeInstanceOf(StaleAccountError));
  act(() => { if (leave === "switch") manager.activate(1); else unmount(); });
  expect(requestSignal.aborted).toBe(true);
  release({ data: { session } });
  await Promise.all(rejected);
  for (const hub of hubs) expect(hub.stop).toHaveBeenCalled();
  await act(async () => { for (const hub of hubs) hub.start(); });
  for (const hub of hubs) expect(hub.stop.mock.calls.length).toBeGreaterThanOrEqual(2);
  if (leave === "switch") {
    const nextSession = { access_token: "new-token", user: { id: "athlete" } } as Session;
    getSession.mockResolvedValue({ data: { session: nextSession } });
    await act(async () => { await manager.completeSignIn(1, nextSession); });
    rerender(view());
    expect(hubs).toHaveLength(4);
    expect(await hubs[2]!.token()).toBe("new-token");
    expect(await hubs[3]!.token()).toBe("new-token");
    await expect(hubs[0]!.token()).rejects.toBeInstanceOf(StaleAccountError);
    await expect(hubs[1]!.token()).rejects.toBeInstanceOf(StaleAccountError);
  }
  unmount(); cache.clear();
});
