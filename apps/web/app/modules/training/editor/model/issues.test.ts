import { describe, expect, it } from "vitest";
import type { TrainingDocument, TrainingSet } from "@trainflow/api-client-web";
import { documentIssues } from "./issues";

const labels = { day: (n: number) => `Day ${n}`, set: (n: number) => `Set ${n}`, exercise: () => "Squat", untitled: "Untitled" };
const set = (patch: Partial<TrainingSet> = {}): TrainingSet => ({ id: crypto.randomUUID(), kind: "Standard", prescription: { reps: { minimum: 5, maximum: 5 } }, segments: [], ...patch }) as TrainingSet;
const doc = (sets: TrainingSet[], workoutName = "Workout A"): TrainingDocument => ({
  schemaVersion: 1,
  blocks: [{ id: "b", name: "Block 1", description: "", cycles: [{ id: "c", name: "Cycle 1", description: "", dayCount: 7, days: [{ id: "d", dayNumber: 2, workouts: [{ id: "w", name: workoutName, description: "", groups: [], exercises: [{ id: "e", exerciseId: "11111111-0000-4000-8000-000000000001", comment: "", sets }] }] }] }] }],
}) as unknown as TrainingDocument;

describe("documentIssues", () => {
  it("accepts a valid plan", () => {
    expect(documentIssues(doc([set(), set({ kind: "Amrap", prescription: {} })]), labels)).toEqual([]);
  });

  it("says where a problem is and what it is", () => {
    const issues = documentIssues(doc([set(), set({ prescription: { reps: { minimum: 8, maximum: 5 }, tempo: "31X0" } })]), labels);
    expect(issues).toEqual([
      { code: "reps", path: ["Block 1", "Cycle 1", "Day 2", "Workout A", "Squat", "Set 2"] },
      { code: "tempo", path: ["Block 1", "Cycle 1", "Day 2", "Workout A", "Squat", "Set 2"] },
    ]);
  });

  it("mirrors the server's set rules", () => {
    const codes = documentIssues(doc([
      set({ kind: "Amrap", prescription: { reps: { minimum: 5, maximum: 5 } } }),
      set({ kind: "BackOff", sourceSetId: "missing" }),
      set({ kind: "DropSet", segments: [] }),
      set({ prescription: { rpe: 8, rir: 2 } }),
      set({ prescription: { loadPercent: 80 } }),
    ], ""), labels).map((issue) => issue.code);
    expect(codes).toEqual(["workoutName", "amrapReps", "backOffSource", "segments", "rpeRir", "percent"]);
  });
});
