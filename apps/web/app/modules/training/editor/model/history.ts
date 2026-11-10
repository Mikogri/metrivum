import type { TrainingDocument } from "@metrivum/api-client-web";

/** Local undo/redo of editor operations. It is not a server version history. */
export interface History {
  past: TrainingDocument[];
  present: TrainingDocument;
  future: TrainingDocument[];
}

const LIMIT = 100;

export function createHistory(doc: TrainingDocument): History {
  return { past: [], present: doc, future: [] };
}

export function commit(history: History, next: TrainingDocument): History {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-LIMIT),
    present: next,
    future: [],
  };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}
