import { describe, expect, it } from "vitest";
import { stepsBackTo } from "./navigateUp";

describe("stepsBackTo", () => {
  // list → plan → editor → plan (the editor's back pushed the plan again)
  const entries = new Map([
    [0, "/app/programs?folder=a"],
    [1, "/app/programs/p1"],
    [2, "/app/programs/p1/edit"],
    [3, "/app/programs/p1"],
  ]);

  it("goes back to the list the plan was opened from, skipping the editor", () => {
    expect(stepsBackTo("/app/programs", 3, entries)).toBe(3);
  });

  it("goes back one step from the editor to its plan", () => {
    expect(stepsBackTo("/app/programs/p1", 2, entries)).toBe(1);
  });

  it("has no step when the parent was never visited", () => {
    expect(stepsBackTo("/app/clients", 3, entries)).toBeNull();
  });

  it("stops at a gap in the trail, such as after a full reload", () => {
    expect(
      stepsBackTo("/app/programs", 3, new Map([[3, "/app/programs/p1"]])),
    ).toBeNull();
  });
});
