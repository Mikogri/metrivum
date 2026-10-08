import type { Cycle, TrainingDocument } from "@trainflow/api-client-web";

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
const BLOCK_ROWS = 3;

/**
 * Height of a folded cycle card in rows: header and name, a mini calendar (7 day tiles per line)
 * and a legend line per workout.
 */
export function cycleRows(cycle: Cycle): number {
  const tileLines = Math.ceil(Number(cycle.dayCount) / 7);
  const workouts = cycle.days.reduce((n, d) => n + d.workouts.length, 0);
  const px = 60 + tileLines * 37 + (workouts ? 6 + workouts * 20 : 0) + 8;
  return Math.ceil(px / CELL_H);
}

/**
 * Default, tidy arrangement: blocks in the first column, their cycles in a row to the right,
 * cycles that are not connected to any block underneath. Positions are never saved, so every
 * reload starts from this layout.
 */
export function autoLayout(doc: TrainingDocument, loose: Cycle[]): Layout {
  const layout: Layout = {};
  let row = 1;
  for (const block of doc.blocks) {
    layout[block.id] = { col: 1, row };
    let height = BLOCK_ROWS;
    block.cycles.forEach((cycle, index) => {
      layout[cycle.id] = { col: 1 + BLOCK_COLS + 1 + index * (CYCLE_COLS + 1), row };
      height = Math.max(height, cycleRows(cycle));
    });
    row += height + 1;
  }
  loose.forEach((cycle, index) => {
    layout[cycle.id] = { col: 1 + BLOCK_COLS + 1 + index * (CYCLE_COLS + 1), row };
  });
  return layout;
}

/** Keeps positions the user chose and places anything new with the default layout. */
export function mergeLayout(current: Layout, doc: TrainingDocument, loose: Cycle[]): Layout {
  const defaults = autoLayout(doc, loose);
  const next: Layout = {};
  for (const id of Object.keys(defaults)) next[id] = current[id] ?? defaults[id]!;
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
  return a.col < b.col + bs.cols && b.col < a.col + as.cols && a.row < b.row + bs.rows && b.row < a.row + as.rows;
}

/**
 * Cards never overlap: anything that would sit on top of another card is pushed down to the next
 * free cells. `first` lists cards that keep their place (an expanding cycle), so its neighbours
 * make room around it. The stored layout is left alone; this is only where cards are drawn.
 */
export function resolveLayout(layout: Layout, sizes: Record<string, Size>, first: string[] = []): Layout {
  const ids = Object.keys(sizes).filter((id) => layout[id]);
  const order = [
    ...first.filter((id) => sizes[id] && layout[id]),
    ...ids.filter((id) => !first.includes(id)).sort((x, y) => layout[x]!.row - layout[y]!.row || layout[x]!.col - layout[y]!.col),
  ];
  const placed: { id: string; cell: Cell }[] = [];
  const result: Layout = {};
  for (const id of order) {
    const size = sizes[id]!;
    const cell = { ...layout[id]! };
    for (let guard = 0; guard < 500; guard++) {
      const hit = placed.find((p) => overlaps(cell, size, p.cell, sizes[p.id]!));
      if (!hit) break;
      cell.row = hit.cell.row + sizes[hit.id]!.rows + 1;
    }
    placed.push({ id, cell });
    result[id] = cell;
  }
  return result;
}
