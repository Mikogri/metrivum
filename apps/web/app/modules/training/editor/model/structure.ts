import type { Block, Cycle, TrainingDocument, Workout } from "@metrivum/api-client-web";
import { cloneWithNewIds, locate, newBlock, newCycle, newDay, newWorkout, updateNode } from "./document";
import { withWorkout, withoutWorkout } from "./workouts";

// ---------------------------------------------------------------------------------------------
// Sheet connections. The API stores a strict tree (block → cycle → day → workout), so a cycle "connected" to a block
// lives in that block. A plan needs no blocks or cycles, though: a cycle outside every block sits in an implicit block,
// and a workout outside every cycle in an implicit one-day cycle (run once) of its own implicit block. The editor does
// not show these holders; they keep the unconnected parts in the saved plan, which clients can follow as they are.

export const isImplicit = (node: { implicit?: boolean | null } | null | undefined) => node?.implicit === true;

/** A block's or cycle's name for lists: what an implicit holder stands for ("No block"), else its name. */
export function nodeLabel(node: { name: string; implicit?: boolean | null }, labels: { untitled: string; implicit: string }): string {
  return isImplicit(node) ? labels.implicit : node.name || labels.untitled;
}

/** An implicit block holding one cycle that is not in any block. */
export function holdCycle(cycle: Cycle): Block {
  return { ...newBlock(""), implicit: true, cycles: [cycle] };
}

/** An implicit block and one-day cycle holding a workout that is not in any cycle. */
export function holdWorkout(workout: Workout): Block {
  const cycle: Cycle = { ...newCycle("", 1), repeats: 1, implicit: true, days: [{ ...newDay(1), workouts: [workout] }] };
  return holdCycle(cycle);
}

/** What the sheet draws: the coach's own blocks, cycles outside every block, and workouts outside every cycle. */
export function sheetView(doc: TrainingDocument): { blocks: Block[]; loose: Cycle[]; looseWorkouts: Workout[] } {
  const holders = doc.blocks.filter(isImplicit);
  return {
    blocks: doc.blocks.filter((block) => !isImplicit(block)),
    loose: holders.flatMap((block) => block.cycles.filter((cycle) => !isImplicit(cycle))),
    looseWorkouts: doc.blocks.flatMap((block) => block.cycles.filter(isImplicit).flatMap((cycle) => cycle.days.flatMap((day) => day.workouts))),
  };
}

/** Drops implicit holders left empty (their cycle or workout was connected, moved or deleted). Same object when none. */
export function pruneHolders(doc: TrainingDocument): TrainingDocument {
  const emptyCycle = (cycle: Cycle) => isImplicit(cycle) && !cycle.days.some((day) => day.workouts.length);
  if (!doc.blocks.some((block) => block.cycles.some(emptyCycle) || (isImplicit(block) && !block.cycles.length))) return doc;
  const blocks = doc.blocks
    .map((block) => (block.cycles.some(emptyCycle) ? { ...block, cycles: block.cycles.filter((cycle) => !emptyCycle(cycle)) } : block))
    .filter((block) => !(isImplicit(block) && !block.cycles.length));
  return { ...doc, blocks };
}

/** Takes a cycle out of its block; it stays in the plan, outside every block. */
export function detachCycle(doc: TrainingDocument, cycleId: string): TrainingDocument {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return doc;
  const block = doc.blocks[at.blockIndex]!;
  const cycle = block.cycles[at.cycleIndex!]!;
  if (isImplicit(block) || isImplicit(cycle)) return doc;
  const blocks = doc.blocks.slice();
  blocks.splice(at.blockIndex, 1, { ...block, cycles: block.cycles.filter((c) => c.id !== cycleId) }, holdCycle(cycle));
  return { ...doc, blocks };
}

/** Puts a cycle at the end of a block, taking it out of wherever it was. */
export function attachCycle(doc: TrainingDocument, cycleId: string, blockId: string): TrainingDocument {
  const target = locate(doc, blockId);
  const at = locate(doc, cycleId);
  if (!target || target.kind !== "block" || !at || at.kind !== "cycle" || isImplicit(doc.blocks[target.blockIndex])) return doc;
  if (doc.blocks[at.blockIndex]!.id === blockId) return doc;
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const blocks = doc.blocks.map((block) =>
    block.id === blockId ? { ...block, cycles: [...block.cycles, cycle] } : block.cycles.some((c) => c.id === cycleId) ? { ...block, cycles: block.cycles.filter((c) => c.id !== cycleId) } : block,
  );
  return pruneHolders({ ...doc, blocks });
}

/** Which block holds a cycle (null for a cycle outside every block). */
export function parentBlockId(doc: TrainingDocument, cycleId: string): string | null {
  const at = locate(doc, cycleId);
  const block = at?.kind === "cycle" ? doc.blocks[at.blockIndex]! : null;
  return block && !isImplicit(block) ? block.id : null;
}

/** The cycle a workout is on (null when it is on none) and its day. */
export function workoutHome(doc: TrainingDocument, workoutId: string): { cycle: Cycle | null; dayNumber: number | null; workout: Workout } | null {
  const at = locate(doc, workoutId);
  if (!at || at.kind !== "workout") return null;
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const day = cycle.days[at.dayIndex!]!;
  const workout = day.workouts[at.workoutIndex!]!;
  return isImplicit(cycle) ? { cycle: null, dayNumber: null, workout } : { cycle, dayNumber: Number(day.dayNumber), workout };
}

function takeWorkout(doc: TrainingDocument, workoutId: string): TrainingDocument {
  return { ...doc, blocks: doc.blocks.map((block) => (block.cycles.some((c) => c.days.some((d) => d.workouts.some((w) => w.id === workoutId))) ? { ...block, cycles: block.cycles.map((c) => withoutWorkout(c, workoutId).cycle) } : block)) };
}

/** Takes a workout off its cycle; it stays in the plan, outside every cycle, right after the block it was in. */
export function detachWorkout(doc: TrainingDocument, workoutId: string): TrainingDocument {
  const home = workoutHome(doc, workoutId);
  if (!home?.cycle) return doc;
  const blockIndex = locate(doc, workoutId)!.blockIndex;
  const next = takeWorkout(doc, workoutId);
  const blocks = next.blocks.slice();
  blocks.splice(blockIndex + 1, 0, holdWorkout(home.workout));
  return pruneHolders({ ...next, blocks });
}

/** Puts a workout on a cycle (on the same day it had, when that day exists there), taking it off wherever it was. */
export function attachWorkout(doc: TrainingDocument, workoutId: string, cycleId: string): TrainingDocument {
  const home = workoutHome(doc, workoutId);
  if (!home || home.cycle?.id === cycleId) return doc;
  const taken = takeWorkout(doc, workoutId);
  const at = locate(taken, cycleId);
  if (!at || at.kind !== "cycle") return doc;
  const cycle = taken.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  return pruneHolders(updateNode(taken, cycleId, { days: withWorkout(cycle, home.workout, home.dayNumber).days }));
}

/** Adds a cycle outside every block. */
export function addLooseCycle(doc: TrainingDocument, cycle: Cycle): TrainingDocument {
  return { ...doc, blocks: [...doc.blocks, holdCycle(cycle)] };
}

/** Adds a workout outside every cycle. */
export function addLooseWorkout(doc: TrainingDocument, workout: Workout): TrainingDocument {
  return { ...doc, blocks: [...doc.blocks, holdWorkout(workout)] };
}

// ---------------------------------------------------------------------------------------------
// Simple mode: one block, one 7-day cycle; day 1–7 is Monday–Sunday. Plain prescriptions only.

export const WEEK_DAYS = 7;

export function hasFormulas(doc: TrainingDocument): boolean {
  for (const block of doc.blocks)
    for (const cycle of block.cycles)
      for (const day of cycle.days)
        for (const workout of day.workouts)
          for (const exercise of workout.exercises)
            for (const set of exercise.sets) {
              if (set.prescription.loadFormula) return true;
              if (set.segments?.some((segment) => segment.prescription.loadFormula)) return true;
            }
  return false;
}

/** True when the plan can be shown as a single week without hiding anything. */
export function isSimpleShape(doc: TrainingDocument): boolean {
  if (doc.blocks.length > 1) return false;
  const block = doc.blocks[0];
  if (!block) return true;
  if (block.cycles.length > 1) return false;
  const cycle = block.cycles[0];
  if (cycle && Number(cycle.dayCount) !== WEEK_DAYS) return false;
  return !hasFormulas(doc);
}

/** The week cycle of a simple plan, creating the block and cycle when the plan is empty. */
export function ensureWeek(doc: TrainingDocument, names: { block: string; cycle: string }): { doc: TrainingDocument; cycleId: string } {
  const existing = doc.blocks[0]?.cycles[0];
  if (existing) return { doc, cycleId: existing.id };
  const cycle = newCycle(names.cycle, WEEK_DAYS);
  const block = doc.blocks[0] ?? newBlock(names.block);
  const nextBlock = { ...block, cycles: [cycle] };
  const blocks = doc.blocks.length ? [nextBlock, ...doc.blocks.slice(1)] : [nextBlock];
  return { doc: { ...doc, blocks }, cycleId: cycle.id };
}

/** The training day for a weekday (1 = Monday) in the week cycle, created if missing. */
export function ensureWeekday(doc: TrainingDocument, cycleId: string, weekday: number): { doc: TrainingDocument; dayId: string | null } {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return { doc, dayId: null };
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const found = cycle.days.find((d) => Number(d.dayNumber) === weekday);
  if (found) return { doc, dayId: found.id };
  const day = newDay(weekday);
  const days = [...cycle.days, day].sort((x, y) => Number(x.dayNumber) - Number(y.dayNumber));
  return { doc: updateNode(doc, cycleId, { days }), dayId: day.id };
}

/** First workout of a weekday, creating day and workout when needed. */
export function ensureWeekdayWorkout(
  doc: TrainingDocument,
  names: { block: string; cycle: string; workout: string },
  weekday: number,
): { doc: TrainingDocument; workoutId: string | null } {
  const week = ensureWeek(doc, names);
  const day = ensureWeekday(week.doc, week.cycleId, weekday);
  if (!day.dayId) return { doc, workoutId: null };
  const at = locate(day.doc, day.dayId)!;
  const dayNode = day.doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!;
  if (dayNode.workouts[0]) return { doc: day.doc, workoutId: dayNode.workouts[0].id };
  const workout = newWorkout(names.workout);
  return { doc: updateNode(day.doc, day.dayId, { workouts: [workout] }), workoutId: workout.id };
}

// ---------------------------------------------------------------------------------------------
// Day slots. Days are numbered slots in a cycle; moving a day swaps two slots, copying fills one.

function withCycle(doc: TrainingDocument, cycleId: string, change: (cycle: Cycle) => Cycle): TrainingDocument {
  return { ...doc, blocks: doc.blocks.map((block) => ({ ...block, cycles: block.cycles.map((cycle) => (cycle.id === cycleId ? change(cycle) : cycle)) })) };
}

/** Swaps the contents of two day slots (dragging a day onto another). An empty slot simply takes the day. */
export function swapDays(doc: TrainingDocument, cycleId: string, from: number, to: number): TrainingDocument {
  if (from === to) return doc;
  return withCycle(doc, cycleId, (cycle) => ({
    ...cycle,
    days: cycle.days
      .map((day) => (Number(day.dayNumber) === from ? { ...day, dayNumber: to } : Number(day.dayNumber) === to ? { ...day, dayNumber: from } : day))
      .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber)),
  }));
}

/** Copies a day's workouts and note onto another slot, replacing what was there. Copies get new ids. */
export function copyDay(doc: TrainingDocument, cycleId: string, from: number, to: number): TrainingDocument {
  if (from === to) return doc;
  return withCycle(doc, cycleId, (cycle) => {
    const source = cycle.days.find((day) => Number(day.dayNumber) === from);
    if (!source) return cycle;
    const copy = { ...cloneWithNewIds(source), dayNumber: to };
    const target = cycle.days.find((day) => Number(day.dayNumber) === to);
    const days = target ? cycle.days.map((day) => (day === target ? { ...copy, id: target.id } : day)) : [...cycle.days, copy];
    return { ...cycle, days: days.sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber)) };
  });
}
