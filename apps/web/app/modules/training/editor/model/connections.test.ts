import { describe, expect, it } from "vitest";
import { cablePath, connectBounds, plugRotation } from "./connections";
const box = { left: 100, top: 100, width: 200, height: 100 };
describe("sheet connection routing", () => {
  it.each([
    [{ ...box, left: 400 }, "right", "left"],
    [{ ...box, left: -200 }, "left", "right"],
    [{ ...box, top: 300 }, "bottom", "top"],
    [{ ...box, top: -100 }, "top", "bottom"],
  ] as const)("chooses facing sides for %j", (target, from, to) => {
    const connection = connectBounds(box, target);
    expect(connection.from.side).toBe(from); expect(connection.to.side).toBe(to);
    expect(cablePath(connection.from, connection.to)).not.toMatch(/NaN|Infinity/);
  });
  it("uses vertical ports when a wide cycle is directly below a narrow block", () => {
    const { from, to } = connectBounds(box, { left: 50, top: 250, width: 1200, height: 500 });
    expect(from.side).toBe("bottom"); expect(to.side).toBe("top"); expect(from.x).toBe(to.x);
    expect(plugRotation(to.side)).toBe(90);
  });
  it("reverses cleanly and handles overlapping nodes without invalid geometry", () => {
    const target = { ...box, left: 500, top: 300 };
    const a = connectBounds(box, target); const b = connectBounds(target, box);
    expect(a.from).toEqual(b.to); expect(a.to).toEqual(b.from);
    const overlap = connectBounds(box, box);
    expect(cablePath(overlap.from, overlap.to)).not.toMatch(/NaN|Infinity/);
  });
});
