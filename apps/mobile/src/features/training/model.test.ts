import { describe, expect, it } from "vitest";
import {
    blankSet,
    decimal,
    describePrescription,
    executionDraft,
    pickerDate,
    localDate,
    restRemaining,
    type WorkoutDetail,
} from "./model";

describe("mobile execution adapter", () => {
    it("accepts Polish decimal separators and keeps unknowns null", () => {
        expect(decimal("72,5")).toBe(72.5);
        expect(decimal("")).toBeNull();
        expect(() => decimal("Infinity")).toThrow();
        expect(() => decimal("-1")).toThrow();
        expect(decimal("-2,5", true)).toBe(-2.5);
    });
    it("keeps all actual dimensions instead of inferring performance", () => {
        expect(blankSet("set", "segment")).toMatchObject({
            prescribedSetId: "set",
            prescribedSegmentId: "segment",
            load: null,
            reps: null,
            durationSeconds: null,
            distanceMeters: null,
            rpe: null,
            rir: null,
            tempo: null,
            skipped: false,
        });
    });
    it("retains per-segment links in initial execution without copying planned load", () => {
        const detail = {
            execution: null,
            prescription: {
                workout: {
                    exercises: [
                        {
                            id: "instance",
                            exerciseId: "exercise",
                            sets: [
                                {
                                    id: "set",
                                    segments: [
                                        { id: "segment1" },
                                        { id: "segment2" },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        } as unknown as WorkoutDetail;
        const draft = executionDraft(detail);
        expect(
            draft.exercises[0]!.sets.map((set) => set.prescribedSegmentId),
        ).toEqual(["segment1", "segment2"]);
        expect(
            draft.exercises[0]!.sets.every(
                (set) => set.load === null && set.reps === null,
            ),
        ).toBe(true);
    });
    it("copies persisted actuals independently of newer prescription", () => {
        const detail = {
            execution: {
                performedDate: "2026-10-10",
                comment: "actual",
                durationSeconds: 30,
                exercises: [
                    {
                        prescribedInstanceId: "original",
                        exerciseId: "substitute",
                        comment: "note",
                        sets: [
                            { ...blankSet(), load: 70, loadUnit: "kg", rpe: 8 },
                        ],
                    },
                ],
            },
        } as unknown as WorkoutDetail;
        expect(executionDraft(detail).exercises[0]).toMatchObject({
            exerciseId: "substitute",
            sets: [{ load: 70, rpe: 8 }],
        });
    });
    it("describes rich prescriptions including RIR zero", () => {
        expect(
            describePrescription({
                reps: { minimum: 3, maximum: 5 },
                loadPercent: 80,
                rpe: 8,
                rir: 0,
                tempo: "3010",
                workTime: { value: 20, unit: "Seconds" },
                distance: { value: 100, unit: "Meters" },
                rest: { value: 60, unit: "Seconds" },
            }),
        ).toContain("RIR 0");
        expect(
            describePrescription({ distance: { value: 100, unit: "Meters" } }),
        ).toBe("100 Meters");
    });
    it("uses wall clock expiry after suspension rather than decrement ticks", () => {
        expect(restRemaining(150000, 100000)).toBe(50);
        expect(restRemaining(150000, 151000)).toBe(0);
        expect(restRemaining(null)).toBe(0);
    });
    it("keeps picker dates in the local calendar and rejects overflow", () => {
        expect(localDate(pickerDate("2026-10-25", "date")!)).toBe("2026-10-25");
        expect(pickerDate("2026-02-31", "date")).toBeNull();
        expect(pickerDate("", "date")).toBeNull();
        expect(pickerDate("25:00:00", "time")).toBeNull();
        expect(pickerDate("09:30:00", "time")?.getHours()).toBe(9);
    });
});
