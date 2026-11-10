import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { optimisticRead } from "./read-cache";
import type { Conversation } from "./model";

const conversation = {
  id: "chat",
  title: "Original",
  unreadCount: 3,
  members: [
    { userId: "me", lastReadMessageId: "old" },
    { userId: "peer", lastReadMessageId: "peer-read" },
  ],
} as Conversation;
const list = [
  "account",
  "messaging",
  "/api/v1/messaging/conversations",
  { search: "" },
];
const detail = ["account", "messaging", "/api/v1/messaging/conversations/chat"];
it("marks list variants and details read immediately and preserves authoritative updates", () => {
  const cache = new QueryClient();
  const filtered = [...list.slice(0, 3), { search: "Original" }];
  const other = ["other", ...list.slice(1)];
  for (const key of [list, filtered, other])
    cache.setQueryData(key, [conversation]);
  cache.setQueryData(detail, conversation);
  const rollback = optimisticRead(cache, "account", "chat", "me", "new");
  for (const key of [list, filtered])
    expect(cache.getQueryData<Conversation[]>(key)?.[0]?.unreadCount).toBe(0);
  expect(
    cache.getQueryData<Conversation>(detail)?.members[0]?.lastReadMessageId,
  ).toBe("new");
  expect(cache.getQueryData(other)).toEqual([conversation]);
  cache.setQueryData<Conversation>(detail, (value) => ({
    ...value!,
    title: "Renamed",
  }));
  rollback();
  expect(cache.getQueryData<Conversation>(detail)).toMatchObject({
    title: "Renamed",
    unreadCount: 0,
  });
  expect(
    cache.getQueryData<Conversation>(detail)?.members[0]?.lastReadMessageId,
  ).toBe("new");
});
it("does not roll back a newer read marker or recreate cleared account caches", () => {
  const cache = new QueryClient();
  cache.setQueryData(detail, conversation);
  const rollback = optimisticRead(cache, "account", "chat", "me", "first");
  optimisticRead(cache, "account", "chat", "me", "second");
  rollback();
  expect(
    cache.getQueryData<Conversation>(detail)?.members[0]?.lastReadMessageId,
  ).toBe("second");
  expect(cache.getQueryData<Conversation>(detail)?.unreadCount).toBe(0);
  cache.clear();
  rollback();
  expect(cache.getQueryData(detail)).toBeUndefined();
});

for (const order of [
  [0, 1],
  [1, 0],
]) {
  for (const success of [[], [0], [1], [0, 1]]) {
    it(`replays overlapping conversation reads: order ${order}, successes ${success}`, () => {
      const cache = new QueryClient();
      cache.setQueryData(detail, conversation);
      const reads = [
        optimisticRead(cache, "account", "chat", "me", "first"),
        optimisticRead(cache, "account", "chat", "me", "second"),
      ];
      for (const index of order) {
        if (success.includes(index)) reads[index]!.commit();
        else reads[index]!();
      }
      const value = cache.getQueryData<Conversation>(detail)!;
      expect(value.unreadCount).toBe(success.length ? 0 : 3);
      expect(value.members[0]?.lastReadMessageId).toBe(
        success.includes(1) ? "second" : success.includes(0) ? "first" : "old",
      );
    });
  }
}
