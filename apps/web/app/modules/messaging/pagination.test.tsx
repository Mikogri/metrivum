import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type * as UiWeb from "@trainflow/ui-web";
import Messages from "./messages";

const state = vi.hoisted(() => ({
  queries: [] as Array<{ query: { page: number; limit: number; search: string }; enabled: boolean }>,
}));
vi.mock("@trainflow/ui-web", async (original) => ({ ...await original<typeof UiWeb>(), useMobileLayout: () => true }));
vi.mock("~/shared/access", () => ({ useFeatureAccess: () => ({ allowed: true, pending: false }) }));
vi.mock("~/shared/session", () => ({ useAccountContext: () => ({ account: { userId: "self" }, accountKey: "self", api: vi.fn(), lifecycle: { isCurrent: () => true } }), useApi: () => vi.fn(), useUnsavedWorkGuard: vi.fn() }));
vi.mock("./provider", () => ({ useMessagingRealtime: () => ({ typing: [] }) }));
vi.mock("./dialogs", () => ({ BlockedPeople: () => <p>Blocked people list</p>, NewConversation: () => null, GroupMembers: () => null }));
vi.mock("./api", () => ({
  root: "/api/v1/messaging", cacheMessage: vi.fn(),
  useChatQuery: (path: string, query: { page: number; limit: number; search: string }, enabled = true) => {
    if (!path.endsWith("/conversations")) return { isPending: true };
    state.queries.push({ query, enabled });
    return { data: query.page === 1 ? Array.from({ length: 25 }, (_, i) => ({ id: `chat-${i}`, title: `Chat ${i}`, type: "Direct", unreadCount: 0, membershipState: "Active" })) : [], isFetching: false };
  },
}));

beforeEach(() => { state.queries = []; });
function setup(url = "/app/messages") {
  const router = createMemoryRouter([{ path: "/app/messages", Component: Messages }], { initialEntries: [url] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

it("requests server pages of 25 and retains Previous after the final empty page", async () => {
  setup();
  expect(state.queries.at(-1)).toEqual({ query: { page: 1, limit: 25, search: "" }, enabled: true });
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await act(async () => { screen.getByRole("button", { name: "Next" }).click(); });
  expect(state.queries.at(-1)?.query.page).toBe(2);
  expect(screen.getByText("No more conversations.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
  await act(async () => { screen.getByRole("button", { name: "Previous" }).click(); });
  expect(state.queries.at(-1)?.query.page).toBe(1);
});

it("resets paging when the debounced search changes and keeps the selected thread", async () => {
  const router = setup("/app/messages?conversation=selected");
  await act(async () => { screen.getByRole("button", { name: "Next" }).click(); });
  expect(router.state.location.search).toBe("?conversation=selected");
  fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), { target: { value: "Alex" } });
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await waitFor(() => expect(state.queries.at(-1)).toEqual({ query: { page: 1, limit: 25, search: "Alex" }, enabled: true }));
  expect(router.state.location.search).toBe("?conversation=selected");
});

it("disables the conversation list while Blocked is active", () => {
  setup("/app/messages?tab=blocked");
  expect(state.queries.at(-1)?.enabled).toBe(false);
  expect(screen.queryByRole("searchbox", { name: "Search conversations" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Conversation pages" })).not.toBeInTheDocument();
});

it("returns to the first conversation page when opening Chats again", async () => {
  setup();
  await act(async () => { screen.getByRole("button", { name: "Next" }).click(); });
  await act(async () => { screen.getByRole("radio", { name: "Blocked" }).click(); });
  expect(state.queries.at(-1)?.enabled).toBe(false);
  await act(async () => { screen.getByRole("radio", { name: "Chats" }).click(); });
  expect(state.queries.at(-1)).toEqual({ query: { page: 1, limit: 25, search: "" }, enabled: true });
});
