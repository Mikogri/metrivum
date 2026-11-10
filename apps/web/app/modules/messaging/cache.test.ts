import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { cacheMessage } from "./api";
import type { Message } from "./model";

it("inserts the HTTP/realtime message once without refetching or touching another account", () => {
  const cache = new QueryClient();
  const key = ["account", "messaging", "history", "chat"];
  const other = ["other", "messaging", "history", "chat"];
  const pages = {
    pages: [{ items: [], olderCursor: "older", newerCursor: null }],
    pageParams: [undefined],
  };
  cache.setQueryData(key, pages);
  cache.setQueryData(other, pages);
  const message: Message = {
    id: "sent",
    conversationId: "chat",
    senderUserId: "me",
    type: "Text",
    body: "Hello",
    attachments: [],
    replyToMessageId: null,
    createdAt: "2026-10-08T12:00:00Z",
    cursor: "cursor",
  };
  cacheMessage(cache, "account", message);
  cacheMessage(cache, "account", message);
  expect(cache.getQueryData(key)).toEqual({
    ...pages,
    pages: [{ ...pages.pages[0], items: [message] }],
  });
  expect(cache.getQueryData(other)).toEqual(pages);
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
});
