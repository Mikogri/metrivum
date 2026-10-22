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
