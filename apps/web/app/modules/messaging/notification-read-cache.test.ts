import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { optimisticNotificationRead } from "./notification-read-cache";
import type { DurableNotification } from "./durable-notifications";
const item = {
  id: "one",
  type: "MessageCreated",
  sourceId: "chat",
  readAt: null,
} as DurableNotification;
const list = ["account", "notifications", 1, false, null];
const unread = ["account", "notifications", 1, true, null];
const count = ["account", "notifications", "count", null];
it("reads immediately across list/count variants, skips excluded chats and rolls back", () => {
  const cache = new QueryClient();
  for (const key of [list, unread])
    cache.setQueryData(key, { items: [item], total: 1 });
  cache.setQueryData(count, { count: 2 });
  const excluded = ["account", "notifications", "count", "chat"];
  cache.setQueryData(excluded, { count: 1 });
  const other = ["other", ...count.slice(1)];
  cache.setQueryData(other, { count: 5 });
  const rollback = optimisticNotificationRead(cache, "account", "one");
  expect(cache.getQueryData(count)).toEqual({ count: 1 });
  expect(cache.getQueryData(excluded)).toEqual({ count: 1 });
  expect(cache.getQueryData(unread)).toEqual({ items: [], total: 0 });
  expect(
    cache.getQueryData<{ items: DurableNotification[] }>(list)?.items[0]
      ?.readAt,
  ).toBeTruthy();
  expect(cache.getQueryData(other)).toEqual({ count: 5 });
  rollback();
  expect(cache.getQueryData(unread)).toEqual({ items: [item], total: 1 });
  expect(cache.getQueryData(count)).toEqual({ count: 2 });
});
it("read-all clears unloaded counts, and rollback preserves subsequent server data and cleared accounts", () => {
  const cache = new QueryClient();
  cache.setQueryData(list, { items: [item], total: 50 });
  cache.setQueryData(unread, { items: [item], total: 50 });
  cache.setQueryData(count, { count: 50 });
  const rollback = optimisticNotificationRead(cache, "account");
  expect(cache.getQueryData(count)).toEqual({ count: 0 });
  expect(cache.getQueryData(unread)).toEqual({ items: [], total: 0 });
  cache.setQueryData(count, { count: 1 });
  rollback();
  expect(cache.getQueryData(count)).toEqual({ count: 1 });
  cache.clear();
  rollback();
  expect(cache.getQueryData(list)).toBeUndefined();
});

for (const order of [
  [0, 1],
  [1, 0],
]) {
  for (const success of [[], [0], [1], [0, 1]]) {
    it(`replays overlapping notification reads: order ${order}, successes ${success}`, () => {
      const cache = new QueryClient();
      cache.setQueryData(list, {
        items: [item, { ...item, id: "two" }],
        total: 2,
      });
      cache.setQueryData(unread, {
        items: [item, { ...item, id: "two" }],
        total: 2,
      });
      cache.setQueryData(count, { count: 2 });
      const reads = [
        optimisticNotificationRead(cache, "account", "one"),
        optimisticNotificationRead(cache, "account", "two"),
      ];
      for (const index of order) {
        if (success.includes(index)) reads[index]!.commit();
        else reads[index]!();
      }
      expect(cache.getQueryData(count)).toEqual({ count: 2 - success.length });
      const rows = cache.getQueryData<{ items: DurableNotification[] }>(
        list,
      )!.items;
      expect(Boolean(rows[0]?.readAt)).toBe(success.includes(0));
      expect(Boolean(rows[1]?.readAt)).toBe(success.includes(1));
      expect(cache.getQueryData<{ total: number }>(unread)!.total).toBe(
        2 - success.length,
      );
    });
  }
}
it("replays duplicate reads once if their earlier request fails", () => {
  const cache = new QueryClient();
  cache.setQueryData(list, { items: [item], total: 1 });
  cache.setQueryData(count, { count: 1 });
  const first = optimisticNotificationRead(cache, "account", "one");
  const second = optimisticNotificationRead(cache, "account", "one");
  expect(cache.getQueryData(count)).toEqual({ count: 0 });
  first();
  second.commit();
  expect(cache.getQueryData(count)).toEqual({ count: 0 });
});

for (const order of [
  [0, 1],
  [1, 0],
]) {
  for (const success of [[], [0], [1], [0, 1]]) {
    it(`replays a read overlapping read-all: order ${order}, successes ${success}`, () => {
      const cache = new QueryClient();
      cache.setQueryData(list, {
        items: [item, { ...item, id: "two" }],
        total: 2,
      });
      cache.setQueryData(count, { count: 5 });
      const reads = [
        optimisticNotificationRead(cache, "account", "one"),
        optimisticNotificationRead(cache, "account"),
      ];
      for (const index of order) {
        if (success.includes(index)) reads[index]!.commit();
        else reads[index]!();
      }
      expect(cache.getQueryData(count)).toEqual({
        count: success.includes(1) ? 0 : success.includes(0) ? 4 : 5,
      });
      const rows = cache.getQueryData<{ items: DurableNotification[] }>(
        list,
      )!.items;
      expect(Boolean(rows[0]?.readAt)).toBe(success.length > 0);
      expect(Boolean(rows[1]?.readAt)).toBe(success.includes(1));
    });
  }
}
