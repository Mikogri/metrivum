import { describe, expect, it } from "vitest";
import type { TrainingDocument } from "@metrivum/api-client-web";
import {
  addBlock,
  addCycle,
  addDay,
  addExercise,
  addSet,
  addWorkout,
  changeSetKind,
  cloneWithNewIds,
  duplicateNode,
  emptyDocument,
  findWorkout,
  makeGroup,
  removeNode,
} from "./document";
import { commit, createHistory, redo, undo } from "./history";
import { moveExerciseTo } from "./reorder";

function workoutDoc() {
  let doc: TrainingDocument = emptyDocument();
  const block = addBlock(doc, "Block 1");
  doc = block.doc;
  const cycle = addCycle(doc, block.id, "Cycle 1", 10);
  doc = cycle.doc;
  const day = addDay(doc, cycle.id!, 3);
  doc = day.doc;
  const workout = addWorkout(doc, day.id!, "Lower");
  doc = workout.doc;
  const squat = addExercise(doc, workout.id!, "11111111-1111-1111-1111-111111111111");
  doc = squat.doc;
  const rdl = addExercise(doc, workout.id!, "22222222-2222-2222-2222-222222222222");
  doc = rdl.doc;
  return { doc, cycleId: cycle.id!, workoutId: workout.id!, squat, rdl };
}

describe("document model", () => {
  it("numbers days inside non-weekly cycles and rejects duplicates", () => {
    const { doc, cycleId } = workoutDoc();
    expect(addDay(doc, cycleId, 3).id).toBeNull();
    expect(addDay(doc, cycleId, 11).id).toBeNull();
    const next = addDay(doc, cycleId);
    expect(next.id).not.toBeNull();
    const days = next.doc.blocks[0]!.cycles[0]!.days.map((d) => d.dayNumber);
    expect(days).toEqual([1, 3]);
  });

  it("links a back-off to an earlier top set and keeps its marker when the source is removed", () => {
    const base = workoutDoc();
    const squat = base.squat;
    let doc = base.doc;
    const second = addSet(doc, squat.id!, squat.setId!);
    doc = changeSetKind(second.doc, squat.setId!, "TopSet");
    doc = changeSetKind(doc, second.id!, "BackOff");
    const sets = () => findWorkout(doc, doc.blocks[0]!.cycles[0]!.days[0]!.workouts[0]!.id)!.exercises[0]!.sets;
    expect(sets()[1]!.sourceSetId).toBe(squat.setId);
    doc = removeNode(doc, squat.setId!);
    expect(sets()[0]!.kind).toBe("BackOff");
    expect(sets()[0]!.sourceSetId).toBeUndefined();
  });

  it("does not create groups with duplicate or foreign exercise instances", () => {
    const { doc, workoutId, squat } = workoutDoc();
    expect(makeGroup(doc, workoutId, [squat.id!, squat.id!], "Superset")).toBe(doc);
    expect(makeGroup(doc, workoutId, [squat.id!, "foreign"], "Superset")).toBe(doc);
  });

  it("creates 2 segments for segmented kinds and drops them when switching back", () => {
    const base = workoutDoc();
    const squat = base.squat;
    let doc = base.doc;
    doc = changeSetKind(doc, squat.setId!, "Ramp");
    const set = () => doc.blocks[0]!.cycles[0]!.days[0]!.workouts[0]!.exercises[0]!.sets[0]!;
    expect(set().segments).toHaveLength(2);
    doc = changeSetKind(doc, squat.setId!, "Standard");
    expect(set().segments).toBeUndefined();
    doc = changeSetKind(doc, squat.setId!, "Amrap");
    expect(set().prescription.reps).toBeUndefined();
  });

  it("duplicates with fresh IDs and remaps internal references", () => {
    const base = workoutDoc();
    const { workoutId, squat, rdl } = base;
    let doc = base.doc;
    doc = makeGroup(doc, workoutId, [squat.id!, rdl.id!], "Superset");
    const workout = findWorkout(doc, workoutId)!;
    const copy = cloneWithNewIds(workout);
    expect(copy.id).not.toBe(workout.id);
    expect(copy.exercises.map((e) => e.exerciseId)).toEqual(workout.exercises.map((e) => e.exerciseId));
    expect(copy.groups[0]!.exerciseIds).toEqual(copy.exercises.map((e) => e.id));
    const result = duplicateNode(doc, workoutId);
    expect(result.id).not.toBeNull();
    const ids = new Set<string>();
    JSON.stringify(result.doc, (key, value) => {
      if (key === "id") {
        expect(ids.has(value)).toBe(false);
        ids.add(value);
      }
      return value;
    });
  });

  it("removing an exercise dissolves an invalid superset", () => {
    const base = workoutDoc();
    const { workoutId, squat, rdl } = base;
    let doc = base.doc;
    doc = makeGroup(doc, workoutId, [squat.id!, rdl.id!], "Superset");
    doc = removeNode(doc, rdl.id!);
    expect(findWorkout(doc, workoutId)!.groups).toHaveLength(0);
  });

  it("reorders exercises by drag target index", () => {
    const { doc, workoutId, squat, rdl } = workoutDoc();
    const moved = moveExerciseTo(doc, workoutId, rdl.id!, 0);
    expect(findWorkout(moved, workoutId)!.exercises.map((e) => e.id)).toEqual([rdl.id, squat.id]);
  });

  it("undo/redo restores documents", () => {
    const a = emptyDocument();
    const b = addBlock(a, "B").doc;
    let history = commit(createHistory(a), b);
    history = undo(history);
    expect(history.present).toBe(a);
    history = redo(history);
    expect(history.present).toBe(b);
  });
});
