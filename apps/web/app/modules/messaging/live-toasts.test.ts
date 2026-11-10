import { expect, it } from "vitest";
import { liveToast, notificationTitle } from "./durable-notifications";

it("pops up every step of a collaboration and forms a client sent, but not chat messages", () => {
  for (const type of [
    "ApplicationSubmitted",
    "ApplicationAccepted",
    "ApplicationRejected",
    "InvitationAccepted",
    "RelationshipSuspended",
    "RelationshipCompleted",
    "CheckInSubmitted",
    "training.assigned",
  ])
    expect(liveToast(type)).not.toBeNull();
  expect(liveToast("MessageCreated")).toBeNull();
  expect(liveToast("ApplicationAccepted")).toBe("success");
  expect(notificationTitle("ApplicationSubmitted")).toBe(
    "A client sent you an application form",
  );
  expect(notificationTitle("CheckInSubmitted")).toBe(
    "A client sent a check-in form",
  );
});
