import type { Prescription, Schema } from "@trainflow/api-client-web";

export type Page<T> = {
    items: T[];
    page: number;
    pageSize: number;
    total: number;
};
export type WorkoutDetail = Schema<"WorkoutDetailDto">;
export type ExecutionDraft = Schema<"SaveExecutionRequest">;
export type ActualSet = Schema<"ActualSet">;
export function localDate(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function pickerDate(value: string, mode: "date" | "time"): Date | null {
    if (mode === "time") {
        const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
        if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
            return null;
        const date = new Date();
        date.setHours(Number(match[1]), Number(match[2]), 0, 0);
        return date;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
    );
    return localDate(date) === value ? date : null;
}
export function decimal(text: string, allowNegative = false): number | null {
    if (!text.trim()) return null;
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || (!allowNegative && value < 0))
        throw new Error("Enter a valid number.");
    return value;
}
export function blankSet(
    prescribedSetId: string | null = null,
    prescribedSegmentId: string | null = null,
): ActualSet {
    return {
        prescribedSetId,
        prescribedSegmentId,
        skipped: false,
        reps: null,
        load: null,
        loadUnit: null,
        loadMeaning: "TotalExternal",
        rpe: null,
        rir: null,
        durationSeconds: null,
        distanceMeters: null,
        restSeconds: null,
        tempo: null,
        comment: null,
    };
}
export function executionDraft(detail: WorkoutDetail): ExecutionDraft {
    const execution = detail.execution;
    return {
        performedDate: execution?.performedDate || localDate(),
        comment: execution?.comment || "",
        durationSeconds: execution?.durationSeconds ?? null,
        exercises: execution?.exercises.length
            ? execution.exercises.map(
                  ({ prescribedInstanceId, exerciseId, comment, sets }) => ({
                      prescribedInstanceId,
                      exerciseId,
                      comment,
                      sets,
                  }),
              )
            : detail.prescription.workout.exercises.map((exercise) => ({
                  prescribedInstanceId: exercise.id,
                  exerciseId: exercise.exerciseId,
                  comment: "",
                  sets: exercise.sets.flatMap((set) =>
                      set.segments?.length
                          ? set.segments.map((segment) =>
                                blankSet(set.id, segment.id),
                            )
                          : [blankSet(set.id)],
                  ),
              })),
    };
}
export function describePrescription(p: Prescription): string {
    return (
        [
            p.reps && `${p.reps.minimum}–${p.reps.maximum} reps`,
            p.load &&
                `${p.load.minimum.value}–${p.load.maximum.value} ${p.load.minimum.unit}`,
            p.loadPercent != null && `${p.loadPercent}% 1RM`,
            p.rpe != null && `RPE ${p.rpe}`,
            p.rir != null && `RIR ${p.rir}`,
            p.workTime && `${p.workTime.value} ${p.workTime.unit}`,
            p.distance && `${p.distance.value} ${p.distance.unit}`,
            p.rest && `rest ${p.rest.value} ${p.rest.unit}`,
            p.tempo && `tempo ${p.tempo}`,
            p.comment,
        ]
            .filter(Boolean)
            .join(" · ") || "No prescribed values"
    );
}
export function restRemaining(endAt: number | null, now = Date.now()) {
    return endAt == null ? 0 : Math.max(0, Math.ceil((endAt - now) / 1000));
}
