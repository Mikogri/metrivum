import { QueryClient, type InfiniteData } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { Schema } from "@metrivum/api-client-web";
import { syncMessage } from "./api";
import type { Message } from "./model";

it("shows summary messages immediately and recovers gaps without duplicate refreshes", async () => {
  const cache = new QueryClient();
  const key = ["account", "messaging", "history", "chat"];
  const first = {
    id: "first",
    conversationId: "chat",
    createdAt: "2026-10-08T10:00:00Z",
  } as Message;
  const next = { ...first, id: "next", createdAt: "2026-10-08T10:01:00Z" };
  cache.setQueryData(key, {
    pages: [{ items: [first], olderCursor: null }],
    pageParams: [undefined],
  });
  const refresh = vi.spyOn(cache, "invalidateQueries");
  await syncMessage(cache, "account", next, true);
  expect(
    cache
      .getQueryData<InfiniteData<Schema<"MessagePage">>>(key)
      ?.pages[0]?.items.map((m) => m.id),
  ).toEqual(["first", "next"]);
  expect(refresh).toHaveBeenCalledOnce();
  await syncMessage(cache, "account", next, true);
  expect(refresh).toHaveBeenCalledOnce();
  await syncMessage(cache, "other-account", next, true);
  expect(
    cache.getQueryData(["other-account", "messaging", "history", "chat"]),
  ).toBeUndefined();
  cache.clear();
});

it("replaces a deleted message on an older page without resurrecting its body", async () => {
  const { cacheMessage } = await import("./api");
  const cache = new QueryClient();
  const key = ["account", "messaging", "history", "chat"];
  const old = {
    id: "old",
    conversationId: "chat",
    createdAt: "2026-10-08T10:00:00Z",
    body: "private text",
  } as Message;
  cache.setQueryData(key, {
    pages: [{ items: [] }, { items: [old] }],
    pageParams: [undefined, "cursor"],
  });
  cacheMessage(cache, "account", {
    ...old,
    body: null,
    deletedAt: "2026-10-08T11:00:00Z",
  } as Message);
  const items = cache
    .getQueryData<InfiniteData<Schema<"MessagePage">>>(key)!
    .pages.flatMap((p) => p.items);
  expect(items).toHaveLength(1);
  expect(items[0]!.body).toBeNull();
});
