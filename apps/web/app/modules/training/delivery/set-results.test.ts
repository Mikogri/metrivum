import { expect, it } from "vitest";
import { recordedSetPredicate } from "./set-results";
import type { Workout } from "@metrivum/api-client-web";

it("shows logged maximum efforts as done without requiring or inventing results", () => {
  const plan: Workout["exercises"] = [
    {
      id: "exercise",
      exerciseId: "bench",
      comment: "",
      sets: [
        { id: "reps", kind: "Amrap", prescription: {} },
        { id: "time", kind: "Standard", prescription: { workTimeMax: true } },
        {
          id: "fixed",
          kind: "Standard",
          prescription: { reps: { minimum: 5, maximum: 5 } },
        },
      ],
    },
  ];
  const recorded = recordedSetPredicate(plan);
  const actual = {
    skipped: false,
    prescribedSetId: "reps",
    prescribedSegmentId: null,
    reps: null,
    durationSeconds: null,
    distanceMeters: null,
    load: null,
  };
  expect(recorded(actual)).toBe(true);
  expect(recorded({ ...actual, prescribedSetId: "time" })).toBe(true);
  expect(recorded({ ...actual, skipped: true })).toBe(false);
  expect(recorded({ ...actual, prescribedSetId: "fixed" })).toBe(false);
  expect(recorded({ ...actual, prescribedSetId: "unknown" })).toBe(false);
  expect(recorded({ ...actual, prescribedSetId: null })).toBe(false);
  expect(actual.reps).toBeNull();
  expect(actual.durationSeconds).toBeNull();
});
