import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type * as UiWeb from "@metrivum/ui-web";
import Messages from "./messages";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ query: { search: string }; pageSize: number; pages: number; enabled: boolean }>,
  total: 40,
  observers: [] as Array<(entries: Array<{ isIntersecting: boolean }>) => void>,
}));
vi.mock("@metrivum/ui-web", async (original) => ({ ...await original<typeof UiWeb>(), useMobileLayout: () => true }));
vi.mock("~/shared/access", () => ({ useFeatureAccess: () => ({ allowed: true, pending: false }) }));
vi.mock("~/shared/session", () => ({ useAccountContext: () => ({ account: { userId: "self" }, accountKey: "self", api: vi.fn(), lifecycle: { isCurrent: () => true } }), useApi: () => vi.fn(), useUnsavedWorkGuard: vi.fn() }));
vi.mock("./provider", () => ({ useMessagingRealtime: () => ({ typing: [] }) }));
vi.mock("./dialogs", () => ({ BlockedPeople: () => <p>Blocked people list</p>, NewConversation: () => null, GroupMembers: () => null }));
vi.mock("./api", () => ({
  root: "/api/v1/messaging", cacheMessage: vi.fn(),
  useChatQuery: () => ({ isPending: true }),
  useChatPages: (_path: string, query: { search: string }, pageSize: number, pages: number, enabled = true) => {
    state.calls.push({ query, pageSize, pages, enabled });
    const count = Math.min(state.total, pageSize * pages);
    return {
      items: Array.from({ length: count }, (_, i) => ({ id: `chat-${i}`, title: `Chat ${i}`, type: "Direct", unreadCount: 0, membershipState: "Active" })),
      isPending: false, isError: false, error: null, refetch: () => undefined, isLoadingMore: false, hasMore: count < state.total,
    };
  },
}));
// The list's end marker: tests decide when it scrolls into view.
class FakeObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) { state.observers.push(callback); }
  observe() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeObserver);

beforeEach(() => { state.calls = []; state.total = 40; state.observers = []; });
function setup(url = "/app/messages") {
  const router = createMemoryRouter([{ path: "/app/messages", Component: Messages }], { initialEntries: [url] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const reachEnd = async () => { await act(async () => { state.observers.at(-1)?.([{ isIntersecting: true }]); }); };

it("loads 15 conversations first and the next 15 each time the end of the list is reached", async () => {
  setup();
  expect(state.calls.at(-1)).toEqual({ query: { search: "" }, pageSize: 15, pages: 1, enabled: true });
  expect(screen.getAllByRole("button", { name: /^Chat \d+/ })).toHaveLength(15);
  await reachEnd();
  expect(state.calls.at(-1)?.pages).toBe(2);
  expect(screen.getAllByRole("button", { name: /^Chat \d+/ })).toHaveLength(30);
  await reachEnd();
  expect(screen.getAllByRole("button", { name: /^Chat \d+/ })).toHaveLength(40);
  // Everything is loaded: the end of the list is no longer watched, so nothing more is requested.
  const watching = state.observers.length;
  await act(async () => { fireEvent.scroll(window); });
  expect(state.observers).toHaveLength(watching);
  expect(state.calls.at(-1)?.pages).toBe(3);
  expect(screen.queryByRole("navigation", { name: "Conversation pages" })).not.toBeInTheDocument();
});

it("starts again from the first 15 when the debounced search changes and keeps the selected thread", async () => {
  const router = setup("/app/messages?conversation=selected");
  await reachEnd();
  expect(router.state.location.search).toBe("?conversation=selected");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "Alex" } });
  await waitFor(() => expect(state.calls.at(-1)).toEqual({ query: { search: "Alex" }, pageSize: 15, pages: 1, enabled: true }));
  expect(router.state.location.search).toBe("?conversation=selected");
});

it("disables the conversation list while Blocked is active", () => {
  setup("/app/messages?tab=blocked");
  expect(state.calls.at(-1)?.enabled).toBe(false);
  expect(screen.queryByRole("searchbox", { name: "Search conversations" })).not.toBeInTheDocument();
});

it("returns to the first 15 conversations when opening Chats again", async () => {
  setup();
  await reachEnd();
  await act(async () => { screen.getByRole("radio", { name: "Blocked" }).click(); });
  expect(state.calls.at(-1)?.enabled).toBe(false);
  await act(async () => { screen.getByRole("radio", { name: "Chats" }).click(); });
  expect(state.calls.at(-1)).toEqual({ query: { search: "" }, pageSize: 15, pages: 1, enabled: true });
});
