import { describe, expect, it } from "vitest";
import { mobileDestinations, mobileSelection, immersiveMobileRoute, mobileViewport } from "./mobile-navigation";

describe("native-aligned web navigation", () => {
  it("keeps exactly the implemented native destinations for each role", () => {
    expect(mobileDestinations("client").map(x => x.label)).toEqual(["Today", "Plans", "History", "Messages", "More"]);
    expect(mobileDestinations("coach").map(x => x.label)).toEqual(["Today", "Clients", "Messages", "Calendar", "More"]);
  });
  it("keeps list/detail and query-based training context without prefix collisions", () => {
    expect(mobileSelection("client", "/app/my-training", "?tab=plans")).toBe("plans");
    expect(mobileSelection("client", "/app/my-training", "?tab=history&view=progress")).toBe("history");
    expect(mobileSelection("client", "/app/training-plans/one", "")).toBe("plans");
    expect(mobileSelection("coach", "/app/clients/one", "")).toBe("clients");
    expect(mobileSelection("coach", "/app/clients-other", "")).toBe("more");
    expect(mobileSelection("client", "/app/settings", "")).toBe("more");
  });
  it("leaves a list visible but frees the viewport for conversations and executions", () => {
    expect(immersiveMobileRoute("/app/messages", "")).toBe(false);
    expect(immersiveMobileRoute("/app/messages", "?conversation=id")).toBe(true);
    expect(immersiveMobileRoute("/app/messages", "?person=id")).toBe(true);
    expect(immersiveMobileRoute("/app/my-training/workouts/id", "")).toBe(true);
  });
  it("does not interpret pinch zoom as keyboard occlusion", () => {
    expect(mobileViewport(800, { height: 480, offsetTop: 0, scale: 1 }, true)).toEqual({ height: 480, top: 0, keyboard: true });
    expect(mobileViewport(800, { height: 400, offsetTop: 30, scale: 2 }, true)).toEqual({ height: 800, top: 0, keyboard: false });
    expect(mobileViewport(800, { height: 720, offsetTop: 0, scale: 1 }, false).keyboard).toBe(false);
  });
});
