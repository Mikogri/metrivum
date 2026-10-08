import { describe, expect, it } from "vitest";
import { addBlock, addCycle, addExercise, emptyDocument, findExercise } from "./document";
import {
  addCycleWorkout,
  cycleCalendar,
  cycleVolume,
  cycleWorkouts,
  exerciseRow,
  moveWorkoutToDay,
  nextWorkoutLetter,
  setExerciseDuration,
  setExerciseLoad,
  setExerciseReps,
  setDayNote,
  setExerciseSets,
  workoutRows,
} from "./workouts";

function setup() {
  let doc = emptyDocument();
  const block = addBlock(doc, "B");
  doc = block.doc;
  const cycle = addCycle(doc, block.id, "C", 10);
  doc = cycle.doc;
  return { doc, cycleId: cycle.id! };
}

describe("workouts in a cycle", () => {
  it("adds workouts A, B on free days and moves one to day 4", () => {
    const { doc: start, cycleId } = setup();
    let doc = start;
    const cycle = () => doc.blocks[0]!.cycles[0]!;
    const a = addCycleWorkout(doc, cycleId, `Workout ${nextWorkoutLetter(cycle())}`);
    doc = a.doc;
    const b = addCycleWorkout(doc, cycleId, `Workout ${nextWorkoutLetter(cycle())}`);
    doc = b.doc;
    expect(cycleWorkouts(cycle()).map((w) => [w.workout.name, w.dayNumber])).toEqual([
      ["Workout A", 1],
      ["Workout B", 2],
    ]);
    doc = moveWorkoutToDay(doc, b.id!, 4);
    expect(cycleWorkouts(cycle()).map((w) => w.dayNumber)).toEqual([1, 4]);
    // The emptied day 2 is gone; days beyond the cycle length are refused.
    expect(cycle().days.map((d) => Number(d.dayNumber))).toEqual([1, 4]);
    expect(moveWorkoutToDay(doc, b.id!, 11)).toBe(doc);
  });

  it("lists rows workout by workout and hides a collapsed workout's exercises", () => {
    const { doc: start, cycleId } = setup();
    let doc = start;
    const w = addCycleWorkout(doc, cycleId, "A");
    doc = addExercise(w.doc, w.id!, "squat").doc;
    const cycle = doc.blocks[0]!.cycles[0]!;
    expect(workoutRows(cycle, new Set(), true).map((r) => r.type)).toEqual(["workout", "exercise", "add-exercise", "add-workout"]);
    expect(workoutRows(cycle, new Set([w.id!]), true).map((r) => r.type)).toEqual(["workout", "add-workout"]);
  });
});

describe("exercise row values", () => {
  it("edits sets, reps, load (RIR/RPE/kg/lbs), time and rest independently", () => {
    const { doc: start, cycleId } = setup();
    let doc = start;
    const w = addCycleWorkout(doc, cycleId, "A");
    const ex = addExercise(w.doc, w.id!, "squat");
    doc = ex.doc;
    const id = ex.id!;
    doc = setExerciseSets(doc, id, "4")!;
    doc = setExerciseReps(doc, id, "8-10")!;
    doc = setExerciseLoad("pl", doc, id, "rir", "2")!;
    expect(exerciseRow("pl", findExercise(doc, id)!.exercise)).toMatchObject({ sets: "4", reps: "8–10", load: "RIR 2", mixed: false });
    doc = setExerciseLoad("pl", doc, id, "kg", "82,5")!;
    const p = findExercise(doc, id)!.exercise.sets[3]!.prescription;
    expect(p.rir).toBeNull();
    expect(Number(p.load?.minimum.value)).toBe(82.5);
    doc = setExerciseDuration("en", doc, id, "rest", "2:00")!;
    expect(Number(findExercise(doc, id)!.exercise.sets[0]!.prescription.rest?.value)).toBe(120);
    expect(exerciseRow("en", findExercise(doc, id)!.exercise).rest).toBe("2:00");
    expect(setExerciseDuration("en", doc, id, "workTime", "1:75")).toBeNull();
    doc = setExerciseDuration("en", doc, id, "workTime", "1:02:30")!;
    expect(exerciseRow("en", findExercise(doc, id)!.exercise).time).toBe("1:02:30");
    expect(setExerciseLoad("en", doc, id, "rpe", "11")).toBeNull();
    expect(setExerciseSets(doc, id, "0")).toBeNull();
  });

  it("counts volume per pattern for each workout and the cycle", () => {
    const { doc: start, cycleId } = setup();
    let doc = start;
    const w = addCycleWorkout(doc, cycleId, "A");
    const ex = addExercise(w.doc, w.id!, "squat");
    doc = setExerciseReps(setExerciseSets(ex.doc, ex.id!, "3")!, ex.id!, "10")!;
    doc = setExerciseLoad("en", doc, ex.id!, "kg", "100")!;
    const taxonomy = () => ({ movementPatternKeys: ["squat"], primaryMuscleKeys: ["quadriceps"], secondaryMuscleKeys: ["gluteus-maximus"] });
    const volume = cycleVolume(doc.blocks[0]!.cycles[0]!, taxonomy, "patterns");
    const stats = { sets: 3, reps: 30, hardSets: 0, tonnage: 3000 };
    expect(volume.lines).toEqual([{ key: "squat", perWorkout: { [w.id!]: stats }, total: stats }]);
    expect(cycleVolume(doc.blocks[0]!.cycles[0]!, taxonomy, "secondary").lines.map((l) => l.key)).toEqual(["gluteus-maximus"]);

    // RIR 2 makes every set a hard set (and replaces the absolute load, so no tonnage).
    doc = setExerciseLoad("en", doc, ex.id!, "rir", "2")!;
    expect(cycleVolume(doc.blocks[0]!.cycles[0]!, taxonomy, "primary").lines[0]!.total).toEqual({ sets: 3, reps: 30, hardSets: 3, tonnage: 0 });
  });

  it("keeps a rest day only while it has a note, and keeps it when a workout moves away", () => {
    const { doc: start, cycleId } = setup();
    let doc = setDayNote(start, cycleId, 3, "Easy walk");
    const cycle = () => doc.blocks[0]!.cycles[0]!;
    expect(cycle().days.map((d) => [Number(d.dayNumber), d.note])).toEqual([[3, "Easy walk"]]);
    const calendar = cycleCalendar(cycle());
    expect(calendar).toHaveLength(10);
    expect(calendar[2]).toMatchObject({ dayNumber: 3, workouts: [], note: "Easy walk" });

    const added = addCycleWorkout(doc, cycleId, "A", 3);
    doc = moveWorkoutToDay(added.doc, added.id!, 5);
    expect(cycle().days.map((d) => Number(d.dayNumber))).toEqual([3, 5]);

    doc = setDayNote(doc, cycleId, 3, "  ");
    expect(cycle().days.map((d) => Number(d.dayNumber))).toEqual([5]);
    expect(setDayNote(doc, cycleId, 11, "x")).toBe(doc);
  });
});
