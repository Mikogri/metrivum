import { describe, expect, it } from "vitest";
import { clampTarget, easeInOutCubic, fitDistance, lerp3, viewPosition } from "./camera";

describe("anatomy camera", () => {
  it("fits a tall body on a portrait panel by its width and on a landscape panel by its height", () => {
    const body: [number, number, number] = [600, 1700, 300];
    const portrait = fitDistance(body, 35, 0.6);
    const landscape = fitDistance(body, 35, 1.8);
    // Half the height at the vertical half-angle must stay inside the frame.
    expect(1700 / 2 / landscape).toBeLessThan(Math.tan((35 * Math.PI) / 360));
    expect(portrait).toBeGreaterThanOrEqual(landscape);
  });

  it("places named views on the right side of the model", () => {
    expect(viewPosition("front", [0, 850, 0], 3000)).toEqual([0, 850, 3000]);
    expect(viewPosition("back", [0, 850, 0], 3000)).toEqual([0, 850, -3000]);
    expect(viewPosition("left", [10, 850, 0], 3000)).toEqual([3010, 850, 0]);
    expect(viewPosition("right", [10, 850, 0], 3000)).toEqual([-2990, 850, 0]);
  });

  it("keeps the orbit target near the model", () => {
    expect(clampTarget([5000, 900, -5000], [-300, 0, -150], [300, 1700, 150])).toEqual([360, 900, -180]);
    expect(clampTarget([0, 850, 0], [-300, 0, -150], [300, 1700, 150])).toEqual([0, 850, 0]);
  });

  it("eases flights from start to end", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(2)).toBe(1);
    expect(lerp3([0, 0, 0], [10, 20, 30], 0.5)).toEqual([5, 10, 15]);
  });
});
