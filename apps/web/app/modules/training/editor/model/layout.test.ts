import { describe, expect, it } from "vitest";
import { CELL_W, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, columnAt, columnLeft, columnSpan, resizedColumnWidth, sanitizeColumnWidths } from "./layout";

describe("sheet column geometry", () => {
  it("preserves the default spreadsheet coordinates and snapping", () => {
    for (let col = 0; col < 40; col++) {
      expect(columnLeft({}, col)).toBe(col * CELL_W);
      expect(columnAt({}, col * CELL_W + CELL_W * 0.49, true)).toBe(col);
      expect(columnAt({}, col * CELL_W + CELL_W * 0.51, true)).toBe(col + 1);
      expect(columnSpan({}, col, 8)).toBe(8 * CELL_W);
    }
  });

  it("uses cumulative unequal widths for cards, headers and inverse pointer coordinates", () => {
    const widths = { 0: 64, 1: 240, 3: 320 };
    expect(columnLeft(widths, 4)).toBe(728);
    expect(columnSpan(widths, 1, 3)).toBe(664);
    expect(columnAt(widths, 63)).toBe(0);
    expect(columnAt(widths, 64)).toBe(1);
    expect(columnAt(widths, 303)).toBe(1);
    expect(columnAt(widths, 304)).toBe(2);
    expect(columnAt(widths, 183, true)).toBe(1);
    expect(columnAt(widths, 184, true)).toBe(2);
    expect(columnAt(widths, -100, true)).toBe(0);
    for (let col = 0; col < 40; col++) expect(columnAt(widths, columnLeft(widths, col), true)).toBe(col);
  });

  it("inverts screen deltas at every supported zoom and bounds resizing", () => {
    for (const zoom of [0.4, 0.75, 1, 1.8]) {
      expect(resizedColumnWidth(104, 40 * zoom, zoom)).toBe(144);
      expect(columnAt({ 0: 144 }, columnLeft({ 0: 144 }, 1) + 104 * zoom / zoom, true)).toBe(2);
    }
    expect(resizedColumnWidth(104, -1000, 0.4)).toBe(MIN_COLUMN_WIDTH);
    expect(resizedColumnWidth(104, 1000, 0.4)).toBe(MAX_COLUMN_WIDTH);
  });

  it("rejects corrupt or oversized persisted width maps", () => {
    expect(sanitizeColumnWidths({ 0: 1, 1: 999, 2: Infinity, 3: "100", 2048: 200, "-1": 120, nope: 200 })).toEqual({ 0: MIN_COLUMN_WIDTH, 1: MAX_COLUMN_WIDTH });
    expect(sanitizeColumnWidths(null)).toEqual({});
    expect(sanitizeColumnWidths([100])).toEqual({});
  });
});
