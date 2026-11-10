import { describe, expect, it } from "vitest";
import {
  columnGeometry,
  CELL_W,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  columnAt,
  columnLeft,
  columnSpan,
  resizedColumnWidth,
  sanitizeColumnWidths,
} from "./layout";

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
    for (let col = 0; col < 40; col++)
      expect(columnAt(widths, columnLeft(widths, col), true)).toBe(col);
  });

  it("inverts screen deltas at every supported zoom and bounds resizing", () => {
    for (const zoom of [0.4, 0.75, 1, 1.8]) {
      expect(resizedColumnWidth(104, 40 * zoom, zoom)).toBe(144);
      expect(
        columnAt(
          { 0: 144 },
          columnLeft({ 0: 144 }, 1) + (104 * zoom) / zoom,
          true,
        ),
      ).toBe(2);
    }
    expect(resizedColumnWidth(104, -1000, 0.4)).toBe(MIN_COLUMN_WIDTH);
    expect(resizedColumnWidth(104, 1000, 0.4)).toBe(MAX_COLUMN_WIDTH);
  });

  it("rejects corrupt or oversized persisted width maps", () => {
    expect(
      sanitizeColumnWidths({
        0: 1,
        1: 999,
        2: Infinity,
        3: "100",
        2048: 200,
        "-1": 120,
        nope: 200,
      }),
    ).toEqual({ 0: MIN_COLUMN_WIDTH, 1: MAX_COLUMN_WIDTH });
    expect(sanitizeColumnWidths(null)).toEqual({});
    expect(sanitizeColumnWidths([100])).toEqual({});
  });
});

describe("auto arrange", () => {
  it("puts blocks side by side, their cycles under them side by side, and workouts stacked under each cycle", async () => {
    const { addBlock, addCycle, emptyDocument } = await import("./document");
    const { addCycleWorkout } = await import("./workouts");
    const { autoLayout, BLOCK_COLS } = await import("./layout");
    let doc = emptyDocument();
    const b1 = addBlock(doc, "B1");
    doc = b1.doc;
    const c1 = addCycle(doc, b1.id, "C1");
    doc = c1.doc;
    const c2 = addCycle(doc, b1.id, "C2");
    doc = c2.doc;
    const w1 = addCycleWorkout(doc, c1.id!, "A");
    doc = w1.doc;
    const w2 = addCycleWorkout(doc, c1.id!, "B");
    doc = w2.doc;
    const b2 = addBlock(doc, "B2");
    doc = b2.doc;
    const layout = autoLayout(doc);
    // Blocks share the top row; cycles share the row under the block.
    expect(layout[b1.id]!.row).toBe(layout[b2.id]!.row);
    expect(layout[c1.id!]!.row).toBe(layout[c2.id!]!.row);
    expect(layout[c1.id!]!.row).toBeGreaterThan(layout[b1.id]!.row);
    // Workouts stack under their cycle, in its column.
    expect(layout[w1.id!]!.col).toBe(layout[c1.id!]!.col);
    expect(layout[w2.id!]!.col).toBe(layout[c1.id!]!.col);
    expect(layout[w2.id!]!.row).toBeGreaterThan(layout[w1.id!]!.row);
    expect(layout[w1.id!]!.row).toBeGreaterThan(layout[c1.id!]!.row);
    // The second cycle starts after the first cycle's open workouts, and block 2 after all of block 1.
    expect(layout[c2.id!]!.col).toBeGreaterThan(layout[w1.id!]!.col + 6);
    expect(layout[b2.id]!.col).toBeGreaterThan(
      layout[c2.id!]!.col + BLOCK_COLS,
    );
  });
});

it("cached geometry matches the original across sparse widths and repeated lookups", () => {
  const widths = { 0: 155, 4: 83, 31: 190 };
  const geometry = columnGeometry(widths);
  for (let pass = 0; pass < 3; pass++)
    for (let col = 0; col < 100; col++) {
      expect(geometry.left(col)).toBe(columnLeft(widths, col));
      expect(geometry.span(col, 9)).toBe(columnSpan(widths, col, 9));
    }
});

it("compact auto arrange ignores open cycle/workout sizes and keeps folded cards one cell apart", async () => {
  const { addBlock, addCycle, emptyDocument } = await import("./document");
  const { addCycleWorkout } = await import("./workouts");
  const { compactAutoLayout, CYCLE_COLS, resolveLayout } =
    await import("./layout");
  const b = addBlock(emptyDocument(), "Block");
  const c = addCycle(b.doc, b.id, "Cycle");
  const next = addCycle(c.doc, b.id, "Next");
  const a = addCycleWorkout(next.doc, c.id!, "A");
  const z = addCycleWorkout(a.doc, c.id!, "B");
  const openSizes = {
    [c.id!]: { cols: 40, rows: 50 },
    [a.id!]: { cols: 9, rows: 80 },
    [z.id!]: { cols: 9, rows: 60 },
  };
  const layout = compactAutoLayout(z.doc, openSizes);
  expect(layout).toEqual(compactAutoLayout(z.doc));
  expect(layout[a.id!]!.row - layout[c.id!]!.row).toBe(3);
  expect(layout[z.id!]!.row - layout[a.id!]!.row).toBe(2);
  expect(layout[next.id!]!.col - layout[c.id!]!.col).toBe(CYCLE_COLS + 1);
  const folded = {
    [b.id]: { cols: 2, rows: 3 },
    [c.id!]: { cols: 2, rows: 2 },
    [next.id!]: { cols: 2, rows: 2 },
    [a.id!]: { cols: 3, rows: 1 },
    [z.id!]: { cols: 3, rows: 1 },
  };
  expect(resolveLayout(layout, folded)).toEqual(layout);
  expect(z.doc.blocks[0]!.cycles).toHaveLength(2);
});
