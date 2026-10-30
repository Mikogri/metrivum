import { describe, expect, it } from "vitest";
import { addBlock, addCycle, addExercise, emptyDocument, findExercise } from "./document";
import {
  addCycleWorkout,
  copyWorkoutToDay,
  cycleCalendar,
  cycleRuns,
  hasActiveWorkout,
  cycleVolume,
  cycleWorkouts,
  exerciseRow,
  moveWorkoutToDay,
  nextWorkoutLetter,
  reorderExercise,
  reorderWorkout,
  withWorkout,
  withoutWorkout,
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

  it("copies a workout with new ids to another day or its own day, and reorders workouts in a day", () => {
    const { doc: start, cycleId } = setup();
    const a = addCycleWorkout(start, cycleId, "A", 1);
    let doc = addExercise(a.doc, a.id!, "squat").doc;
    const cycle = () => doc.blocks[0]!.cycles[0]!;
    doc = copyWorkoutToDay(doc, a.id!, 3);
    doc = copyWorkoutToDay(doc, a.id!, 1);
    expect(cycle().days.map((d) => [Number(d.dayNumber), d.workouts.length])).toEqual([[1, 2], [3, 1]]);
    const [first, second] = cycle().days[0]!.workouts;
    expect(second!.id).not.toBe(first!.id);
    expect(second!.exercises[0]!.id).not.toBe(first!.exercises[0]!.id);
    expect(copyWorkoutToDay(doc, a.id!, 11)).toBe(doc);
    doc = reorderWorkout(doc, second!.id, 0);
    expect(cycle().days[0]!.workouts.map((w) => w.id)).toEqual([second!.id, first!.id]);
  });

  it("moves an exercise to another position in its workout", () => {
    const { doc: start, cycleId } = setup();
    const w = addCycleWorkout(start, cycleId, "A", 1);
    let doc = addExercise(w.doc, w.id!, "squat").doc;
    doc = addExercise(doc, w.id!, "bench").doc;
    doc = addExercise(doc, w.id!, "row").doc;
    const order = () => doc.blocks[0]!.cycles[0]!.days[0]!.workouts[0]!.exercises.map((e) => e.exerciseId);
    const first = doc.blocks[0]!.cycles[0]!.days[0]!.workouts[0]!.exercises[0]!.id;
    doc = reorderExercise(doc, first, 2);
    expect(order()).toEqual(["bench", "row", "squat"]);
    doc = reorderExercise(doc, first, 0);
    expect(order()).toEqual(["squat", "bench", "row"]);
  });

  it("takes a workout off a cycle and puts it on another, keeping its day when it fits", () => {
    const { doc: start, cycleId } = setup();
    const a = addCycleWorkout(start, cycleId, "A", 4);
    const cycle = a.doc.blocks[0]!.cycles[0]!;
    const taken = withoutWorkout(cycle, a.id!);
    expect(taken.dayNumber).toBe(4);
    expect(taken.cycle.days).toHaveLength(0);
    const short = { ...taken.cycle, dayCount: 3 };
    expect(withWorkout(taken.cycle, taken.workout!, taken.dayNumber).days.map((d) => Number(d.dayNumber))).toEqual([4]);
    // Day 4 doesn't exist in a 3-day cycle: the first free day is used instead.
    expect(withWorkout(short, taken.workout!, taken.dayNumber).days.map((d) => Number(d.dayNumber))).toEqual([1]);
  });

  it("runs a lone unset cycle until stopped, and every other cycle once unless set", () => {
    const { doc: start, cycleId } = setup();
    const only = start.blocks[0]!.cycles[0]!;
    expect(cycleRuns(start, only)).toBeNull();
    expect(cycleRuns(start, { ...only, repeats: 3 })).toBe(3);
    const two = addCycle(start, start.blocks[0]!.id, "C2");
    expect(cycleRuns(two.doc, two.doc.blocks[0]!.cycles[0]!)).toBe(1);
    expect(hasActiveWorkout(start)).toBe(false);
    const withWorkout = addCycleWorkout(start, cycleId, "A").doc;
    expect(hasActiveWorkout(withWorkout)).toBe(true);
    expect(hasActiveWorkout({ ...withWorkout, blocks: withWorkout.blocks.map((b) => ({ ...b, inactive: true })) })).toBe(false);
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
