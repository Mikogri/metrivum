import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { groupInvalidation, useCoachingMutation } from "./api";
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountKey: () => "account",
  useApi: () => async () => ({ data: { version: 2 } }),
}));
vi.mock("~/shared/session/WorkspaceScope", () => ({
  useWorkspace: () => ({ mode: "coach" }),
}));
it("reports every successful write before a deferred refetch completes", async () => {
  const cache = new QueryClient();
  let complete!: () => void;
  const invalidate = vi.spyOn(cache, "invalidateQueries").mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const success = vi.fn();
  const { result } = renderHook(() => useCoachingMutation(success), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    await result.current.mutateAsync({ method: "POST", path: "/publish" });
  });
  expect(success).toHaveBeenCalledWith({ version: 2 });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["account", "coaching"],
  });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  await act(async () => {
    await result.current.mutateAsync({ method: "POST", path: "/publish" });
  });
  expect(success).toHaveBeenCalledTimes(2);
  complete();
});

it("invalidates all views of selected resources without reloading unrelated modules or accounts", async () => {
  const cache = new QueryClient();
  const keys = [
    ["account", "coaching", "coach", "/api/v1/coaching/groups", { page: 2 }],
    ["account", "coaching", "client", "/api/v1/coaching/groups/one"],
    ["account", "coaching", "coach", "/api/v1/coaching/groups-other"],
    ["account", "coaching", "coach", "/api/v1/offers"],
    ["other", "coaching", "coach", "/api/v1/coaching/groups"],
  ];
  keys.forEach((key) => cache.setQueryData(key, []));
  const { result } = renderHook(
    () =>
      useCoachingMutation(undefined, {
        invalidate: ["/api/v1/coaching/groups"],
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  await act(async () => {
    await result.current.mutateAsync({
      method: "POST",
      path: "/api/v1/coaching/groups",
    });
  });
  expect(keys.map((key) => cache.getQueryState(key)?.isInvalidated)).toEqual([
    true,
    true,
    false,
    false,
    false,
  ]);
  cache.clear();
});

it("refreshes dependent analytics filters and sections after group changes without invalidating offers", async () => {
  const cache = new QueryClient();
  const keys = [
    [
      "account",
      "coaching",
      "analyze",
      "/api/v1/analyze/context",
      "team",
      { groupId: "one" },
    ],
    [
      "account",
      "coaching",
      "analyze",
      "/api/v1/analyze/clients",
      "team",
      { groupId: "one" },
    ],
    ["account", "coaching", "coach", "/api/v1/offers"],
  ];
  keys.forEach((key) => cache.setQueryData(key, []));
  const { result } = renderHook(
    () => useCoachingMutation(undefined, groupInvalidation),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    },
  );
  await act(async () => {
    await result.current.mutateAsync({
      method: "PUT",
      path: "/api/v1/coaching/groups/one",
    });
  });
  expect(keys.map((key) => cache.getQueryState(key)?.isInvalidated)).toEqual([
    true,
    true,
    false,
  ]);
  cache.clear();
});
