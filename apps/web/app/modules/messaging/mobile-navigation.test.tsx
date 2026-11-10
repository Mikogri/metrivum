import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import type * as UiWeb from "@metrivum/ui-web";
import Messages from "./messages";

const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("@metrivum/ui-web", async (original) => ({
  ...(await original<typeof UiWeb>()),
  useMobileLayout: () => state.mobile,
}));
vi.mock("~/shared/access", () => ({
  useFeatureAccess: () => ({ allowed: true, pending: false }),
}));
vi.mock("~/shared/session", () => ({
  useAccountContext: () => ({
    account: { userId: "self" },
    accountKey: "self",
    api: vi.fn(),
    lifecycle: { isCurrent: () => true },
  }),
  useApi: () => vi.fn(),
  useUnsavedWorkGuard: vi.fn(),
}));
vi.mock("./provider", () => ({ useMessagingRealtime: () => ({ typing: [] }) }));
vi.mock("./api", () => ({
  root: "/api/v1/messaging",
  useChatQuery: () => ({ isPending: true }),
  useChatPages: () => ({
    items: [
      {
        id: "chat-1",
        title: "Alex",
        type: "Direct",
        unreadCount: 0,
        membershipState: "Active",
      },
    ],
    isPending: false,
    isError: false,
    error: null,
    refetch: () => undefined,
    isLoadingMore: false,
    hasMore: false,
  }),
  cacheMessage: vi.fn(),
}));

beforeEach(() => {
  state.mobile = true;
});
function setup(url = "/app/messages") {
  const router = createMemoryRouter(
    [{ path: "/app/messages", Component: Messages }],
    { initialEntries: [url] },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

it("keeps the phone inbox open until selection, including after browser Back", async () => {
  const router = setup();
  await screen.findByText("Alex");
  expect(router.state.location.search).toBe("");
  await act(async () => {
    screen.getByText("Alex").click();
  });
  expect(router.state.location.search).toBe("?conversation=chat-1");
  await act(async () => {
    await router.navigate(-1);
  });
  expect(router.state.location.search).toBe("");
});

it("retains desktop first-conversation selection", async () => {
  state.mobile = false;
  const router = setup();
  await waitFor(() =>
    expect(router.state.location.search).toBe("?conversation=chat-1"),
  );
});

it("retains a phone conversation deep link", async () => {
  const router = setup("/app/messages?conversation=shared-chat");
  expect(router.state.location.search).toBe("?conversation=shared-chat");
});
