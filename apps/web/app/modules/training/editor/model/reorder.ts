import type { TrainingDocument } from "@metrivum/api-client-web";
import { findWorkout, updateNode } from "./document";

/** Moves an exercise instance to a target index inside its workout (drag and drop). */
export function moveExerciseTo(
  doc: TrainingDocument,
  workoutId: string,
  instanceId: string,
  targetIndex: number,
): TrainingDocument {
  const workout = findWorkout(doc, workoutId);
  if (!workout) return doc;
  const from = workout.exercises.findIndex((e) => e.id === instanceId);
  if (from < 0) return doc;
  const exercises = workout.exercises.slice();
  const [item] = exercises.splice(from, 1);
  const to = Math.max(
    0,
    Math.min(
      exercises.length,
      targetIndex > from ? targetIndex - 1 : targetIndex,
    ),
  );
  exercises.splice(to, 0, item!);
  return updateNode(doc, workoutId, { exercises });
}
