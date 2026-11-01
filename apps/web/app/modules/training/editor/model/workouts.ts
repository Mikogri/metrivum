import type { Cycle, ExerciseInstance, Prescription, TrainingDocument, TrainingSet, Workout } from "@metrivum/api-client-web";
import { formatNumber, parseLocaleNumber } from "~/shared/i18n/format";
import type { Locale } from "~/shared/i18n/locale";
import { cloneWithNewIds, copyPrescription, findExercise, locate, newDay, newSet, newWorkout, updateNode } from "./document";
import { parseReps } from "./notation";

// ---------------------------------------------------------------------------------------------
// A cycle as a list of workouts (A, B, C…), each assigned to a day of the cycle. The API keeps the
// tree cycle → day → workouts, so "assigning a day" moves the workout under that day number.

export interface CycleWorkout {
  workout: Workout;
  dayNumber: number;
}

export function cycleWorkouts(cycle: Cycle): CycleWorkout[] {
  return [...cycle.days]
    .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber))
    .flatMap((day) => day.workouts.map((workout) => ({ workout, dayNumber: Number(day.dayNumber) })));
}

/** "Workout A", "Workout B", … continuing after the workouts already in the cycle. */
export function nextWorkoutLetter(cycle: Cycle): string {
  const count = cycle.days.reduce((n, d) => n + d.workouts.length, 0);
  let n = count;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Adds a workout to a cycle on the given day (default: the first day without a workout, else day 1). */
export function addCycleWorkout(doc: TrainingDocument, cycleId: string, name: string, dayNumber?: number): { doc: TrainingDocument; id: string | null } {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return { doc, id: null };
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const length = Number(cycle.dayCount);
  const used = new Set(cycle.days.filter((d) => d.workouts.length).map((d) => Number(d.dayNumber)));
  const day = dayNumber ?? (Array.from({ length }, (_, i) => i + 1).find((n) => !used.has(n)) ?? 1);
  const workout = newWorkout(name);
  const existing = cycle.days.find((d) => Number(d.dayNumber) === day);
  const days = existing
    ? cycle.days.map((d) => (d === existing ? { ...d, workouts: [...d.workouts, workout] } : d))
    : [...cycle.days, { ...newDay(day), workouts: [workout] }].sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  return { doc: updateNode(doc, cycleId, { days }), id: workout.id };
}

/**
 * The cycle without this workout. A day left with no workouts and no note is removed. Returns the day it was on,
 * so reconnecting it elsewhere can keep that day when it fits.
 */
export function withoutWorkout(cycle: Cycle, workoutId: string): { cycle: Cycle; workout: Workout | null; dayNumber: number | null } {
  const day = cycle.days.find((d) => d.workouts.some((w) => w.id === workoutId));
  if (!day) return { cycle, workout: null, dayNumber: null };
  const workout = day.workouts.find((w) => w.id === workoutId)!;
  const days = cycle.days
    .map((d) => (d === day ? { ...d, workouts: d.workouts.filter((w) => w.id !== workoutId) } : d))
    .filter((d) => d.workouts.length > 0 || d.note);
  return { cycle: { ...cycle, days }, workout, dayNumber: Number(day.dayNumber) };
}

/** The cycle with this workout on a day: the wanted day when it exists in the cycle, else the first free day, else day 1. */
export function withWorkout(cycle: Cycle, workout: Workout, dayNumber?: number | null): Cycle {
  const length = Number(cycle.dayCount);
  const used = new Set(cycle.days.filter((d) => d.workouts.length).map((d) => Number(d.dayNumber)));
  const day = dayNumber && dayNumber >= 1 && dayNumber <= length ? dayNumber : (Array.from({ length }, (_, i) => i + 1).find((n) => !used.has(n)) ?? 1);
  const existing = cycle.days.find((d) => Number(d.dayNumber) === day);
  const days = existing
    ? cycle.days.map((d) => (d === existing ? { ...d, workouts: [...d.workouts, workout] } : d))
    : [...cycle.days, { ...newDay(day), workouts: [workout] }].sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  return { ...cycle, days };
}

/**
 * How many times a cycle runs in a row: its set number, else once. The plan's only cycle left unset runs until the
 * plan is stopped (null), the same rule the server uses when it schedules workouts.
 */
export function cycleRuns(doc: TrainingDocument, cycle: Cycle): number | null {
  if (cycle.repeats != null) return Number(cycle.repeats);
  return doc.blocks.reduce((n, b) => n + b.cycles.length, 0) === 1 ? null : 1;
}

/** Options for a cycle's repeat count; "open" (until stopped) only when the cycle is the plan's only one. */
export const REPEAT_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Whether the plan has a workout clients would get (inactive blocks are left out when changes are applied). */
export function hasActiveWorkout(doc: TrainingDocument): boolean {
  return doc.blocks.some((b) => !b.inactive && b.cycles.some((c) => c.days.some((d) => d.workouts.length > 0)));
}

/** Rows of a workout card on the sheet: header, column headings, one per exercise, and the add row when editable. */
export function workoutCardRows(workout: Workout, collapsed: boolean, editable: boolean): number {
  return collapsed ? 1 : 2 + workout.exercises.length + (editable ? 1 : 0);
}

/** Moves a workout to another day of its cycle; a day left with no workouts and no note is removed. */
export function moveWorkoutToDay(doc: TrainingDocument, workoutId: string, dayNumber: number): TrainingDocument {
  const at = locate(doc, workoutId);
  if (!at || at.kind !== "workout") return doc;
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  if (dayNumber < 1 || dayNumber > Number(cycle.dayCount)) return doc;
  const from = cycle.days[at.dayIndex!]!;
  if (Number(from.dayNumber) === dayNumber) return doc;
  const workout = from.workouts[at.workoutIndex!]!;
  let days = cycle.days.map((d) => (d === from ? { ...d, workouts: d.workouts.filter((w) => w.id !== workoutId) } : d));
  const target = days.find((d) => Number(d.dayNumber) === dayNumber);
  days = target
    ? days.map((d) => (d === target ? { ...d, workouts: [...d.workouts, workout] } : d))
    : [...days, { ...newDay(dayNumber), workouts: [workout] }];
  days = days.filter((d) => d.workouts.length > 0 || d.note).sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  return updateNode(doc, cycle.id, { days });
}

/** A copy of the workout (new ids) at the end of a day of the same cycle, which may be its own day. */
export function copyWorkoutToDay(doc: TrainingDocument, workoutId: string, dayNumber: number): TrainingDocument {
  const at = locate(doc, workoutId);
  if (!at || at.kind !== "workout") return doc;
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  if (dayNumber < 1 || dayNumber > Number(cycle.dayCount)) return doc;
  const copy = cloneWithNewIds(cycle.days[at.dayIndex!]!.workouts[at.workoutIndex!]!);
  const target = cycle.days.find((d) => Number(d.dayNumber) === dayNumber);
  const days = target
    ? cycle.days.map((d) => (d === target ? { ...d, workouts: [...d.workouts, copy] } : d))
    : [...cycle.days, { ...newDay(dayNumber), workouts: [copy] }].sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  return updateNode(doc, cycle.id, { days });
}

/** Moves an exercise to another position within its workout. */
export function reorderExercise(doc: TrainingDocument, instanceId: string, toIndex: number): TrainingDocument {
  const at = locate(doc, instanceId);
  if (!at || at.kind !== "exercise") return doc;
  const workout = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!.workouts[at.workoutIndex!]!;
  const target = Math.max(0, Math.min(toIndex, workout.exercises.length - 1));
  if (target === at.exerciseIndex) return doc;
  const exercises = workout.exercises.slice();
  const [moved] = exercises.splice(at.exerciseIndex!, 1);
  exercises.splice(target, 0, moved!);
  return updateNode(doc, workout.id, { exercises });
}

/** Moves a workout to another position within its day. */
export function reorderWorkout(doc: TrainingDocument, workoutId: string, toIndex: number): TrainingDocument {
  const at = locate(doc, workoutId);
  if (!at || at.kind !== "workout") return doc;
  const day = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!;
  const target = Math.max(0, Math.min(toIndex, day.workouts.length - 1));
  if (target === at.workoutIndex) return doc;
  const workouts = day.workouts.slice();
  const [moved] = workouts.splice(at.workoutIndex!, 1);
  workouts.splice(target, 0, moved!);
  return updateNode(doc, day.id, { workouts });
}

/**
 * Note for a day of the cycle (e.g. what to do on a rest day). A rest day only exists in the
 * document while it has a note; clearing the note of a day without workouts removes the day.
 */
export function withDayNote(cycle: Cycle, dayNumber: number, note: string): Cycle {
  if (dayNumber < 1 || dayNumber > Number(cycle.dayCount)) return cycle;
  const text = note.slice(0, 2000);
  const existing = cycle.days.find((d) => Number(d.dayNumber) === dayNumber);
  let days = existing
    ? cycle.days.map((d) => (d === existing ? { ...d, note: text.trim() ? text : null } : d))
    : text.trim()
      ? [...cycle.days, { ...newDay(dayNumber), note: text }]
      : cycle.days;
  days = days.filter((d) => d.workouts.length > 0 || d.note).sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber));
  return { ...cycle, days };
}

export function setDayNote(doc: TrainingDocument, cycleId: string, dayNumber: number, note: string): TrainingDocument {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return doc;
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const next = withDayNote(cycle, dayNumber, note);
  return next === cycle ? doc : updateNode(doc, cycle.id, { days: next.days });
}

/** Every day of the cycle in order, with its workouts (none = rest day) and note. */
export function cycleCalendar(cycle: Cycle): { dayNumber: number; workouts: Workout[]; note: string }[] {
  return Array.from({ length: Number(cycle.dayCount) }, (_, i) => {
    const day = cycle.days.find((d) => Number(d.dayNumber) === i + 1);
    return { dayNumber: i + 1, workouts: day?.workouts ?? [], note: day?.note ?? "" };
  });
}

// ---------------------------------------------------------------------------------------------
// Exercise row values. Every value is optional; editing one never touches the others.

export type LoadUnit = "rir" | "rpe" | "kg" | "lb";
export const LOAD_UNITS: LoadUnit[] = ["rir", "rpe", "kg", "lb"];

function first(instance: ExerciseInstance): Prescription {
  return instance.sets[0]?.prescription ?? {};
}

/** What the load cell shows and which unit its editor opens with (RIR when nothing is set). */
export function loadOf(p: Prescription): { unit: LoadUnit; value: number | null } {
  if (p.load) return { unit: p.load.minimum.unit === "Lb" ? "lb" : "kg", value: Number(p.load.minimum.value) };
  if (p.rpe != null) return { unit: "rpe", value: Number(p.rpe) };
  if (p.rir != null) return { unit: "rir", value: Number(p.rir) };
  return { unit: "rir", value: null };
}

export function formatLoadCell(locale: Locale, p: Prescription, formulaLabel?: (key: string) => string): string {
  if (p.loadFormula) return p.loadFormula.builtIn ? (formulaLabel?.(p.loadFormula.builtIn) ?? p.loadFormula.builtIn) : "ƒ";
  if (p.loadPercent != null) return `${formatNumber(locale, Number(p.loadPercent))}%`;
  const { unit, value } = loadOf(p);
  if (value === null) return "";
  if (unit === "rir") return `RIR ${formatNumber(locale, value)}`;
  if (unit === "rpe") return `RPE ${formatNumber(locale, value)}`;
  const max = p.load ? Number(p.load.maximum.value) : value;
  const range = max !== value ? `${formatNumber(locale, value)}–${formatNumber(locale, max)}` : formatNumber(locale, value);
  return `${range} ${unit === "lb" ? "lbs" : "kg"}`;
}

// ---------------------------------------------------------------------------------------------
// Time cells use one clock format: m:ss under an hour, h:mm:ss from an hour; plain digits are seconds.

export function seconds(q: { value: number | string; unit: string } | null | undefined): number | null {
  if (!q) return null;
  const v = Number(q.value);
  return q.unit === "Minutes" ? v * 60 : v;
}

export function formatClock(q: { value: number | string; unit: string } | null | undefined): string {
  const total = seconds(q);
  if (total === null) return "";
  const s = Math.round(total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "", "45" (seconds), "1:30" or "1:02:30". Minutes and seconds after a colon must be 0–59. */
export function parseClock(text: string): { ok: true; value: { value: number; unit: "Seconds" } | null } | { ok: false } {
  const raw = text.trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{1,6}(?::\d{1,2}){0,2}$/.test(raw)) return { ok: false };
  const parts = raw.split(":").map(Number);
  if (parts.slice(1).some((p) => p > 59)) return { ok: false };
  const total = parts.reduce((sum, part) => sum * 60 + part, 0);
  if (total > 24 * 3600) return { ok: false };
  return { ok: true, value: { value: total, unit: "Seconds" } };
}

export interface ExerciseRow {
  sets: string;
  reps: string;
  load: string;
  time: string;
  rest: string;
  /** Sets differ in a value shown here; typing makes them uniform. */
  mixed: boolean;
}

export function exerciseRow(locale: Locale, instance: ExerciseInstance, formulaLabel?: (key: string) => string): ExerciseRow {
  const p = first(instance);
  const shown = (x: Prescription) => JSON.stringify([x.reps, x.load, x.loadPercent, x.rpe, x.rir, x.workTime, x.rest, x.loadFormula]);
  const reps = p.reps ? (Number(p.reps.minimum) === Number(p.reps.maximum) ? `${p.reps.minimum}` : `${p.reps.minimum}–${p.reps.maximum}`) : "";
  return {
    sets: String(instance.sets.length),
    reps,
    load: formatLoadCell(locale, p, formulaLabel),
    time: formatClock(p.workTime),
    rest: formatClock(p.rest),
    mixed: instance.sets.some((s) => s.kind !== "Standard" || shown(s.prescription) !== shown(p)),
  };
}

function writeAll(doc: TrainingDocument, instanceId: string, fn: (p: Prescription) => Prescription): TrainingDocument {
  const found = findExercise(doc, instanceId);
  if (!found) return doc;
  return updateNode(doc, instanceId, { sets: found.exercise.sets.map((s) => ({ ...s, prescription: fn({ ...s.prescription }) })) });
}

/** Number of sets (1–50). New sets copy the first set's values. */
export function setExerciseSets(doc: TrainingDocument, instanceId: string, text: string): TrainingDocument | null {
  const count = Number(text.trim());
  if (!Number.isInteger(count) || count < 1 || count > 50) return null;
  const found = findExercise(doc, instanceId);
  if (!found) return null;
  const sets = found.exercise.sets;
  const template = sets[0]?.prescription ?? {};
  const next: TrainingSet[] = Array.from({ length: count }, (_, i) => sets[i] ?? newSet("Standard", copyPrescription(template)));
  return updateNode(doc, instanceId, { sets: next });
}

/** "8", "8-10" or empty (no reps). */
export function setExerciseReps(doc: TrainingDocument, instanceId: string, text: string): TrainingDocument | null {
  const parsed = parseReps(text);
  if (!parsed.ok) return null;
  return writeAll(doc, instanceId, (p) => ({ ...p, reps: parsed.value }));
}

/** One load column: RIR, RPE, kg or lbs. Setting it replaces whatever load the column held before. */
export function setExerciseLoad(locale: Locale, doc: TrainingDocument, instanceId: string, unit: LoadUnit, text: string): TrainingDocument | null {
  const raw = text.trim();
  const value = raw === "" ? null : parseLocaleNumber(locale, raw);
  if (raw !== "" && (value === null || value < 0)) return null;
  if (value !== null && (unit === "rir" || unit === "rpe") && value > (unit === "rpe" ? 10 : 20)) return null;
  return writeAll(doc, instanceId, (p) => {
    const next: Prescription = { ...p };
    delete next.load;
    delete next.loadPercent;
    delete next.baseValue;
    delete next.loadFormula;
    next.rpe = null;
    next.rir = null;
    if (value === null) return next;
    if (unit === "rir") next.rir = value;
    else if (unit === "rpe") next.rpe = value;
    else {
      const q = { value, unit: unit === "lb" ? ("Lb" as const) : ("Kg" as const) };
      next.load = { minimum: q, maximum: q };
    }
    return next;
  });
}

/** Work time or rest in clock form ("45", "1:30", "1:02:30") or empty. */
export function setExerciseDuration(_locale: Locale, doc: TrainingDocument, instanceId: string, field: "workTime" | "rest", text: string): TrainingDocument | null {
  const parsed = parseClock(text);
  if (!parsed.ok) return null;
  return writeAll(doc, instanceId, (p) => ({ ...p, [field]: parsed.value }));
}

// ---------------------------------------------------------------------------------------------
// Expanded cycle layout in sheet cells.

/** Exercise (2) · sets · reps · load · time · rest · comment (2). */
export const WORKOUT_COLUMNS = [
  { id: "exercise", span: 2 },
  { id: "sets", span: 1 },
  { id: "reps", span: 1 },
  { id: "load", span: 1 },
  { id: "time", span: 1 },
  { id: "rest", span: 1 },
  { id: "comment", span: 2 },
] as const;
export const WORKOUT_COLS = WORKOUT_COLUMNS.reduce((n, c) => n + c.span, 0);

export type WorkoutRow =
  | { type: "workout"; workout: Workout; dayNumber: number; collapsed: boolean }
  | { type: "exercise"; workout: Workout; instance: ExerciseInstance }
  | { type: "add-exercise"; workout: Workout }
  | { type: "add-workout" };

/** Card header + sticky column headings, then workouts one under another. */
export const EXPANDED_TOP_ROWS = 2;

export function workoutRows(cycle: Cycle, collapsed: ReadonlySet<string>, editable: boolean): WorkoutRow[] {
  const rows: WorkoutRow[] = [];
  for (const { workout, dayNumber } of cycleWorkouts(cycle)) {
    const isCollapsed = collapsed.has(workout.id);
    rows.push({ type: "workout", workout, dayNumber, collapsed: isCollapsed });
    if (isCollapsed) continue;
    for (const instance of workout.exercises) rows.push({ type: "exercise", workout, instance });
    if (editable) rows.push({ type: "add-exercise", workout });
  }
  if (editable) rows.push({ type: "add-workout" });
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Volume per primary muscle, secondary muscle or movement pattern. Each exercise counts fully for
// every key it lists. Metrics per set: reps (middle of a range), hard sets (RPE ≥ 7, RIR ≤ 3 or
// AMRAP) and tonnage (reps × absolute load in kg; percentages and formulas have no known weight).

export type VolumeBy = "primary" | "secondary" | "patterns";

export interface Taxonomy {
  movementPatternKeys: string[];
  primaryMuscleKeys: string[];
  secondaryMuscleKeys?: string[];
}

export interface VolumeStats {
  sets: number;
  reps: number;
  hardSets: number;
  tonnage: number;
}

export interface VolumeLine {
  key: string;
  perWorkout: Record<string, VolumeStats>;
  total: VolumeStats;
}

const LB = 0.45359237;
const emptyStats = (): VolumeStats => ({ sets: 0, reps: 0, hardSets: 0, tonnage: 0 });

function repsOf(set: TrainingSet): number {
  const r = set.prescription.reps;
  return r ? (Number(r.minimum) + Number(r.maximum)) / 2 : 0;
}

function kgOf(set: TrainingSet): number {
  const load = set.prescription.load;
  if (!load) return 0;
  const toKg = (q: { value: number | string; unit: string }) => Number(q.value) * (q.unit === "Lb" ? LB : 1);
  return (toKg(load.minimum) + toKg(load.maximum)) / 2;
}

function isHard(set: TrainingSet): boolean {
  const p = set.prescription;
  if (set.kind === "Amrap") return true;
  if (p.rpe !== null && p.rpe !== undefined) return Number(p.rpe) >= 7;
  if (p.rir !== null && p.rir !== undefined) return Number(p.rir) <= 3;
  return false;
}

/** Metrics of one exercise instance (all its sets). */
export function exerciseStats(instance: ExerciseInstance): VolumeStats {
  const stats = emptyStats();
  for (const set of instance.sets) {
    const reps = repsOf(set);
    stats.sets += 1;
    stats.reps += reps;
    stats.hardSets += isHard(set) ? 1 : 0;
    stats.tonnage += reps * kgOf(set);
  }
  return stats;
}

function add(into: VolumeStats, from: VolumeStats) {
  into.sets += from.sets;
  into.reps += from.reps;
  into.hardSets += from.hardSets;
  into.tonnage += from.tonnage;
}

/** Totals over workouts, counting each exercise once. */
export function workoutsStats(workouts: Workout[]): VolumeStats {
  const total = emptyStats();
  for (const workout of workouts) for (const instance of workout.exercises) add(total, exerciseStats(instance));
  return total;
}

function keysOf(info: Taxonomy | undefined, by: VolumeBy): string[] {
  if (!info) return [];
  if (by === "patterns") return info.movementPatternKeys;
  if (by === "secondary") return info.secondaryMuscleKeys ?? [];
  return info.primaryMuscleKeys;
}

/** Lines per key over the given workouts. Exercises without the key type count as "—" (not for secondary muscles). */
export function volumeLines(workouts: Workout[], taxonomy: (exerciseId: string) => Taxonomy | undefined, by: VolumeBy): VolumeLine[] {
  const lines = new Map<string, VolumeLine>();
  for (const workout of workouts) {
    for (const instance of workout.exercises) {
      const keys = keysOf(taxonomy(instance.exerciseId), by);
      const stats = exerciseStats(instance);
      for (const key of keys.length ? keys : by === "secondary" ? [] : ["—"]) {
        const line = lines.get(key) ?? { key, perWorkout: {}, total: emptyStats() };
        const cell = line.perWorkout[workout.id] ?? emptyStats();
        add(cell, stats);
        add(line.total, stats);
        line.perWorkout[workout.id] = cell;
        lines.set(key, line);
      }
    }
  }
  return [...lines.values()].sort((a, b) => b.total.sets - a.total.sets || a.key.localeCompare(b.key));
}

export function cycleVolume(cycle: Cycle, taxonomy: (exerciseId: string) => Taxonomy | undefined, by: VolumeBy): { workouts: CycleWorkout[]; lines: VolumeLine[] } {
  const workouts = cycleWorkouts(cycle);
  return { workouts, lines: volumeLines(workouts.map((w) => w.workout), taxonomy, by) };
}
