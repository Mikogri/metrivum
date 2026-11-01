import { expect, it } from "vitest";
import type { Schema } from "@metrivum/api-client-web";
import type { Conversation, Request } from "./model";
import { notificationItems } from "./notifications-model";

it("includes unread previews and only this account's incoming pending requests/invitations", () => {
  const conversations = [{ id: "chat", title: "Alex", unreadCount: 3, lastMessage: { body: "See you tomorrow", createdAt: "2026-10-08" } }, { id: "read", unreadCount: 0 }] as Conversation[];
  const requests = [{ id: "request", senderUserId: "alex", recipientUserId: "me", state: "Pending", body: "Hello", createdAt: "2026-10-07" }, { id: "outgoing", recipientUserId: "other", state: "Pending" }, { id: "old", recipientUserId: "me", state: "Accepted" }] as Request[];
  const invitations = [{ id: "invite", targetUserId: "me", status: "Pending", coach: { displayName: "Coach" }, message: null, offerRevision: { name: "Training" }, createdAt: "2026-10-06" }] as Schema<"InvitationDto">[];
  const items = notificationItems(conversations, requests, invitations, "me");
  expect(items.map(item => item.id)).toEqual(["chat:chat", "request:request", "invitation:invite"]);
  expect(items[0]).toMatchObject({ count: 3, preview: "See you tomorrow", href: "/app/messages?conversation=chat" });
  expect(items[2]?.preview).toBe("Invitation: Training");
  expect(notificationItems([], requests, invitations, "unrelated")).toEqual([]);
});

it("hides the open conversation without hiding other chats", () => {
  const conversations = [{ id: "open", unreadCount: 2 }, { id: "other", unreadCount: 1 }] as Conversation[];
  expect(notificationItems(conversations, [], [], "me", "open").map(item => item.id)).toEqual(["chat:other"]);
  expect(notificationItems(conversations, [], [], "me").length).toBe(2);
});
