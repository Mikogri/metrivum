import { describe, expect, it } from "vitest";
import { initialWorkspace, routeWorkspace, twinRoute } from "./workspace-model";

describe("workspace boundaries", () => {
  it("client-only accounts cannot restore coach mode", () => {
    expect(initialWorkspace(["Client"], "coach")).toBe("client");
    expect(initialWorkspace(["Coach"], "client")).toBe("client");
    expect(initialWorkspace(["Coach", "Client"], null)).toBe("coach");
  });
  it("distinguishes shared details from mode-specific destinations", () => {
    expect(routeWorkspace("/app/check-ins/123")).toBe(null);
    expect(routeWorkspace("/app/check-ins")).toBe("coach");
    expect(routeWorkspace("/app/my-check-ins")).toBe("client");
    expect(routeWorkspace("/app/programs/123/edit")).toBe("coach");
    expect(routeWorkspace("/app/training-plans")).toBe("client");
    expect(routeWorkspace("/app/training-plans/123/edit")).toBe("client");
    expect(routeWorkspace("/app/calendar")).toBe(null);
    expect(routeWorkspace("/app/subscription")).toBe(null);
    expect(routeWorkspace("/app/team")).toBe(null);
    expect(routeWorkspace("/app/analyze")).toBe("coach");
  });
  it("opens a client's workout in whichever workspace is active", () => {
    expect(twinRoute("/app/my-training/workouts/w1", "coach")).toBe("/app/training/workouts/w1");
    expect(twinRoute("/app/training/workouts/w1", "client")).toBe("/app/my-training/workouts/w1");
    expect(twinRoute("/app/training/workouts/w1", "coach")).toBe("/app/training/workouts/w1");
    expect(twinRoute("/app/programs/p1", "client")).toBe(null);
  });
});
