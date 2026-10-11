import { expect, it } from "vitest";
import { notificationTargetsView } from "./notification-target";
import type { DurableNotification } from "./durable-notifications";
const item = (deepLink: string, type = "InvitationReceived") => ({ deepLink, type } as DurableNotification);
it("recognizes destinations regardless of entry point and unrelated filters", () => {
  expect(notificationTargetsView(item("/app/invitations/one"), "/app/invitations/one?from=chat")).toBe(true);
  expect(notificationTargetsView(item("/app/messages?tab=requests"), "/app/messages?page=2&tab=requests")).toBe(true);
  expect(notificationTargetsView(item("/app/clients/one?tab=documentation"), "/app/clients/one?tab=profile")).toBe(false);
});
it("does not read siblings, parent lists, or unseen chat messages", () => {
  expect(notificationTargetsView(item("/app/invitations/one"), "/app/invitations")).toBe(false);
  expect(notificationTargetsView(item("/app/invitations/one"), "/app/invitations/two")).toBe(false);
  expect(notificationTargetsView(item("/app/messages?conversation=one", "MessageCreated"), "/app/messages?conversation=one")).toBe(false);
});
