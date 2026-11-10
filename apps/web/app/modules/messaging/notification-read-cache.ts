import type { QueryClient } from "@tanstack/react-query";
import type { DurableNotification } from "./durable-notifications";

import { journalRead, readBaseline } from "./read-journal";

type Page = { items: DurableNotification[]; total: number };
type Count = { count: number };

export function optimisticNotificationRead(
  cache: QueryClient,
  account: string,
  id?: string,
) {
  const snapshots = cache.getQueriesData<Page | Count>({
    queryKey: [account, "notifications"],
    predicate: (q) => q.queryKey[2] !== "preferences",
  });
  const target = snapshots
    .flatMap(([key]) => {
      const value = readBaseline<Page | Count>(cache, key);
      return value && "items" in value ? value.items : [];
    })
    .find((item) => item.id === id && !item.readAt);
  const changed = (item: DurableNotification) =>
    !item.readAt && (!id || item.id === id);
  const stamp = new Date().toISOString();
  return journalRead<Page | Count>(
    cache,
    snapshots.map(([key]) => ({
      key,
      apply: (previous, applied) => {
        if ("count" in previous) {
          const excluded =
            target?.type === "MessageCreated" && target.sourceId === key[3];
          const duplicate = applied.has("*") || Boolean(id && applied.has(id));
          applied.add(id ?? "*");
          return {
            count: id
              ? Math.max(
                  0,
                  previous.count - (target && !excluded && !duplicate ? 1 : 0),
                )
              : 0,
          };
        }
        const removed = previous.items.filter(changed).length;
        return {
          ...previous,
          items:
            key[3] === true
              ? previous.items.filter((item) => !changed(item))
              : previous.items.map((item) =>
                  changed(item) ? { ...item, readAt: stamp } : item,
                ),
          total:
            key[3] === true
              ? id
                ? Math.max(0, previous.total - removed)
                : 0
              : previous.total,
        };
      },
    })),
  );
}
