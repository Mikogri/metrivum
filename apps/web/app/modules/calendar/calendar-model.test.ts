import { describe, expect, it } from "vitest";
import { daysForMonth, visibleRange } from "./calendar-model";

describe("calendar dates", () => {
  it("renders leap day and starts month grids on Monday", () => {
    const days = daysForMonth("2028-02-15");
    expect(days[0]).toBe("2028-01-31");
    expect(days).toContain("2028-02-29");
    expect(days.length % 7).toBe(0);
  });
  it("keeps DST day boundaries in the selected timezone", () => {
    const range = visibleRange("week", "2026-03-29", "Europe/Warsaw");
    expect(range.from).toBe("2026-03-22T23:00:00.000Z");
    expect(range.to).toBe("2026-03-29T22:00:00.000Z");
  });
  it("handles a complete year including its exclusive next-year boundary", () => {
    expect(visibleRange("year", "2028-12-31", "UTC")).toEqual({ from: "2028-01-01T00:00:00.000Z", to: "2029-01-01T00:00:00.000Z" });
  });
});
