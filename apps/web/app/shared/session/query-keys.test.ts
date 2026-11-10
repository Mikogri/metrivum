import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { accountResourceKey } from "./query-keys";

it.each([
  "/api/v1/me/team-context",
  "/api/v1/me/platform-subscription",
  "/api/v1/subscriptions/plans",
])(
  "deduplicates %s across workspaces but never across accounts",
  async (path) => {
    const cache = new QueryClient({
      defaultOptions: { queries: { staleTime: 30000 } },
    });
    const queryFn = vi.fn(async () => ({ marker: "server response" }));
    const coach = accountResourceKey("one", "coach", path);
    const client = accountResourceKey("one", "client", path);
    const result = await Promise.all([
      cache.fetchQuery({ queryKey: coach, queryFn }),
      cache.fetchQuery({ queryKey: client, queryFn }),
    ]);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(result[0]).toEqual(result[1]);
    expect(
      cache.getQueryData(accountResourceKey("two", "coach", path)),
    ).toBeUndefined();
    await cache.invalidateQueries({ queryKey: ["one", "coaching"] });
    expect(cache.getQueryState(coach)?.isInvalidated).toBe(true);
    cache.clear();
  },
);

it("keeps resource queries separated by workspace and request parameters", () => {
  const path = "/api/v1/check-ins/requests";
  expect(accountResourceKey("one", "coach", path)).not.toEqual(
    accountResourceKey("one", "client", path),
  );
  expect(accountResourceKey("one", "coach", path, { page: 1 })).not.toEqual(
    accountResourceKey("one", "coach", path, { page: 2 }),
  );
});
