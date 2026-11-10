import { describe, expect, it } from "vitest";
import {
  addBlock,
  addCycle,
  addExercise,
  addSet,
  addWorkout,
  addDay,
  changeSetKind,
  emptyDocument,
  updateNode,
} from "./document";
import { usesProFeatures } from "./pro-features";

function week(dayCount = 7) {
  const block = addBlock(emptyDocument(), "Plan");
  const cycle = addCycle(block.doc, block.id, "Week", dayCount);
  const day = addDay(cycle.doc, cycle.id!, 1);
  const workout = addWorkout(day.doc, day.id!, "A");
  const exercise = addExercise(workout.doc, workout.id!, "squat");
  const set = addSet(exercise.doc, exercise.id!);
  return {
    doc: set.doc,
    blockId: block.id,
    cycleId: cycle.id!,
    setId: set.id!,
  };
}

describe("plans made with Pro tools", () => {
  it("treats a plain one-week plan as basic", () => {
    expect(usesProFeatures(emptyDocument())).toBe(false);
    expect(usesProFeatures(week().doc)).toBe(false);
  });

  it("flags custom cycle lengths, extra cycles and blocks", () => {
    expect(usesProFeatures(week(10).doc)).toBe(true);
    const { doc, blockId, cycleId } = week();
    expect(usesProFeatures(addCycle(doc, blockId, "Week 2").doc)).toBe(true);
    expect(usesProFeatures(addBlock(doc, "Block 2").doc)).toBe(true);
    expect(usesProFeatures(updateNode(doc, cycleId, { dayCount: 5 }))).toBe(
      true,
    );
  });

  it("flags advanced set types", () => {
    const { doc, setId } = week();
    expect(usesProFeatures(changeSetKind(doc, setId, "TopSet"))).toBe(true);
  });
});
