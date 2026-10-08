import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mock = vi.hoisted(() => ({
  accountKey: "0:one", generation: 1,
  api: vi.fn(async ({ path }: { path: string }) => ({ data: path.endsWith("unread-count") ? { count: 3 } : { items: [], total: 0 } })),
  hubs: [] as Array<{ events: Record<string, () => void>; reconnecting: () => void; reconnected: () => void; close: () => void }>,
}));
const manager = { getState: () => ({ activeSlot: "0", generation: mock.generation }), accessToken: async () => "token" };
const lifecycles = new Map<number, { isCurrent: () => boolean; signal: () => AbortSignal; accessToken: () => Promise<string> }>();
function lifecycle() {
  const generation = mock.generation;
  if (!lifecycles.has(generation)) {
    const controller = new AbortController();
    lifecycles.set(generation, { isCurrent: () => mock.generation === generation, signal: () => controller.signal, accessToken: async () => "token" });
  }
  return lifecycles.get(generation)!;
}
vi.mock("~/shared/session", () => ({
  useApi: () => mock.api, useAccountKey: () => mock.accountKey,
  useAccountContext: () => ({ account: { slot: "0", userId: "one" }, accountKey: mock.accountKey, lifecycle: lifecycle() }),
  useSessionManager: () => manager,
}));
vi.mock("~/shared/dev/mockMode", () => ({ MOCK_MODE: false }));
vi.mock("~/shared/http", () => ({ apiBaseUrl: () => "https://api.test" }));
vi.mock("@microsoft/signalr", () => ({
  LogLevel: { None: 6, Error: 4 },
  HubConnectionBuilder: class {
    withUrl() { return this; } configureLogging() { return this; } withAutomaticReconnect() { return this; }
    build() {
      const hub = { events: {} as Record<string, () => void>, reconnecting: () => {}, reconnected: () => {}, close: () => {} };
      mock.hubs.push(hub);
      return {
        on: (name: string, handler: () => void) => { hub.events[name] = handler; },
        onreconnecting: (handler: () => void) => { hub.reconnecting = handler; },
        onreconnected: (handler: () => void) => { hub.reconnected = handler; },
        onclose: (handler: () => void) => { hub.close = handler; },
        start: async () => {}, stop: async () => {},
      };
    }
  },
}));
import { useDurableNotifications } from "./durable-notifications";
import { MessagingPollingContext, useChatQuery, useRealtime } from "./api";

let cache: QueryClient;
beforeEach(() => {
  vi.useFakeTimers(); mock.api.mockClear(); mock.hubs = []; mock.accountKey = "0:one"; mock.generation = 1;
  lifecycles.clear();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { cache.clear(); vi.useRealTimers(); });
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={cache}>{children}</QueryClientProvider>; }
async function tick(ms = 1) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
const calls = (suffix: string) => mock.api.mock.calls.filter(([request]) => request.path.endsWith(suffix)).length;

it("keeps the bell count live without downloading its closed list or preferences", async () => {
  const { result, rerender } = renderHook(({ open }) => useDurableNotifications("active", open), { wrapper, initialProps: { open: false } });
  await tick();
  expect(result.current.count).toBe(3);
  expect(calls("/notifications")).toBe(0);
  expect(calls("notification-preferences")).toBe(0);
  rerender({ open: true }); await tick();
  expect(calls("/notifications")).toBe(1);
  expect(calls("notification-preferences")).toBe(1);
  rerender({ open: false }); await tick(60000);
  expect(calls("/notifications")).toBe(1);
});

it("reduces connected notification polling, restores fallback and catches up on reconnect", async () => {
  renderHook(() => useDurableNotifications(null, false), { wrapper }); await tick();
  mock.api.mockClear();
  await tick(15000); expect(calls("unread-count")).toBe(0);
  act(() => mock.hubs[0]!.reconnecting());
  await tick(15000); expect(calls("unread-count")).toBe(1);
  act(() => mock.hubs[0]!.reconnected()); await tick();
  expect(calls("unread-count")).toBe(2);
  await tick(60000); expect(calls("unread-count")).toBe(3);
});

it("adapts messaging summaries to their connection and refreshes on reconnect", async () => {
  renderHook(() => {
    const realtime = useRealtime(true);
    return useChatQuery("/api/v1/messaging/conversations", undefined, true, realtime.status === "Live" ? 60000 : 15000);
  }, { wrapper }); await tick(); mock.api.mockClear();
  await tick(15000); expect(calls("/conversations")).toBe(0);
  act(() => mock.hubs[0]!.reconnecting()); await tick(15000);
  expect(calls("/conversations")).toBe(1);
  act(() => mock.hubs[0]!.reconnected()); await tick();
  expect(calls("/conversations")).toBe(2);
});

it("uses the shared live interval for descendants but keeps unrelated endpoints on fallback polling", async () => {
  const liveWrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}><MessagingPollingContext.Provider value={60000}>{children}</MessagingPollingContext.Provider></QueryClientProvider>;
  renderHook(() => {
    useChatQuery("/api/v1/messaging/conversations");
    useChatQuery("/api/v1/coaching/my-invitations");
  }, { wrapper: liveWrapper });
  await tick(); mock.api.mockClear(); await tick(15000);
  expect(calls("/conversations")).toBe(0);
  expect(calls("my-invitations")).toBe(1);
});

it("ignores stale account notification events and refetches the new account count", async () => {
  const { rerender } = renderHook(() => useDurableNotifications(null, false), { wrapper });
  await tick(); const oldHub = mock.hubs[0]!;
  mock.accountKey = "0:two"; mock.generation++;
  rerender(); await tick();
  expect(cache.getQueryData(["0:two", "notifications", "count", null])).toEqual({ count: 3 });
  mock.api.mockClear();
  act(() => { oldHub.events.NotificationCreated!(); oldHub.reconnected(); }); await tick();
  expect(mock.api).not.toHaveBeenCalled();
});

it("does not refetch notification preferences for incoming notifications", async () => {
  renderHook(() => useDurableNotifications(null, true), { wrapper }); await tick(); mock.api.mockClear();
  act(() => mock.hubs[0]!.events.NotificationCreated!()); await tick();
  expect(calls("unread-count")).toBe(1);
  expect(calls("/notifications")).toBe(1);
  expect(calls("notification-preferences")).toBe(0);
});
