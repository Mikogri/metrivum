import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useQuotaContext } from "./QuotaContext";

const api = vi.hoisted(() => vi.fn());
vi.mock("~/shared/session/AccountScope", () => ({
  useAccountContext: () => ({ api, accountKey: "account-one" }),
}));

it("defaults to personal capacity even with active membership and sends a team scope only after selection", async () => {
  api.mockImplementation(async ({ path }: { path: string }) => ({
    data: path.endsWith("team-context")
      ? { teamId: "team-one", name: "Studio", isActive: true }
      : { planId: "Free", usage: [] },
  }));
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useQuotaContext(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.team.data?.isActive).toBe(true));
  expect(result.current.teamId).toBeUndefined();
  expect(api).toHaveBeenCalledWith(
    expect.objectContaining({ path: "/api/v1/me/usage", query: undefined }),
  );
  act(() => result.current.setTeamId("team-one"));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/me/usage",
        query: { teamId: "team-one" },
      }),
    ),
  );
  expect(
    cache
      .getQueryCache()
      .getAll()
      .every((query) => query.queryKey[0] === "account-one"),
  ).toBe(true);
  cache.clear();
});
