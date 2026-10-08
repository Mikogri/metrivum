import type { Cycle, ExerciseInstance, FormulaUse, Prescription, TrainingDay, TrainingDocument, TrainingSet, Workout } from "@trainflow/api-client-web";
import type { Locale } from "~/shared/i18n/locale";
import { copyPrescription, findExercise, locate, newSet, updateNode } from "./document";
import { formatLoad, formatReps, parseLoad, parseReps } from "./notation";

// ---------------------------------------------------------------------------------------------
// One exercise as sheet cells: "sets × reps" and "load". Editing a cell writes every set of the
// exercise, which is what coaches mean when they type "3×8 @ 80 kg" in a spreadsheet.

export interface ExerciseCells {
  setsReps: string;
  load: string;
  /** Sets differ from each other; editing a cell makes them uniform again. */
  mixed: boolean;
}

function sameValues(a: Prescription, b: Prescription) {
  return JSON.stringify([a.reps, a.load, a.loadPercent, a.loadFormula]) === JSON.stringify([b.reps, b.load, b.loadPercent, b.loadFormula]);
}

export function exerciseCells(locale: Locale, instance: ExerciseInstance, formulaLabel?: (key: string) => string): ExerciseCells {
  const first = instance.sets[0]?.prescription ?? {};
  const mixed = instance.sets.some((set) => set.kind !== "Standard" || !sameValues(set.prescription, first));
  const reps = formatReps(first.reps);
  return {
    setsReps: `${instance.sets.length}${reps ? ` × ${reps}` : ""}`,
    load: formatLoad(locale, first, formulaLabel),
    mixed,
  };
}

function writeSets(doc: TrainingDocument, instanceId: string, fn: (sets: TrainingSet[]) => TrainingSet[]): TrainingDocument {
  const found = findExercise(doc, instanceId);
  if (!found) return doc;
  return updateNode(doc, instanceId, { sets: fn(found.exercise.sets) });
}

/** "4×8", "4 x 8-10", "4×" (count only) or "8-10" (reps only). Returns null when the text is not valid. */
export function applySetsReps(doc: TrainingDocument, instanceId: string, text: string): TrainingDocument | null {
  const value = text.trim();
  const match = /^(\d{1,2})\s*[x×*]\s*(.*)$/i.exec(value);
  const count = match ? Number(match[1]) : null;
  const repsText = match ? match[2]! : value;
  const reps = parseReps(repsText);
  if (!reps.ok || (count !== null && (count < 1 || count > 50))) return null;
  return writeSets(doc, instanceId, (sets) => {
    const template = sets[0]?.prescription ?? {};
    const total = count ?? sets.length;
    return Array.from({ length: total }, (_, i) => {
      const base = sets[i] ?? newSet("Standard", copyPrescription(template));
      const prescription = { ...copyPrescription(i < sets.length ? base.prescription : template) };
      if (repsText.trim() || !match) prescription.reps = reps.value;
      return { ...base, kind: "Standard", prescription } as TrainingSet;
    });
  });
}

/** "80 kg", "80-85 kg", "75%" or empty (clears the load). */
export function applyLoad(locale: Locale, doc: TrainingDocument, instanceId: string, text: string): TrainingDocument | null {
  const found = findExercise(doc, instanceId);
  if (!found) return null;
  const unit = found.exercise.sets[0]?.prescription.load?.minimum.unit ?? "Kg";
  const parsed = parseLoad(locale, text, unit);
  if (!parsed.ok) return null;
  const load = parsed.value;
  return writeSets(doc, instanceId, (sets) =>
    sets.map((set) => {
      const p: Prescription = { ...set.prescription };
      delete p.loadFormula;
      if (load.kind === "none") {
        delete p.load;
        delete p.loadPercent;
        delete p.baseValue;
      } else if (load.kind === "absolute") {
        p.load = load.load;
        delete p.loadPercent;
        delete p.baseValue;
      } else {
        p.loadPercent = load.percent;
        delete p.load;
      }
      return { ...set, prescription: p };
    }),
  );
}

/** Binds (or clears) a load formula on every set of an exercise. */
export function setExerciseFormula(doc: TrainingDocument, instanceId: string, formula: FormulaUse | null): TrainingDocument {
  return writeSets(doc, instanceId, (sets) =>
    sets.map((set) => {
      const p: Prescription = { ...set.prescription };
      if (formula) {
        p.loadFormula = { ...formula, inputs: { ...formula.inputs } };
        delete p.load;
        delete p.loadPercent;
        delete p.baseValue;
      } else delete p.loadFormula;
      return { ...set, prescription: p };
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Expanded cycle: days side by side, each day a column of rows (workout, its exercises, an
// "add exercise" row). Sizes are in sheet cells so the card lines up with the grid.

export const DAY_COLS = 4; // exercise (2) + sets×reps (1) + load (1)

export type CycleRow =
  | { type: "workout"; workout: Workout }
  | { type: "exercise"; workout: Workout; instance: ExerciseInstance; index: number }
  | { type: "add-exercise"; workout: Workout }
  | { type: "add-workout"; day: TrainingDay };

export interface CycleGrid {
  cols: number;
  rows: number;
  days: { day: TrainingDay; col: number; rows: CycleRow[] }[];
}

export const EXPANDED_HEAD_ROWS = 2; // card header + day headings

export function cycleGrid(cycle: Cycle, editable: boolean): CycleGrid {
  const days = cycle.days.map((day, index) => {
    const rows: CycleRow[] = [];
    for (const workout of day.workouts) {
      rows.push({ type: "workout", workout });
      workout.exercises.forEach((instance, i) => rows.push({ type: "exercise", workout, instance, index: i }));
      if (editable) rows.push({ type: "add-exercise", workout });
    }
    if (editable) rows.push({ type: "add-workout", day });
    return { day, col: index * DAY_COLS, rows };
  });
  const bodyRows = Math.max(1, ...days.map((d) => d.rows.length));
  return { cols: Math.max(DAY_COLS, days.length * DAY_COLS), rows: EXPANDED_HEAD_ROWS + bodyRows + (editable ? 1 : 0), days };
}

// ---------------------------------------------------------------------------------------------
// Block progression: every cycle stays fully editable, but a coach can generate the numbers
// for a whole block from the first cycle that contains the exercise.

export type ProgressionRule =
  | { kind: "load"; step: number } // + step (in the exercise's mass unit) per cycle
  | { kind: "percent"; step: number } // + step percentage points per cycle
  | { kind: "reps"; step: number }; // + step reps per cycle

function progressed(base: Prescription, rule: ProgressionRule, k: number): Prescription {
  const p = copyPrescription(base);
  if (rule.kind === "load" && p.load) {
    const add = (q: { value: number | string; unit: typeof p.load.minimum.unit }) => ({ ...q, value: Math.round((Number(q.value) + rule.step * k) * 100) / 100 });
    p.load = { minimum: add(p.load.minimum), maximum: add(p.load.maximum) };
  } else if (rule.kind === "percent" && p.loadPercent != null) {
    p.loadPercent = Math.round((Number(p.loadPercent) + rule.step * k) * 100) / 100;
  } else if (rule.kind === "reps" && p.reps) {
    const min = Math.max(1, Number(p.reps.minimum) + rule.step * k);
    p.reps = { minimum: min, maximum: Math.max(min, Number(p.reps.maximum) + rule.step * k) };
  }
  return p;
}

/** Exercises (by exercise id) used anywhere in a block. */
export function blockExerciseIds(doc: TrainingDocument, blockId: string): string[] {
  const block = doc.blocks.find((b) => b.id === blockId);
  if (!block) return [];
  const ids = new Set<string>();
  for (const cycle of block.cycles) for (const day of cycle.days) for (const w of day.workouts) for (const e of w.exercises) ids.add(e.exerciseId);
  return [...ids];
}

/**
 * Rewrites the exercise in every later cycle of the block from its occurrence in the first cycle
 * that has it (same day number when possible), adding `step × n` for the n-th following cycle.
 * Returns the new document and how many exercise entries changed.
 */
export function applyProgression(doc: TrainingDocument, blockId: string, exerciseId: string, rule: ProgressionRule): { doc: TrainingDocument; changed: number } {
  const at = locate(doc, blockId);
  if (!at || at.kind !== "block") return { doc, changed: 0 };
  const block = doc.blocks[at.blockIndex]!;
  const occurrences = (cycle: Cycle) =>
    cycle.days.flatMap((day) => day.workouts.flatMap((w) => w.exercises.filter((e) => e.exerciseId === exerciseId).map((e) => ({ day, instance: e }))));
  const baseIndex = block.cycles.findIndex((c) => occurrences(c).length > 0);
  if (baseIndex < 0) return { doc, changed: 0 };
  const base = occurrences(block.cycles[baseIndex]!);
  let next = doc;
  let changed = 0;
  block.cycles.slice(baseIndex + 1).forEach((cycle, offset) => {
    const k = offset + 1;
    for (const { day, instance } of occurrences(cycle)) {
      const source = base.find((b) => Number(b.day.dayNumber) === Number(day.dayNumber)) ?? base[0]!;
      const sets = source.instance.sets.map((set, i) => ({
        ...(instance.sets[i] ?? newSet()),
        kind: set.kind,
        prescription: progressed(set.prescription, rule, k),
      })) as TrainingSet[];
      // Back-off references point at the source cycle's sets; keep the shape simple and standard.
      const repaired = sets.map((s) => (s.kind === "BackOff" ? ({ ...s, kind: "Standard" } as TrainingSet) : s)).map((s) => {
        const copy = { ...s };
        delete copy.sourceSetId;
        delete copy.segments;
        return copy;
      });
      next = updateNode(next, instance.id, { sets: repaired });
      changed += 1;
    }
  });
  return { doc: next, changed };
}
