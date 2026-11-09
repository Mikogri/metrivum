import { MAX_REPS } from "./notation";
import type { Prescription, TrainingDocument, TrainingSet } from "@metrivum/api-client-web";

/**
 * Client-side mirror of the server's training-document rules (TrainingDocument.Validate), so the
 * editor and the plan page can say *where* the format is wrong before "Apply changes" is refused.
 * The server stays authoritative; this only covers what a coach can get wrong in the sheet.
 */
export type IssueCode =
  | "workoutName"
  | "exerciseMissing"
  | "segments"
  | "amrapReps"
  | "backOffSource"
  | "reps"
  | "loadRange"
  | "loadExclusive"
  | "percent"
  | "rpeRir"
  | "tempo"
  | "quantity"
  | "group";

export interface DocumentIssue {
  code: IssueCode;
  /** Place in the plan, outermost first: block, cycle, day, workout, exercise, set. */
  path: string[];
}

export interface IssueLabels {
  day: (n: number) => string;
  set: (n: number) => string;
  exercise: (id: string) => string;
  untitled: string;
}

const SEGMENTED = new Set(["Ramp", "DropSet", "RestPause", "Cluster"]);
const TEMPO = /^(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)$/;
const MAX_SEGMENTS = 20;

function quantityOk(q: { value: number | string } | null | undefined) {
  if (!q) return true;
  const v = Number(q.value);

  return Number.isFinite(v) && v >= 0 && v <= 1_000_000_000;
}

function prescriptionIssues(p: Prescription | null | undefined): IssueCode[] {
  if (!p) return ["quantity"];
  const found: IssueCode[] = [];

  if (p.reps) {
    const min = Number(p.reps.minimum),
      max = Number(p.reps.maximum);

    if (
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      !(min >= 1) ||
      !(max >= min) ||
      max > MAX_REPS
    )
      found.push("reps");
  }
  if (p.load) {
    if (!quantityOk(p.load.minimum) || !quantityOk(p.load.maximum)) found.push("quantity");
    else if (
      p.load.minimum.unit === p.load.maximum.unit &&
      Number(p.load.maximum.value) < Number(p.load.minimum.value)
    )
      found.push("loadRange");
  }
  if ([p.load, p.loadPercent, p.loadFormula].filter((v) => v != null).length > 1)
    found.push("loadExclusive");
  if (
    p.loadPercent != null &&
    (!(Number(p.loadPercent) > 0) || Number(p.loadPercent) > 1000 || !p.baseValue)
  )
    found.push("percent");
  if (p.baseValue && p.loadPercent == null) found.push("percent");
  const rpe = p.rpe == null ? null : Number(p.rpe),
    rir = p.rir == null ? null : Number(p.rir);

  if (
    (rpe != null && (rpe < 0 || rpe > 10)) ||
    (rir != null && (rir < 0 || rir > 100)) ||
    (rpe != null && rir != null)
  )
    found.push("rpeRir");
  if (p.workTimeMax && (p.workTime || p.fieldFormulas?.WorkTime)) found.push("quantity");
  if (p.tempo != null && !TEMPO.test(p.tempo)) found.push("tempo");
  if (![p.baseValue, p.workTime, p.rest, p.distance].every(quantityOk)) found.push("quantity");
  return found;
}

function setIssues(set: TrainingSet, earlierTopSets: Set<string>): IssueCode[] {
  const found = prescriptionIssues(set.prescription);
  const segments = set.segments ?? [];

  if (
    SEGMENTED.has(set.kind)
      ? segments.length < 2 || segments.length > MAX_SEGMENTS
      : segments.length !== 0
  )
    found.push("segments");
  if (set.kind === "Amrap" && (set.prescription?.reps || set.prescription?.fieldFormulas?.Reps))
    found.push("amrapReps");
  if (set.kind === "BackOff" && set.sourceSetId && !earlierTopSets.has(set.sourceSetId))
    found.push("backOffSource");
  for (const segment of segments)
    for (const code of prescriptionIssues(segment.prescription))
      if (!found.includes(code)) found.push(code);
  return found;
}

export function documentIssues(doc: TrainingDocument, labels: IssueLabels): DocumentIssue[] {
  const issues: DocumentIssue[] = [];

  for (const block of doc.blocks) {
    for (const cycle of block.cycles) {
      for (const day of cycle.days) {
        for (const workout of day.workouts) {
          const at = [
            ...(block.implicit ? [] : [block.name || labels.untitled]),
            ...(cycle.implicit
              ? []
              : [cycle.name || labels.untitled, labels.day(Number(day.dayNumber))]),
            workout.name || labels.untitled,
          ];

          if (!workout.name?.trim()) issues.push({ code: "workoutName", path: at });
          for (const exercise of workout.exercises) {
            const name = labels.exercise(exercise.exerciseId);

            if (!exercise.exerciseId || /^0{8}-/.test(exercise.exerciseId))
              issues.push({ code: "exerciseMissing", path: [...at, name] });
            const topSets = new Set<string>();
            exercise.sets.forEach((set, index) => {
              for (const code of setIssues(set, topSets))
                issues.push({ code, path: [...at, name, labels.set(index + 1)] });
              if (set.kind === "TopSet") topSets.add(set.id);
            });
          }
          const ids = new Set(workout.exercises.map((e) => e.id));
          const used = new Set<string>();

          for (const group of workout.groups) {
            const rounds = group.rounds == null ? null : Number(group.rounds);
            const rest = group.restSeconds == null ? null : Number(group.restSeconds);
            const shape =
              group.exerciseIds.length < 2 ||
              (group.kind === "Superset" && group.exerciseIds.length !== 2) ||
              (rounds != null && (rounds < 1 || rounds > 100)) ||
              (rest != null && (rest < 0 || rest > 86400));
            const overlap = group.exerciseIds.some((id) => !ids.has(id) || used.has(id));
            group.exerciseIds.forEach((id) => used.add(id));
            if (shape || overlap) issues.push({ code: "group", path: at });
          }
        }
      }
    }
  }
  return issues;
}
