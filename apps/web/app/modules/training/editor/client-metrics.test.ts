import { describe, expect, it } from "vitest";
import { sourcesChanged, validMax } from "./client-metrics";

describe("client formula source snapshots", () => {
  it("ignores new unused variables but detects changed and removed frozen inputs", () => {
    expect(sourcesChanged({ bench: "1" }, { bench: "1", squat: "2" })).toBe(
      false,
    );
    expect(sourcesChanged({ bench: "1" }, { bench: "2" })).toBe(true);
    expect(sourcesChanged({ bench: "1" }, {})).toBe(true);
  });
  it("rejects malformed aliases and invalid physical max records", () => {
    expect(validMax(1, 100, "maxBench1r")).toBe(true);
    for (const reps of [0, 1.5, 101, NaN])
      expect(validMax(reps, 100, "bench")).toBe(false);
    for (const load of [0, -1, Infinity, NaN])
      expect(validMax(1, load, "bench")).toBe(false);
    for (const alias of [
      "",
      "1bench",
      "bench press",
      "bench()",
      "x".repeat(65),
    ])
      expect(validMax(1, 100, alias)).toBe(false);
  });
});
