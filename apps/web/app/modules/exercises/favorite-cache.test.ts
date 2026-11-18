import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { exerciseKeys, invalidateFavoriteQueries } from "./queries";

it("refreshes lists and the changed exercise without refreshing dictionaries, history or other accounts", async () => {
  const cache = new QueryClient();
  const affected = [
    exerciseKeys.list("alice", {}),
    exerciseKeys.list("alice", { favoritesOnly: true }),
    exerciseKeys.detail("alice", "e"),
  ];
  const unchanged = [
    exerciseKeys.dictionaries("alice"),
    exerciseKeys.tags("alice", ""),
    exerciseKeys.history("alice", "e"),
    exerciseKeys.detail("alice", "other"),
    exerciseKeys.list("bob", {}),
  ];
  try {
    for (const key of [...affected, ...unchanged]) cache.setQueryData(key, {});
    await invalidateFavoriteQueries(cache, "alice", "e");
    for (const key of affected)
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unchanged)
      expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  } finally {
    cache.clear();
  }
});
