import { describe, expect, it } from "vitest";
import { chartGeometry } from "../../../../../packages/ui-mobile/src/chartGeometry";

describe("recorded-value chart geometry", () => {
  it("keeps missing and non-finite values out without losing recorded zero", () => {
    const chart = chartGeometry([
      { id: "missing", date: "2026-10-01", value: null },
      { id: "blank", date: "2026-10-01", value: "" },
      { id: "bad", date: "2026-10-01", value: "NaN" },
      { id: "infinite", date: "2026-10-01", value: Infinity },
      { id: "zero", date: "2026-10-02", value: "0" },
    ]);
    expect(chart.points.map((point) => point.id)).toEqual(["zero"]);
    expect(chart.points[0]?.width).toBe(0);
    expect(chart.max).toBe(0);
  });

  it("sorts chronologically and scales positive values from a real zero baseline", () => {
    const chart = chartGeometry([
      { id: "b", date: "2026-10-02", value: "100.5" },
      { id: "a", date: "2026-10-01", value: 50.25 },
    ]);
    expect(
      chart.points.map((point) => [point.id, point.left, point.width]),
    ).toEqual([
      ["a", 0, 50],
      ["b", 0, 100],
    ]);
    expect(chart.baseline).toBe(0);
  });

  it("positions negative and positive observations on opposite sides of zero", () => {
    const chart = chartGeometry([
      { id: "a", date: "2026-10-01", value: -10 },
      { id: "b", date: "2026-10-02", value: 30 },
    ]);
    expect(chart.baseline).toBe(25);
    expect(chart.points.map((point) => [point.left, point.width])).toEqual([
      [0, 25],
      [25, 75],
    ]);
  });

  it("keeps an empty series empty and a single observation finite", () => {
    expect(chartGeometry([]).points).toEqual([]);
    const chart = chartGeometry([{ id: "one", date: "2026-10-01", value: 82 }]);
    expect(chart.points).toHaveLength(1);
    expect(chart.points[0]?.width).toBe(100);
  });
});
