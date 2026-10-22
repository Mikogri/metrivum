import { describe, expect, it } from "vitest";
import { overallPercent } from "./progress";

describe("analysis progress bar", () => {
  it("never reports the analysis as finished before the result is saved", () => {
    expect(overallPercent("analyzing", 0.97, 0)).toBeLessThan(85);
    expect(overallPercent("saved", 1, 1)).toBe(100);
  });

  it("orders the stages on one bar", () => {
    expect(overallPercent("uploading", 0, 0)).toBe(85);
    expect(overallPercent("uploading", 1, 1)).toBe(97);
    expect(overallPercent("saving", 1, 1)).toBe(98);
  });
});
