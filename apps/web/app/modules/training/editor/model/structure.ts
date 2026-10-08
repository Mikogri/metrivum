import type { Cycle, TrainingDocument } from "@trainflow/api-client-web";
import { locate, newBlock, newCycle, newDay, newWorkout, updateNode } from "./document";

// ---------------------------------------------------------------------------------------------
// Sheet connections. The API stores a strict tree, so a cycle "connected" to a block simply lives
// in that block. A disconnected cycle is held outside the document by the sheet and is not saved.

/** Takes a cycle out of its block. The returned cycle can be re-attached anywhere. */
export function detachCycle(doc: TrainingDocument, cycleId: string): { doc: TrainingDocument; cycle: Cycle | null } {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return { doc, cycle: null };
  const block = doc.blocks[at.blockIndex]!;
  const cycle = block.cycles[at.cycleIndex!]!;
  return { doc: updateNode(doc, block.id, { cycles: block.cycles.filter((c) => c.id !== cycleId) }), cycle };
}

/** Puts a cycle at the end of a block, moving it out of another block first if needed. */
export function attachCycle(doc: TrainingDocument, cycle: Cycle, blockId: string): TrainingDocument {
  const target = locate(doc, blockId);
  if (!target || target.kind !== "block") return doc;
  const current = locate(doc, cycle.id);
  let next = doc;
  let moving = cycle;
  if (current?.kind === "cycle") {
    if (doc.blocks[current.blockIndex]!.id === blockId) return doc;
    const detached = detachCycle(doc, cycle.id);
    next = detached.doc;
    moving = detached.cycle ?? cycle;
  }
  const block = next.blocks.find((b) => b.id === blockId)!;
  return updateNode(next, blockId, { cycles: [...block.cycles, moving] });
}

/** Which block holds a cycle (null for cycles that are not in the document). */
export function parentBlockId(doc: TrainingDocument, cycleId: string): string | null {
  const at = locate(doc, cycleId);
  return at?.kind === "cycle" ? doc.blocks[at.blockIndex]!.id : null;
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
