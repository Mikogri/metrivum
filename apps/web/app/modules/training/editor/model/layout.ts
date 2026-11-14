import { maxesTables } from "./maxes";
import type {
  Cycle,
  TrainingDocument,
  Workout,
} from "@metrivum/api-client-web";
import { sheetView } from "./structure";
import { WORKOUT_COLS, cycleWorkouts, workoutCardRows } from "./workouts";

/** Sheet cell size in pixels. Nodes snap to cell corners, like objects on a spreadsheet. */
export const CELL_W = 104;
export const CELL_H = 32;

export interface Cell {
  col: number;
  row: number;
}

export type Layout = Record<string, Cell>;

export const BLOCK_COLS = 2;
export const CYCLE_COLS = 3;
export const BLOCK_ROWS = 3;

/**
 * Height of a folded cycle card in rows: header and name, a mini calendar (7 day tiles per line)
 * and a legend line per workout.
 */
export function cycleRows(cycle: Cycle): number {
  const tileLines = Math.ceil(Number(cycle.dayCount) / 7);
  const workouts = cycle.days.reduce((n, d) => n + d.workouts.length, 0);
  const px = 58 + tileLines * 24 + 8 + (workouts ? 6 + workouts * 20 : 0) + 6;
  return Math.ceil(px / CELL_H);
}

/** Gaps between neighbouring cards and groups, in cells. */
const GAP = 1;
const GROUP_GAP = 2;

/**
 * Default, tidy arrangement, as a tree: blocks side by side along the top; under each block its cycles side by side;
 * under each cycle its workouts one below another. Each block's group is as wide as everything under it with the
 * workouts open, so the next block starts only after the last workout column of the one before. Cycles outside every
 * block and workouts outside every cycle follow as their own groups, then maxes tables and notes in a last column.
 * `sizes` (cards as currently drawn, e.g. folded) take precedence over the default card sizes.
 */
export function autoLayout(
  doc: TrainingDocument,
  sizes: Record<string, Size> = {},
  /** Width each card needs when open: a cycle's column is kept that wide, so opening cards never spills into the next. */
  reserve: (id: string) => number = () => 0,
): Layout {
  const { blocks, loose, looseWorkouts } = sheetView(doc);
  const layout: Layout = {};
  const size = (id: string, fallback: Size): Size => sizes[id] ?? fallback;
  const cycleSize = (cycle: Cycle) =>
    size(cycle.id, { cols: CYCLE_COLS, rows: cycleRows(cycle) });
  const workoutSize = (workout: Workout) =>
    size(workout.id, {
      cols: WORKOUT_COLS,
      rows: workoutCardRows(workout, false, true),
    });
  const top = 1;
  let col = 1;

  // Cycles in a row from `start` at `row`, each with its workouts stacked underneath; returns the columns used.
  const placeCycles = (cycles: Cycle[], start: number, row: number) => {
    const cyclesHeight = Math.max(
      0,
      ...cycles.map((cycle) => cycleSize(cycle).rows),
    );
    let at = start;
    for (const cycle of cycles) {
      const own = cycleSize(cycle);
      layout[cycle.id] = { col: at, row };
      let workoutRow = row + cyclesHeight + GAP;
      let width = Math.max(own.cols, reserve(cycle.id));
      for (const { workout } of cycleWorkouts(cycle)) {
        const w = workoutSize(workout);
        layout[workout.id] = { col: at, row: workoutRow };
        workoutRow += w.rows + GAP;
        width = Math.max(width, w.cols, reserve(workout.id));
      }
      at += width + GAP;
    }
    return Math.max(0, at - start - GAP);
  };

  for (const block of blocks) {
    const own = size(block.id, { cols: BLOCK_COLS, rows: BLOCK_ROWS });
    layout[block.id] = { col, row: top };
    const used = placeCycles(block.cycles, col, top + own.rows + GAP);
    col += Math.max(own.cols, used) + GROUP_GAP;
  }
  // Cycles outside every block: a group of their own, on the blocks' row.
  if (loose.length) col += placeCycles(loose, col, top) + GROUP_GAP;
  // Workouts outside every cycle: one column.
  if (looseWorkouts.length) {
    let row = top;
    let width = 0;
    for (const workout of looseWorkouts) {
      const w = workoutSize(workout);
      layout[workout.id] = { col, row };
      row += w.rows + GAP;
      width = Math.max(width, w.cols);
    }
    col += width + GROUP_GAP;
  }
  // Maxes tables and notes: a last column.
  let row = top;
  for (const table of maxesTables(doc)) {
    layout[table.id] = { col, row };
    row += size(table.id, { cols: 5, rows: table.rows.length + 3 }).rows + GAP;
  }
  for (const note of doc.annotations ?? []) {
    layout[note.id] = { col, row };
    row += size(note.id, { cols: 3, rows: 5 }).rows + GAP;
  }
  return layout;
}

/**
 * Store compact anchors regardless of what is open; resolveLayout makes room only while expanded, by moving cards down.
 * Rows are packed as if everything were folded, but each cycle's column is as wide as its workouts open: opening a
 * workout then pushes only the workouts under it in the same column, and never lands on the next cycle's column (which
 * would push those workouts down too, into a staircase that mixes the cycles).
 */
export function compactAutoLayout(
  doc: TrainingDocument,
  sizes: Record<string, Size> = {},
): Layout {
  const compact = { ...sizes };
  const open = new Map<string, number>();
  const { blocks, loose } = sheetView(doc);
  for (const cycle of [...blocks.flatMap((block) => block.cycles), ...loose]) {
    compact[cycle.id] = { cols: BLOCK_COLS, rows: 2 };
    open.set(cycle.id, CYCLE_COLS);
    for (const { workout } of cycleWorkouts(cycle)) {
      compact[workout.id] = { cols: CYCLE_COLS, rows: 1 };
      open.set(workout.id, WORKOUT_COLS);
    }
  }
  return autoLayout(doc, compact, (id) => open.get(id) ?? 0);
}

/** Width of a workout card in cells. */
export const WORKOUT_CARD_COLS = WORKOUT_COLS;

/** Keeps positions the user chose and places anything new with the default layout. */
export function mergeLayout(current: Layout, doc: TrainingDocument): Layout {
  const defaults = autoLayout(doc);
  const next: Layout = {};
  for (const id of Object.keys(defaults))
    next[id] = current[id] ?? defaults[id]!;
  return next;
}

export function snap(px: number, size: number): number {
  return Math.max(0, Math.round(px / size));
}

export interface Size {
  cols: number;
  rows: number;
}

function overlaps(a: Cell, as: Size, b: Cell, bs: Size): boolean {
  return (
    a.col < b.col + bs.cols &&
    b.col < a.col + as.cols &&
    a.row < b.row + bs.rows &&
    b.row < a.row + as.rows
  );
}

/**
 * Cards never overlap: anything that would sit on top of another card is pushed down to the next
 * free cells. `first` lists cards that keep their place (an expanding cycle), so its neighbours
 * make room around it. The stored layout is left alone; this is only where cards are drawn.
 */
export function resolveLayout(
  layout: Layout,
  sizes: Record<string, Size>,
  first: string[] = [],
): Layout {
  const ids = Object.keys(sizes).filter((id) => layout[id]);
  const order = [
    ...first.filter((id) => sizes[id] && layout[id]),
    ...ids
      .filter((id) => !first.includes(id))
      .sort(
        (x, y) =>
          layout[x]!.row - layout[y]!.row || layout[x]!.col - layout[y]!.col,
      ),
  ];
  const placed: { id: string; cell: Cell }[] = [];
  const result: Layout = {};
  for (const id of order) {
    const size = sizes[id]!;
    const cell = { ...layout[id]! };
    for (let guard = 0; guard < 500; guard++) {
      const hit = placed.find((p) =>
        overlaps(cell, size, p.cell, sizes[p.id]!),
      );
      if (!hit) break;
      cell.row = hit.cell.row + sizes[hit.id]!.rows + 1;
    }
    placed.push({ id, cell });
    result[id] = cell;
  }
  return result;
}

export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 320;
export const MAX_SAVED_COLUMNS = 2048;
export type ColumnWidths = Record<number, number>;

export function clampColumnWidth(width: number): number {
  return Number.isFinite(width)
    ? Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
    : CELL_W;
}

export function sanitizeColumnWidths(value: unknown): ColumnWidths {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, width]) => {
        const col = Number(key);
        return (
          Number.isInteger(col) &&
          col >= 0 &&
          col < MAX_SAVED_COLUMNS &&
          typeof width === "number" &&
          Number.isFinite(width)
        );
      })
      .map(([key, width]) => [key, clampColumnWidth(width as number)]),
  );
}

export const columnWidth = (widths: ColumnWidths, col: number): number =>
  widths[col] ?? CELL_W;

/** Cell positions stay logical; only rendering and pointer inversion use pixel widths. */
export function columnLeft(widths: ColumnWidths, col: number): number {
  let x = col * CELL_W;
  for (const [key, width] of Object.entries(widths))
    if (Number(key) < col) x += width - CELL_W;
  return x;
}

export function columnSpan(
  widths: ColumnWidths,
  col: number,
  count: number,
): number {
  return columnLeft(widths, col + count) - columnLeft(widths, col);
}

export function columnAt(
  widths: ColumnWidths,
  x: number,
  nearest = false,
): number {
  if (x <= 0) return 0;
  let col = 0;
  let left = 0;
  while (left + columnWidth(widths, col) <= x)
    left += columnWidth(widths, col++);
  return col + (nearest && x - left >= columnWidth(widths, col) / 2 ? 1 : 0);
}

export function resizedColumnWidth(
  initial: number,
  clientDelta: number,
  zoom: number,
): number {
  return clampColumnWidth(initial + clientDelta / zoom);
}

export type ElementWidths = Record<string, ColumnWidths>;
export function sanitizeElementWidths(value: unknown): ElementWidths {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 10000)
      .map(([id, widths]) => [
        id,
        Object.fromEntries(
          Object.entries(sanitizeColumnWidths(widths)).filter(
            ([index]) => Number(index) < 64,
          ),
        ),
      ]),
  );
}
/** Element preferences project onto their current columns; moving never mutates the base sheet. */
export function elementColumnWidths(
  base: ColumnWidths | undefined,
  layout: Layout,
  elements: ElementWidths | undefined,
  active: ReadonlySet<string>,
): ColumnWidths {
  const owned: ColumnWidths = {};
  for (const [id, widths] of Object.entries(elements ?? {})) {
    const at = layout[id];
    if (!at || !active.has(id)) continue;
    for (const [index, width] of Object.entries(widths)) {
      const col = at.col + Number(index);
      owned[col] = Math.max(
        owned[col] ?? MIN_COLUMN_WIDTH,
        clampColumnWidth(width),
      );
    }
  }
  return { ...sanitizeColumnWidths(base), ...owned };
}

/** One cache per width snapshot; repeated card/header/edge lookups reuse computed offsets. */
export function columnGeometry(widths: ColumnWidths) {
  const offsets = new Map<number, number>();
  const left = (col: number) => {
    const cached = offsets.get(col);
    if (cached !== undefined) return cached;
    const value = columnLeft(widths, col);
    offsets.set(col, value);
    return value;
  };
  return {
    left,
    span: (col: number, count: number) => left(col + count) - left(col),
  };
}
