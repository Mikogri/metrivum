import { describe, expect, it } from "vitest";
import { tokenAt } from "./FormulaExpressionInput";

describe("formula suggestions", () => {
  it("suggests names for the identifier before the caret", () => {
    expect(tokenAt("ROUND_TO_STEP(ba", 16)).toEqual({
      start: 14,
      prefix: "ba",
      kind: "name",
    });
    expect(tokenAt("MA", 2)).toEqual({ start: 0, prefix: "MA", kind: "name" });
  });

  it("suggests units right after a number", () => {
    expect(tokenAt("base + 2.5 k", 12)).toEqual({
      start: 11,
      prefix: "k",
      kind: "unit",
    });
    expect(tokenAt("2.5", 3)).toEqual({ start: 3, prefix: "", kind: "unit" });
  });

  it("does not treat names that contain digits as units", () => {
    expect(tokenAt("e1RM", 4)).toEqual({
      start: 0,
      prefix: "e1RM",
      kind: "name",
    });
    expect(tokenAt("e1rm", 4)).toEqual({
      start: 0,
      prefix: "e1rm",
      kind: "name",
    });
  });

  it("offers nothing after operators", () => {
    expect(tokenAt("base * ", 7)).toBeNull();
  });
});
