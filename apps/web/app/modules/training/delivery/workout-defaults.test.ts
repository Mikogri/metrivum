import { expect, it } from "vitest";
import { asPlanned } from "./WorkoutLog";
it("prefills the upper repetition target for ordinary and segmented sets", () => {
  const prescription = (minimum: number, maximum: number) => ({
    reps: { minimum, maximum },
  });
  const detail = {
    prescription: {
      exercises: {},
      workout: {
        exercises: [
          {
            id: "instance",
            exerciseId: "exercise",
            sets: [
              { id: "range", prescription: prescription(10, 12) },
              { id: "fixed", prescription: prescription(8, 8) },
              {
                id: "segments",
                prescription: {},
                segments: [{ id: "segment", prescription: prescription(3, 5) }],
              },
              { id: "amrap", kind: "Amrap", prescription: {} },
            ],
          },
        ],
      },
    },
  } as unknown as Parameters<typeof asPlanned>[0];
  expect(asPlanned(detail)[0]!.sets.map((set) => set.reps)).toEqual([
    12,
    8,
    5,
    null,
  ]);
});
