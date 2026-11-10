import { expect, it } from "vitest";
import {
  mobileDestination,
  validPush,
  parsePendingPush,
  isVisibleConversation,
} from "./links";
const id = "aa123456-1234-1234-1234-123456789abc";
it("maps known business destinations and rejects arbitrary or malformed URLs", () => {
  expect(mobileDestination(`/app/messages?conversation=${id}`)).toBe(
    `/conversation/${id}`,
  );
  for (const link of [
    "https://evil.test",
    "//evil.test",
    "/app/messages?conversation=../settings",
    "/app/clients/nope",
    "/app/payments",
    "/app/clients/../../settings",
  ])
    expect(mobileDestination(link)).toBeNull();
});
it("requires account and notification identity in a push payload", () => {
  expect(validPush({ accountId: id, notificationId: id })).toBe(true);
  expect(validPush({ accountId: "other", notificationId: id })).toBe(false);
});

it("validates retained push identity before navigating after an account switch", () => {
  const value = { accountId: id, notificationId: id };
  expect(parsePendingPush(JSON.stringify(value))).toEqual(value);
  for (const text of ["not json", "null", "[]", '{"accountId":"other"}'])
    expect(parsePendingPush(text)).toBeNull();
});
it("suppresses only the visible conversation of the matching account", () => {
  const data = {
    accountId: id,
    notificationId: id,
    resourceType: "Messaging",
    resourceId: id,
  };
  expect(isVisibleConversation(data, id, id)).toBe(true);
  expect(isVisibleConversation(data, "other", id)).toBe(false);
  expect(isVisibleConversation(data, id)).toBe(false);
  expect(
    isVisibleConversation({ ...data, resourceType: "Coaching" }, id, id),
  ).toBe(false);
});
