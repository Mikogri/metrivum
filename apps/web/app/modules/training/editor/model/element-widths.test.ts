import { describe, expect, it } from "vitest";
import { elementColumnWidths, sanitizeElementWidths } from "./layout";
describe("element-owned sheet widths", () => {
  it("moves widths with their owner and restores the old base column", () => {
    const widths = { cycle: { 4: 200 } }; const active = new Set(["cycle"]);
    expect(elementColumnWidths({}, { cycle: { col: 1, row: 1 } }, widths, active)).toEqual({ 5: 200 });
    expect(elementColumnWidths({}, { cycle: { col: 3, row: 1 } }, widths, active)).toEqual({ 7: 200 });
    expect(elementColumnWidths({ 5: 120 }, { cycle: { col: 3, row: 1 } }, widths, active)).toEqual({ 5: 120, 7: 200 });
  });
  it("fits overlapping owners and ignores removed or folded elements", () => {
    const layout = { a: { col: 0, row: 1 }, b: { col: 1, row: 5 } };
    const owners = { a: { 2: 200 }, b: { 1: 250 } };
    expect(elementColumnWidths({}, layout, owners, new Set(["a", "b"]))).toEqual({ 2: 250 });
    expect(elementColumnWidths({}, layout, owners, new Set(["a"]))).toEqual({ 2: 200 });
    expect(elementColumnWidths({}, {}, owners, new Set(["a"]))).toEqual({});
    expect(sanitizeElementWidths({ a: { 4: 10000, 999: 120 } })).toEqual({ a: { 4: 320 } });
  });
});
