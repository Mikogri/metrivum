/**
 * The coach picks any exercise from the catalog. The analysis engine only knows three barbell lifts, so the
 * exercise name is mapped to the closest one; anything else is "unspecified" and the engine classifies it itself.
 */
export type EngineMovement = 'squat' | 'bench-press' | 'deadlift' | 'unspecified';

const LABELS: Record<EngineMovement, string> = { squat: 'Squat', 'bench-press': 'Bench press', deadlift: 'Deadlift', unspecified: 'Not specified' };

export function engineMovement(exercise: string): EngineMovement {
  const name = exercise.toLowerCase();
  if (/bench|wyciskanie.*(ławk|lawk|leż|lez)/.test(name)) return 'bench-press';
  if (/squat|przysiad/.test(name)) return 'squat';
  if (/deadlift|martwy ci[aą]g|\brdl\b/.test(name)) return 'deadlift';
  return 'unspecified';
}

/** What to call the movement of an analysis: the chosen exercise, or the engine movement for older analyses. */
export function movementLabel(configuration: { movement?: string | null; exercise?: string | null } | null | undefined) {
  if (configuration?.exercise) return configuration.exercise;
  return LABELS[(configuration?.movement ?? 'unspecified') as EngineMovement] ?? configuration?.movement ?? LABELS.unspecified;
}

// The local analyzer stores only the engine movement, so the exercise chosen for a queued video is kept in
// this browser until the result is saved.
const KEY = 'trainflow.analyzer.exercises';
function read(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}
export function rememberJobExercise(jobId: string, exercise: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [jobId]: exercise })); } catch { /* private browsing */ }
}
export function jobExercise(jobId: string): string | null {
  return read()[jobId] ?? null;
}
export function forgetJobExercise(jobId: string) {
  const all = read();
  if (!(jobId in all)) return;
  delete all[jobId];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private browsing */ }
}

export type AnalysisLabel = { movement?: string | null; exercise?: string | null } | null | undefined;

/** The five competition lifts: powerlifting (squat, bench press, deadlift) and weightlifting (snatch, clean and jerk). */
export const LIFTS = ['Squat', 'Bench press', 'Deadlift', 'Snatch', 'Clean and jerk'] as const;

/** Whether an analysis shows the given lift, by its engine movement or the chosen exercise's name. */
export function isLift(lift: string, configuration: AnalysisLabel): boolean {
  const name = (configuration?.exercise ?? '').toLowerCase();
  const engine = configuration?.exercise ? engineMovement(name) : configuration?.movement;
  switch (lift) {
    case 'Squat': return engine === 'squat';
    case 'Bench press': return engine === 'bench-press';
    case 'Deadlift': return engine === 'deadlift';
    case 'Snatch': return /snatch|rwanie/.test(name);
    case 'Clean and jerk': return /clean|jerk|podrzut|zarzut/.test(name);
    default: return false;
  }
}
