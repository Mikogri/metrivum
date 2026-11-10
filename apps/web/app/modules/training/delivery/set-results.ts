import type {
  Prescription,
  TrainingSet,
  Workout,
} from "@metrivum/api-client-web";

type Actual = {
  skipped: boolean;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  load: number | null;
  prescribedSetId: string | null;
  prescribedSegmentId: string | null;
};
type Target = {
  kind: string;
  prescription: Prescription;
  segments?: TrainingSet["segments"];
};

export function isRecordedSet(actual: Actual, target?: Target) {
  if (actual.skipped) return false;
  if (
    actual.reps != null ||
    actual.durationSeconds != null ||
    actual.distanceMeters != null ||
    actual.load != null
  )
    return true;
  if (actual.prescribedSegmentId)
    return (
      target?.segments?.some(
        (segment) =>
          segment.id === actual.prescribedSegmentId &&
          segment.prescription.workTimeMax === true,
      ) ?? false
    );
  return target?.kind === "Amrap" || target?.prescription.workTimeMax === true;
}

/** Match the frozen prescription once; blank maximum results are recorded, not skipped or zero. */
export function recordedSetPredicate(plan: Workout["exercises"]) {
  const targets = new Map(
    plan.flatMap((exercise) =>
      exercise.sets.map((set) => [set.id, set] as const),
    ),
  );
  return (actual: Actual) =>
    isRecordedSet(actual, targets.get(actual.prescribedSetId ?? ""));
}
