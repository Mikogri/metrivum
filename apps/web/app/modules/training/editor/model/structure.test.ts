import { describe, expect, it } from "vitest";
import { addBlock, addCycle, addExercise, emptyDocument, findWorkout, newCycle, newWorkout, removeNode } from "./document";
import { autoLayout, mergeLayout } from "./layout";
import { addLooseCycle, addLooseWorkout, attachCycle, attachWorkout, detachCycle, detachWorkout, ensureWeekdayWorkout, isSimpleShape, parentBlockId, pruneHolders, sheetView, workoutHome } from "./structure";

const names = { block: "Plan", cycle: "Week", workout: "Workout" };

function twoBlocks() {
  let doc = emptyDocument();
  const a = addBlock(doc, "A");
  doc = a.doc;
  const b = addBlock(doc, "B");
  doc = b.doc;
  const c = addCycle(doc, a.id, "C1");
  return { doc: c.doc, a: a.id, b: b.id, cycle: c.id! };
}

describe("sheet connections", () => {
  it("moves a cycle to another block without duplicating it", () => {
    const { doc, b, cycle } = twoBlocks();
    const next = attachCycle(doc, cycle, b);
    expect(next.blocks[0]!.cycles).toHaveLength(0);
    expect(next.blocks[1]!.cycles.map((c) => c.id)).toEqual([cycle]);
    expect(parentBlockId(next, cycle)).toBe(b);
  });

  it("keeps a detached cycle in the plan, outside every block, and re-attaches it", () => {
    const { doc, a, cycle } = twoBlocks();
    const detached = detachCycle(doc, cycle);
    expect(parentBlockId(detached, cycle)).toBeNull();
    expect(sheetView(detached).loose.map((c) => c.id)).toEqual([cycle]);
    expect(sheetView(detached).blocks.map((b) => b.id)).toEqual(doc.blocks.map((b) => b.id));
    const back = attachCycle(detached, cycle, a);
    expect(parentBlockId(back, cycle)).toBe(a);
    // The holder is gone once the cycle is back in a block.
    expect(back.blocks).toHaveLength(2);
  });

  it("keeps a workout outside every cycle in the plan, run once, and moves it onto a cycle", () => {
    const { doc, cycle } = twoBlocks();
    const workout = newWorkout("Lone");
    const loose = addLooseWorkout(doc, workout);
    expect(sheetView(loose).looseWorkouts.map((w) => w.id)).toEqual([workout.id]);
    const holder = loose.blocks.at(-1)!;
    expect(holder.implicit).toBe(true);
    expect(holder.cycles[0]).toMatchObject({ implicit: true, dayCount: 1, repeats: 1 });
    expect(workoutHome(loose, workout.id)?.cycle).toBeNull();
    // Exercises can be added while it is on no cycle.
    const withExercise = addExercise(loose, workout.id, "ex-1").doc;
    expect(findWorkout(withExercise, workout.id)?.exercises).toHaveLength(1);
    const attached = attachWorkout(withExercise, workout.id, cycle);
    expect(workoutHome(attached, workout.id)?.cycle?.id).toBe(cycle);
    expect(attached.blocks).toHaveLength(2);
    const detached = detachWorkout(attached, workout.id);
    expect(workoutHome(detached, workout.id)?.cycle).toBeNull();
    expect(findWorkout(detached, workout.id)?.exercises).toHaveLength(1);
  });

  it("drops a holder left empty and leaves the plan alone otherwise", () => {
    const { doc } = twoBlocks();
    expect(pruneHolders(doc)).toBe(doc);
    const workout = newWorkout("Lone");
    const loose = addLooseWorkout(doc, workout);
    expect(pruneHolders(removeNode(loose, workout.id)).blocks).toHaveLength(2);
    const cycle = addLooseCycle(doc, newCycle("Solo", 7));
    expect(pruneHolders(cycle)).toBe(cycle);
  });

  it("lays out blocks in a column and their cycles to the right; user positions survive new nodes", () => {
    const { doc, a, b, cycle } = twoBlocks();
    const layout = autoLayout(doc);
    expect(layout[a]!.col).toBe(1);
    expect(layout[cycle]!.row).toBe(layout[a]!.row);
    expect(layout[b]!.row).toBeGreaterThan(layout[a]!.row);
    const moved = { ...layout, [a]: { col: 9, row: 9 } };
    const added = addCycle(doc, b, "C2");
    const merged = mergeLayout(moved, added.doc);
    expect(merged[a]).toEqual({ col: 9, row: 9 });
    expect(merged[added.id!]).toBeDefined();
  });
});

describe("simple mode", () => {
  it("creates the week, the weekday and its workout on demand", () => {
    const result = ensureWeekdayWorkout(emptyDocument(), names, 3);
    const cycle = result.doc.blocks[0]!.cycles[0]!;
    expect(Number(cycle.dayCount)).toBe(7);
    expect(cycle.days.map((d) => Number(d.dayNumber))).toEqual([3]);
    expect(cycle.days[0]!.workouts[0]!.id).toBe(result.workoutId);
    // Asking again returns the same workout.
    expect(ensureWeekdayWorkout(result.doc, names, 3).workoutId).toBe(result.workoutId);
  });

  it("recognises plans that need the advanced editor", () => {
    expect(isSimpleShape(emptyDocument())).toBe(true);
    expect(isSimpleShape(twoBlocks().doc)).toBe(false);
  });
});

describe("sheet reflow", () => {
  it("pushes cards out from under an expanded card and keeps the expanded one in place", async () => {
    const { resolveLayout } = await import("./layout");
    const layout = { big: { col: 0, row: 0 }, small: { col: 2, row: 2 }, far: { col: 20, row: 0 } };
    const sizes = { big: { cols: 8, rows: 6 }, small: { cols: 3, rows: 4 }, far: { cols: 2, rows: 2 } };
    const result = resolveLayout(layout, sizes, ["big"]);
    expect(result.big).toEqual({ col: 0, row: 0 });
    expect(result.small).toEqual({ col: 2, row: 7 });
    expect(result.far).toEqual({ col: 20, row: 0 });
  });
});
