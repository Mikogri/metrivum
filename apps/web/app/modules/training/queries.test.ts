import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { Transport } from "~/shared/http/transport";
import { formulaQueryOptions } from "./queries";

it("deduplicates a pinned formula and isolates its version and account", async () => {
  const api = vi.fn(async ({ query }) => ({
    data: { id: "f", version: query.version },
    version: query.version,
  })) as unknown as Transport;
  const cache = new QueryClient();
  try {
    const options = formulaQueryOptions(api, "alice", { id: "f", version: 2 });
    const [first, second] = await Promise.all([
      cache.fetchQuery(options),
      cache.fetchQuery(options),
    ]);
    expect(first).toEqual(second);
    expect(api).toHaveBeenCalledTimes(1);
    expect(first.data.version).toBe(2);
    await cache.fetchQuery(
      formulaQueryOptions(api, "alice", { id: "f", version: 1 }),
    );
    await cache.fetchQuery(
      formulaQueryOptions(api, "bob", { id: "f", version: 2 }),
    );
    expect(api).toHaveBeenCalledTimes(3);
  } finally {
    cache.clear();
  }
});
