import { useCallback, useState } from "react";
import type { ExerciseColumn } from "./ExerciseCells";

const KEY = "tf.table.widths";

/** Default track for each table column: flexible until someone drags its edge. */
const DEFAULTS: Record<ExerciseColumn, string> = {
  exercise: "minmax(10.25rem, 2.4fr)",
  sets: "minmax(4.25rem, 1fr)",
  reps: "minmax(4.25rem, 1fr)",
  load: "minmax(4.25rem, 1fr)",
  time: "minmax(4.25rem, 1fr)",
  rest: "minmax(4.25rem, 1fr)",
  comment: "minmax(9rem, 2fr)",
};

/** Narrowest a dragged column may get, in pixels. */
export const MIN_WIDTH: Record<ExerciseColumn, number> = {
  exercise: 120,
  sets: 56,
  reps: 56,
  load: 64,
  time: 56,
  rest: 56,
  comment: 80,
};
const MAX_WIDTH = 640;

type Widths = Partial<Record<ExerciseColumn, number>>;

function read(): Widths {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(KEY) ?? "{}",
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          key in DEFAULTS && typeof value === "number" && value > 0,
      ),
    ) as Widths;
  } catch {
    return {};
  }
}

/**
 * Column widths of the table editor, a per-browser preference shared by every plan: a dragged column keeps its
 * pixel width, the others stay flexible. `template` is the grid's column list for the given columns.
 */
export function useTableWidths() {
  const [widths, setWidths] = useState<Widths>(read);
  const save = (next: Widths) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: widths last for this page */
    }
  };
  const resize = useCallback((column: ExerciseColumn, width: number | null) => {
    setWidths((current) => {
      const next = { ...current };
      if (width === null) delete next[column];
      else
        next[column] = Math.round(
          Math.min(MAX_WIDTH, Math.max(MIN_WIDTH[column], width)),
        );
      save(next);
      return next;
    });
  }, []);
  const template = (columns: ExerciseColumn[]) =>
    columns
      .map((column) =>
        widths[column] ? `${widths[column]}px` : DEFAULTS[column],
      )
      .join(" ");
  return { widths, resize, template };
}
