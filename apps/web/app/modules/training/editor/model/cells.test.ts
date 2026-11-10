import { describe, expect, it } from "vitest";
import {
  addBlock,
  addCycle,
  addDay,
  addExercise,
  addWorkout,
  emptyDocument,
  findExercise,
} from "./document";
import {
  applyLoad,
  applyProgression,
  applySetsReps,
  cycleGrid,
  exerciseCells,
} from "./cells";

function plan(cycles = 3) {
  let doc = emptyDocument();
  const block = addBlock(doc, "Block");
  doc = block.doc;
  const instances: string[] = [];
  for (let c = 0; c < cycles; c++) {
    const cycle = addCycle(doc, block.id, `C${c + 1}`);
    doc = cycle.doc;
    const day = addDay(doc, cycle.id!, 1);
    doc = day.doc;
    const workout = addWorkout(doc, day.id!, "A");
    doc = workout.doc;
    const exercise = addExercise(doc, workout.id!, "squat");
    doc = exercise.doc;
    instances.push(exercise.id!);
  }
  return { doc, blockId: block.id, instances };
}

describe("exercise cells", () => {
  it("writes sets × reps and load to every set", () => {
    const { doc, instances } = plan(1);
    const id = instances[0]!;
    const withSets = applySetsReps(doc, id, "4×8-10")!;
    const withLoad = applyLoad("pl", withSets, id, "82,5 kg")!;
    const exercise = findExercise(withLoad, id)!.exercise;
    expect(exercise.sets).toHaveLength(4);
    expect(
      exercise.sets.every(
        (s) =>
          s.prescription.reps?.minimum === 8 &&
          s.prescription.reps?.maximum === 10,
      ),
    ).toBe(true);
    expect(
      exercise.sets.every(
        (s) => Number(s.prescription.load?.minimum.value) === 82.5,
      ),
    ).toBe(true);
    expect(exerciseCells("pl", exercise)).toMatchObject({
      setsReps: "4 × 8–10",
      mixed: false,
    });
  });

  it("rejects text that isn't a prescription", () => {
    const { doc, instances } = plan(1);
    expect(applySetsReps(doc, instances[0]!, "lots")).toBeNull();
    expect(applyLoad("en", doc, instances[0]!, "2,5")).toBeNull();
  });

  it("lays out an expanded cycle with one column group per day", () => {
    const { doc } = plan(1);
    const grid = cycleGrid(doc.blocks[0]!.cycles[0]!, true);
    expect(grid.days).toHaveLength(1);
    expect(grid.days[0]!.rows.map((r) => r.type)).toEqual([
      "workout",
      "exercise",
      "add-exercise",
      "add-workout",
    ]);
  });
});

describe("block progression", () => {
  it("adds the step per following cycle from the first cycle's numbers", () => {
    const { doc, blockId, instances } = plan(3);
    let next = applySetsReps(doc, instances[0]!, "3×5")!;
    next = applyLoad("en", next, instances[0]!, "100 kg")!;
    const result = applyProgression(next, blockId, "squat", {
      kind: "load",
      step: 2.5,
    });
    expect(result.changed).toBe(2);
    const load = (i: number) =>
      Number(
        findExercise(result.doc, instances[i]!)!.exercise.sets[0]!.prescription
          .load?.minimum.value,
      );
    expect([load(0), load(1), load(2)]).toEqual([100, 102.5, 105]);
    expect(findExercise(result.doc, instances[2]!)!.exercise.sets).toHaveLength(
      3,
    );
  });
});
