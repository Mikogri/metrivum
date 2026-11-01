import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mock = vi.hoisted(() => ({
  accountKey: "0:one", generation: 1,
  api: vi.fn(async ({ path }: { path: string }) => ({ data: path.endsWith("unread-count") ? { count: 3 } : { items: [], total: 0 } })),
  hubs: [] as Array<{ events: Record<string, (event?: { conversationId: string; userId?: string; typing?: boolean; expiresAt?: string }) => void>; reconnecting: () => void; reconnected: () => void; close: () => void }>,
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
import { historyPollingInterval } from "./model";

it('disables redundant history polling only for a healthy socket and retains offline recovery', () => {
  expect(historyPollingInterval('Live')).toBe(false);
  for (const status of ['Connecting', 'Reconnecting', 'Offline', 'Preview']) expect(historyPollingInterval(status)).toBe(15000);
});

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

it("caches conversation pages per account and skips an inactive list", async () => {
  const path = "/api/v1/messaging/conversations";
  const { rerender } = renderHook(({ page, enabled }) => useChatQuery(path, { page, limit: 25, search: "" }, enabled), {
    wrapper, initialProps: { page: 1, enabled: true },
  });
  await tick();
  expect(cache.getQueryData(["0:one", "messaging", path, { page: 1, limit: 25, search: "" }])).toBeDefined();
  rerender({ page: 2, enabled: true }); await tick();
  expect(cache.getQueryData(["0:one", "messaging", path, { page: 2, limit: 25, search: "" }])).toBeDefined();
  mock.accountKey = "0:two";
  rerender({ page: 1, enabled: true }); await tick();
  expect(cache.getQueryData(["0:two", "messaging", path, { page: 1, limit: 25, search: "" }])).toBeDefined();
  mock.api.mockClear();
  rerender({ page: 3, enabled: false }); await tick(60000);
  expect(calls("/conversations")).toBe(0);
});

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

it("acknowledges direct navigation with the bell closed, and observes later arrivals", async () => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const { rerender } = renderHook(({ target }) => useDurableNotifications(null, false, target), { wrapper, initialProps: { target: "/app/invitations/one" } });
  await tick();
  expect(calls("read-target")).toBe(1);
  expect(mock.api).toHaveBeenCalledWith(expect.objectContaining({ method: "POST", json: { target: "/app/invitations/one" } }));
  expect(calls("/notifications")).toBe(0);
  rerender({ target: "/app/invitations/two?from=chat" }); await tick();
  expect(calls("read-target")).toBe(2);
  await tick(6000);
  act(() => mock.hubs[0]!.events.NotificationCreated!()); await tick();
  expect(calls("read-target")).toBe(3);
  vi.restoreAllMocks();
});

it("does not acknowledge a destination in a hidden tab, then catches up on visibility", async () => {
  const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  renderHook(() => useDurableNotifications(null, false, "/app/invitations/one"), { wrapper }); await tick();
  expect(calls("read-target")).toBe(0);
  visible.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange"))); await tick();
  expect(calls("read-target")).toBe(1);
  vi.restoreAllMocks();
});

it("refreshes only the changed conversation and summaries, while reconnect reconciles every conversation", async () => {
  renderHook(() => useRealtime(true), { wrapper }); await tick();
  const affected = ["0:one", "messaging", "history", "one"];
  const unrelated = ["0:one", "messaging", "history", "two"];
  const details = ["0:one", "messaging", "/api/v1/messaging/conversations/one"];
  const summaries = ["0:one", "messaging", "/api/v1/messaging/conversations", { search: "" }];
  for (const key of [affected, unrelated, details, summaries]) cache.setQueryData(key, { items: [] });
  act(() => mock.hubs[0]!.events.MembershipChanged!({ conversationId: "one" })); await tick();
  expect(cache.getQueryState(affected)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(details)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(summaries)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(unrelated)?.isInvalidated).toBe(false);
  act(() => mock.hubs[0]!.reconnected()); await tick();
  expect(cache.getQueryState(unrelated)?.isInvalidated).toBe(true);
});

it("does not rerender the messaging provider every second when nobody is typing", async () => {
  let renders = 0;
  renderHook(() => { renders++; return useRealtime(true); }, { wrapper }); await tick();
  const initial = renders;
  await tick(5000);
  expect(renders).toBe(initial);
});

it("refetches the summary and changed details without requesting another open conversation", async () => {
  renderHook(() => {
    useRealtime(true);
    useChatQuery("/api/v1/messaging/conversations");
    useChatQuery("/api/v1/messaging/conversations/one");
    useChatQuery("/api/v1/messaging/conversations/two");
  }, { wrapper }); await tick(); mock.api.mockClear();
  act(() => mock.hubs[0]!.events.ConversationUpdated!({ conversationId: "one" })); await tick();
  expect(calls("/conversations")).toBe(1);
  expect(calls("/conversations/one")).toBe(1);
  expect(calls("/conversations/two")).toBe(0);
});

it("still expires typing indicators and ignores events from a previous account", async () => {
  const { result } = renderHook(() => useRealtime(true), { wrapper }); await tick();
  act(() => mock.hubs[0]!.events.TypingChanged!({ conversationId: "one", userId: "other", typing: true, expiresAt: new Date(Date.now() + 2000).toISOString() }));
  expect(result.current.typing.one).toHaveLength(1);
  await tick(3000);
  expect(result.current.typing.one).toBeUndefined();
  mock.generation++;
  act(() => mock.hubs[0]!.events.TypingChanged!({ conversationId: "one", userId: "other", typing: true, expiresAt: new Date(Date.now() + 5000).toISOString() }));
  expect(result.current.typing.one).toBeUndefined();
});
