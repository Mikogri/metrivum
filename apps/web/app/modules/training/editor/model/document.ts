import { maxesTables, withMaxesTables } from "./maxes";
import type {
  Block,
  Cycle,
  ExerciseGroup,
  ExerciseInstance,
  GroupKind,
  Prescription,
  SetKind,
  SetSegment,
  TrainingDay,
  TrainingDocument,
  TrainingSet,
  Workout,
} from "@metrivum/api-client-web";

/** Set kinds that carry 2–20 typed segments (docs/features/training.md). */
export const SEGMENTED: ReadonlySet<SetKind> = new Set<SetKind>(["Ramp", "DropSet", "RestPause", "Cluster"]);
export const MAX_SEGMENTS = 20;

export const newId = (): string => crypto.randomUUID();

export function emptyDocument(): TrainingDocument {
  return { schemaVersion: 1, blocks: [] };
}

export function newBlock(name: string): Block {
  return { id: newId(), name, description: "", cycles: [] };
}

export function newCycle(name: string, dayCount = 7): Cycle {
  return { id: newId(), name, description: "", dayCount, days: [] };
}

export function newDay(dayNumber: number): TrainingDay {
  return { id: newId(), dayNumber, workouts: [] };
}

export function newWorkout(name: string): Workout {
  return { id: newId(), name, description: "", exercises: [], groups: [] };
}

export function newSet(kind: SetKind = "Standard", prescription: Prescription = {}): TrainingSet {
  const set: TrainingSet = { id: newId(), kind, prescription: { ...prescription } };
  if (SEGMENTED.has(kind)) set.segments = [newSegment(prescription), newSegment(prescription)];
  return set;
}

export function newSegment(prescription: Prescription = {}): SetSegment {
  const copy: Prescription = { ...prescription };
  if (prescription.loadFormula) copy.loadFormula = cloneFormula(prescription.loadFormula);
  return { id: newId(), prescription: copy };
}

export function newInstance(exerciseId: string): ExerciseInstance {
  return { id: newId(), exerciseId, comment: "", sets: [newSet()] };
}

function cloneFormula<T extends { inputs: Record<string, unknown> }>(formula: T): T {
  return { ...formula, inputs: { ...formula.inputs } };
}

// ---------------------------------------------------------------------------------------------
// Locating nodes

export type NodeKind = "block" | "cycle" | "day" | "workout" | "exercise" | "set";

export interface Located {
  kind: NodeKind;
  blockIndex: number;
  cycleIndex?: number;
  dayIndex?: number;
  workoutIndex?: number;
  exerciseIndex?: number;
  setIndex?: number;
}

export function locate(doc: TrainingDocument, id: string): Located | null {
  for (const [bi, block] of doc.blocks.entries()) {
    if (block.id === id) return { kind: "block", blockIndex: bi };
    for (const [ci, cycle] of block.cycles.entries()) {
      if (cycle.id === id) return { kind: "cycle", blockIndex: bi, cycleIndex: ci };
      for (const [di, day] of cycle.days.entries()) {
        if (day.id === id) return { kind: "day", blockIndex: bi, cycleIndex: ci, dayIndex: di };
        for (const [wi, workout] of day.workouts.entries()) {
          if (workout.id === id) return { kind: "workout", blockIndex: bi, cycleIndex: ci, dayIndex: di, workoutIndex: wi };
          for (const [ei, exercise] of workout.exercises.entries()) {
            if (exercise.id === id) return { kind: "exercise", blockIndex: bi, cycleIndex: ci, dayIndex: di, workoutIndex: wi, exerciseIndex: ei };
            for (const [si, set] of exercise.sets.entries()) {
              if (set.id === id) return { kind: "set", blockIndex: bi, cycleIndex: ci, dayIndex: di, workoutIndex: wi, exerciseIndex: ei, setIndex: si };
            }
          }
        }
      }
    }
  }
  return null;
}

export function findWorkout(doc: TrainingDocument, workoutId: string): Workout | null {
  const at = locate(doc, workoutId);
  if (!at || at.kind !== "workout") return null;
  return doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!.workouts[at.workoutIndex!]!;
}

export function findSet(doc: TrainingDocument, setId: string): { set: TrainingSet; exercise: ExerciseInstance; workout: Workout } | null {
  const at = locate(doc, setId);
  if (!at || at.kind !== "set") return null;
  const workout = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!.workouts[at.workoutIndex!]!;
  const exercise = workout.exercises[at.exerciseIndex!]!;
  return { set: exercise.sets[at.setIndex!]!, exercise, workout };
}

export function findExercise(doc: TrainingDocument, instanceId: string): { exercise: ExerciseInstance; workout: Workout } | null {
  const at = locate(doc, instanceId);
  if (!at || at.kind !== "exercise") return null;
  const workout = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!.workouts[at.workoutIndex!]!;
  return { exercise: workout.exercises[at.exerciseIndex!]!, workout };
}

// ---------------------------------------------------------------------------------------------
// Immutable updates. Each helper returns a new document; untouched branches keep their identity.

function mapBlocks(doc: TrainingDocument, fn: (blocks: Block[]) => Block[]): TrainingDocument {
  return { ...doc, blocks: fn(doc.blocks) };
}

function replaceAt<T>(items: T[], index: number, value: T): T[] {
  const copy = items.slice();
  copy[index] = value;
  return copy;
}

function updateWorkoutAt(doc: TrainingDocument, at: Located, fn: (workout: Workout) => Workout): TrainingDocument {
  return mapBlocks(doc, (blocks) => {
    const block = blocks[at.blockIndex]!;
    const cycle = block.cycles[at.cycleIndex!]!;
    const day = cycle.days[at.dayIndex!]!;
    const workout = day.workouts[at.workoutIndex!]!;
    const nextDay = { ...day, workouts: replaceAt(day.workouts, at.workoutIndex!, fn(workout)) };
    const nextCycle = { ...cycle, days: replaceAt(cycle.days, at.dayIndex!, nextDay) };
    return replaceAt(blocks, at.blockIndex, { ...block, cycles: replaceAt(block.cycles, at.cycleIndex!, nextCycle) });
  });
}

export function updateNode(doc: TrainingDocument, id: string, patch: Record<string, unknown>): TrainingDocument {
  const at = locate(doc, id);
  if (!at) return doc;
  switch (at.kind) {
    case "block":
      return mapBlocks(doc, (blocks) => replaceAt(blocks, at.blockIndex, { ...blocks[at.blockIndex]!, ...patch }));
    case "cycle":
      return mapBlocks(doc, (blocks) => {
        const block = blocks[at.blockIndex]!;
        return replaceAt(blocks, at.blockIndex, { ...block, cycles: replaceAt(block.cycles, at.cycleIndex!, { ...block.cycles[at.cycleIndex!]!, ...patch }) });
      });
    case "day":
      return mapBlocks(doc, (blocks) => {
        const block = blocks[at.blockIndex]!;
        const cycle = block.cycles[at.cycleIndex!]!;
        const days = replaceAt(cycle.days, at.dayIndex!, { ...cycle.days[at.dayIndex!]!, ...patch }).sort((x, y) => x.dayNumber - y.dayNumber);
        return replaceAt(blocks, at.blockIndex, { ...block, cycles: replaceAt(block.cycles, at.cycleIndex!, { ...cycle, days }) });
      });
    case "workout":
      return updateWorkoutAt(doc, at, (workout) => ({ ...workout, ...patch }));
    case "exercise":
      return updateWorkoutAt(doc, at, (workout) => ({
        ...workout,
        exercises: replaceAt(workout.exercises, at.exerciseIndex!, { ...workout.exercises[at.exerciseIndex!]!, ...patch }),
      }));
    case "set":
      return updateWorkoutAt(doc, at, (workout) => {
        const exercise = workout.exercises[at.exerciseIndex!]!;
        const sets = replaceAt(exercise.sets, at.setIndex!, { ...exercise.sets[at.setIndex!]!, ...patch });
        return { ...workout, exercises: replaceAt(workout.exercises, at.exerciseIndex!, { ...exercise, sets }) };
      });
  }
}

/** Container list for a node and the setter that writes it back. */
function withSiblings(doc: TrainingDocument, id: string, fn: <T extends { id: string }>(items: T[], index: number) => T[]): TrainingDocument {
  const at = locate(doc, id);
  if (!at) return doc;
  if (at.kind === "block") return mapBlocks(doc, (blocks) => fn(blocks, at.blockIndex));
  return mapBlocks(doc, (blocks) => {
    const block = blocks[at.blockIndex]!;
    if (at.kind === "cycle") return replaceAt(blocks, at.blockIndex, { ...block, cycles: fn(block.cycles, at.cycleIndex!) });
    const cycle = block.cycles[at.cycleIndex!]!;
    const writeCycle = (next: Cycle) => replaceAt(blocks, at.blockIndex, { ...block, cycles: replaceAt(block.cycles, at.cycleIndex!, next) });
    if (at.kind === "day") return writeCycle({ ...cycle, days: fn(cycle.days, at.dayIndex!) });
    const day = cycle.days[at.dayIndex!]!;
    const writeDay = (next: TrainingDay) => writeCycle({ ...cycle, days: replaceAt(cycle.days, at.dayIndex!, next) });
    if (at.kind === "workout") return writeDay({ ...day, workouts: fn(day.workouts, at.workoutIndex!) });
    const workout = day.workouts[at.workoutIndex!]!;
    const writeWorkout = (next: Workout) => writeDay({ ...day, workouts: replaceAt(day.workouts, at.workoutIndex!, next) });
    if (at.kind === "exercise") {
      const exercises = fn(workout.exercises, at.exerciseIndex!);
      // Removing an exercise also removes it from groups; a group left with <2 members disappears.
      const ids = new Set(exercises.map((e) => e.id));
      const groups = workout.groups
        .map((g) => ({ ...g, exerciseIds: g.exerciseIds.filter((x) => ids.has(x)) }))
        .filter((g) => g.exerciseIds.length >= 2 && (g.kind !== "Superset" || g.exerciseIds.length === 2));
      return writeWorkout({ ...workout, exercises, groups });
    }
    const exercise = workout.exercises[at.exerciseIndex!]!;
    const sets = fn(exercise.sets, at.setIndex!);
    return writeWorkout({ ...workout, exercises: replaceAt(workout.exercises, at.exerciseIndex!, { ...exercise, sets: repairBackOffs(sets) }) });
  });
}

/** Removing a source clears the reference while preserving the coach's back-off marker. */
function repairBackOffs(sets: TrainingSet[]): TrainingSet[] {
  const earlierTops = new Set<string>();
  return sets.map((set) => {
    if (set.kind === "TopSet") earlierTops.add(set.id);
    if (set.kind === "BackOff" && (!set.sourceSetId || !earlierTops.has(set.sourceSetId))) {
      const repaired: TrainingSet = { ...set };
      delete repaired.sourceSetId;
      return repaired;
    }
    return set;
  });
}

export function removeNode(doc: TrainingDocument, id: string): TrainingDocument {
  const stripped = withSiblings(doc, id, (items, index) => items.filter((_, i) => i !== index));
  const remaining = new Set(stripped.blocks.flatMap(b => [b.id, ...b.cycles.map(c => c.id)]));
  const next = { ...stripped, annotations: stripped.annotations?.map(n => n.targetId && !remaining.has(n.targetId) ? { ...n, targetId: null } : n) };
  return doc.blocks.some(b => b.id === id) ? withMaxesTables(next, maxesTables(doc).map(t => t.blockId === id ? { ...t, blockId: null } : t)) : next;
}

export function moveNode(doc: TrainingDocument, id: string, delta: -1 | 1): TrainingDocument {
  const at = locate(doc, id);
  if (at?.kind === "day") return doc; // days are ordered by day number, not position
  return withSiblings(doc, id, (items, index) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return items;
    const copy = items.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(target, 0, item!);
    return copy;
  });
}

export function insertAfter<T extends { id: string }>(doc: TrainingDocument, id: string, node: T): TrainingDocument {
  return withSiblings(doc, id, (items, index) => {
    const copy = items.slice() as unknown as T[];
    copy.splice(index + 1, 0, node);
    return copy as unknown as typeof items;
  });
}

// Adding children ---------------------------------------------------------------------------

export function addBlock(doc: TrainingDocument, name: string): { doc: TrainingDocument; id: string } {
  const block = newBlock(name);
  return { doc: { ...doc, blocks: [...doc.blocks, block] }, id: block.id };
}

export function addCycle(doc: TrainingDocument, blockId: string, name: string, dayCount = 7) {
  const cycle = newCycle(name, dayCount);
  const at = locate(doc, blockId);
  if (!at || at.kind !== "block") return { doc, id: null };
  const block = doc.blocks[at.blockIndex]!;
  return { doc: updateNode(doc, blockId, { cycles: [...block.cycles, cycle] }), id: cycle.id };
}

export function addDay(doc: TrainingDocument, cycleId: string, dayNumber?: number) {
  const at = locate(doc, cycleId);
  if (!at || at.kind !== "cycle") return { doc, id: null };
  const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
  const used = new Set(cycle.days.map((d) => d.dayNumber));
  const number = dayNumber ?? Array.from({ length: cycle.dayCount }, (_, i) => i + 1).find((n) => !used.has(n));
  if (number === undefined || used.has(number) || number < 1 || number > cycle.dayCount) return { doc, id: null };
  const day = newDay(number);
  const days = [...cycle.days, day].sort((x, y) => x.dayNumber - y.dayNumber);
  return { doc: updateNode(doc, cycleId, { days }), id: day.id };
}

export function addWorkout(doc: TrainingDocument, dayId: string, name: string) {
  const at = locate(doc, dayId);
  if (!at || at.kind !== "day") return { doc, id: null };
  const day = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!.days[at.dayIndex!]!;
  const workout = newWorkout(name);
  return { doc: updateNode(doc, dayId, { workouts: [...day.workouts, workout] }), id: workout.id };
}

export function addExercise(doc: TrainingDocument, workoutId: string, exerciseId: string) {
  const workout = findWorkout(doc, workoutId);
  if (!workout) return { doc, id: null, setId: null };
  const instance = newInstance(exerciseId);
  return { doc: updateNode(doc, workoutId, { exercises: [...workout.exercises, instance] }), id: instance.id, setId: instance.sets[0]!.id };
}

export function addSet(doc: TrainingDocument, instanceId: string, afterSetId?: string) {
  const found = findExercise(doc, instanceId);
  if (!found) return { doc, id: null };
  const sets = found.exercise.sets;
  const index = afterSetId ? sets.findIndex((s) => s.id === afterSetId) : sets.length - 1;
  // A new set copies the prescription of the set it follows (the common case when writing sets).
  const template = sets[index]?.prescription ?? {};
  const set = newSet("Standard", copyPrescription(template));
  const next = sets.slice();
  next.splice(index + 1, 0, set);
  return { doc: updateNode(doc, instanceId, { sets: next }), id: set.id };
}

export function copyPrescription(prescription: Prescription): Prescription {
  return JSON.parse(JSON.stringify(prescription)) as Prescription;
}

// Duplication with fresh IDs ------------------------------------------------------------------

/** Deep copy with new IDs; internal references (groups, back-off sources) are remapped. */
export function cloneWithNewIds<T>(node: T): T {
  const map = new Map<string, string>();
  const fresh = (old: string) => {
    let next = map.get(old);
    if (!next) {
      next = newId();
      map.set(old, next);
    }
    return next;
  };
  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "id" && typeof v === "string") out[k] = fresh(v);
        else if ((k === "blockId" || k === "targetId") && typeof v === "string") out[k] = fresh(v);
        else if (k === "sourceSetId" && typeof v === "string") out[k] = fresh(v);
        else if (k === "exerciseIds" && Array.isArray(v)) out[k] = v.map((x) => fresh(String(x)));
        else if (k === "exerciseId" || k === "formulaId") out[k] = v; // catalog/formula references stay
        else out[k] = walk(v, k);
      }
      return out;
    }
    return value;
  };
  return walk(node) as T;
}

export function duplicateNode(doc: TrainingDocument, id: string): { doc: TrainingDocument; id: string | null } {
  const at = locate(doc, id);
  if (!at) return { doc, id: null };
  if (at.kind === "day") {
    // A duplicated day needs a free day number in the same cycle.
    const cycle = doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]!;
    const day = cycle.days[at.dayIndex!]!;
    const used = new Set(cycle.days.map((d) => d.dayNumber));
    const free = Array.from({ length: cycle.dayCount }, (_, i) => i + 1).find((n) => !used.has(n) && n > day.dayNumber) ??
      Array.from({ length: cycle.dayCount }, (_, i) => i + 1).find((n) => !used.has(n));
    if (free === undefined) return { doc, id: null };
    const copy = { ...cloneWithNewIds(day), dayNumber: free };
    return { doc: updateNode(doc, cycle.id, { days: [...cycle.days, copy].sort((x, y) => x.dayNumber - y.dayNumber) }), id: copy.id };
  }
  const node = getNode(doc, at);
  let copy = cloneWithNewIds(node) as { id: string; kind?: SetKind; sourceSetId?: string | null };
  if (at.kind === "set" && copy.kind === "TopSet") {
    // A duplicated top set is a new top set; back-offs keep pointing at the original.
  }
  if (at.kind === "set" && copy.kind === "BackOff") copy = { ...copy, sourceSetId: (node as TrainingSet).sourceSetId };
  return { doc: insertAfter(doc, id, copy), id: copy.id };
}

function getNode(doc: TrainingDocument, at: Located): { id: string } {
  const block = doc.blocks[at.blockIndex]!;
  if (at.kind === "block") return block;
  const cycle = block.cycles[at.cycleIndex!]!;
  if (at.kind === "cycle") return cycle;
  const day = cycle.days[at.dayIndex!]!;
  if (at.kind === "day") return day;
  const workout = day.workouts[at.workoutIndex!]!;
  if (at.kind === "workout") return workout;
  const exercise = workout.exercises[at.exerciseIndex!]!;
  if (at.kind === "exercise") return exercise;
  return exercise.sets[at.setIndex!]!;
}

// Sets ------------------------------------------------------------------------------------------

export function setPrescription(doc: TrainingDocument, setId: string, prescription: Prescription): TrainingDocument {
  return updateNode(doc, setId, { prescription: cleanPrescription(prescription) });
}

/** Removes empty optional fields so the JSON stays minimal and comparable. */
export function cleanPrescription(prescription: Prescription): Prescription {
  const out: Prescription = {};
  for (const [key, value] of Object.entries(prescription) as Array<[keyof Prescription, unknown]>) {
    if (value === null || value === undefined || value === "") continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** Replaces a whole set (unlike updateNode, removed optional keys really disappear). */
export function replaceSet(doc: TrainingDocument, setId: string, set: TrainingSet): TrainingDocument {
  return withSiblings(doc, setId, (items, index) => {
    const copy = items.slice();
    copy[index] = set as unknown as (typeof items)[number];
    return copy;
  });
}

export function changeSetKind(doc: TrainingDocument, setId: string, kind: SetKind): TrainingDocument {
  const found = findSet(doc, setId);
  if (!found) return doc;
  const { set, exercise } = found;
  const next: TrainingSet = { ...set, kind, prescription: { ...set.prescription } };
  if (kind === "Amrap") delete next.prescription.reps;
  if (SEGMENTED.has(kind)) {
    next.segments = set.segments && set.segments.length >= 2 ? set.segments : [newSegment(set.prescription), newSegment(set.prescription)];
  } else {
    delete next.segments;
  }
  if (kind === "BackOff") {
    const index = exercise.sets.findIndex((s) => s.id === setId);
    const top = exercise.sets.slice(0, index).reverse().find((s) => s.kind === "TopSet");
    next.sourceSetId = top?.id ?? null;
  } else {
    delete next.sourceSetId;
  }
  return replaceSet(doc, setId, next);
}

export function updateSegments(doc: TrainingDocument, setId: string, segments: SetSegment[]): TrainingDocument {
  return updateNode(doc, setId, { segments: segments.slice(0, MAX_SEGMENTS).map((s) => ({ ...s, prescription: cleanPrescription(s.prescription) })) });
}

// Groups ----------------------------------------------------------------------------------------

export function groupOf(workout: Workout, instanceId: string): ExerciseGroup | undefined {
  return workout.groups.find((g) => g.exerciseIds.includes(instanceId));
}

export function makeGroup(doc: TrainingDocument, workoutId: string, instanceIds: string[], kind: GroupKind): TrainingDocument {
  const workout = findWorkout(doc, workoutId);
  if (!workout) return doc;
  if (instanceIds.length < 2 || (kind === "Superset" && instanceIds.length !== 2)) return doc;
  if (new Set(instanceIds).size !== instanceIds.length || instanceIds.some(id => !workout.exercises.some(e => e.id === id))) return doc;
  if (instanceIds.some((id) => groupOf(workout, id))) return doc;
  const group: ExerciseGroup = { id: newId(), kind, exerciseIds: instanceIds, rounds: kind === "Circuit" ? 3 : 1, restSeconds: 90 };
  return updateNode(doc, workoutId, { groups: [...workout.groups, group] });
}

export function updateGroup(doc: TrainingDocument, workoutId: string, groupId: string, patch: Partial<ExerciseGroup>): TrainingDocument {
  const workout = findWorkout(doc, workoutId);
  if (!workout) return doc;
  return updateNode(doc, workoutId, { groups: workout.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)) });
}

export function removeGroup(doc: TrainingDocument, workoutId: string, groupId: string): TrainingDocument {
  const workout = findWorkout(doc, workoutId);
  if (!workout) return doc;
  return updateNode(doc, workoutId, { groups: workout.groups.filter((g) => g.id !== groupId) });
}

// Queries -----------------------------------------------------------------------------------------

export function uniqueExerciseIds(doc: TrainingDocument): string[] {
  const ids = new Set<string>();
  for (const block of doc.blocks) {
    for (const row of block.exerciseMaxes ?? []) if (row.exerciseId) ids.add(row.exerciseId);
    for (const cycle of block.cycles)
      for (const day of cycle.days) for (const workout of day.workouts) for (const exercise of workout.exercises) ids.add(exercise.exerciseId);
  }
  for (const table of maxesTables(doc)) for (const row of table.rows) if (row.exerciseId) ids.add(row.exerciseId);
  return [...ids];
}

export function firstWorkoutId(doc: TrainingDocument): string | null {
  for (const block of doc.blocks) for (const cycle of block.cycles) for (const day of cycle.days) for (const workout of day.workouts) return workout.id;
  return null;
}

export function documentStats(doc: TrainingDocument) {
  let cycles = 0;
  let days = 0;
  let exercises = 0;
  for (const block of doc.blocks) {
    cycles += block.cycles.length;
    for (const cycle of block.cycles) {
      days += cycle.days.length;
      for (const day of cycle.days) for (const workout of day.workouts) exercises += workout.exercises.length;
    }
  }
  return { blocks: doc.blocks.length, cycles, days, exercises };
}

/** Whether a document uses constructs gated by `training.sets.advanced`. */
export function setIsAdvanced(set: TrainingSet): boolean {
  return !["Standard", "Warmup", "BackOff"].includes(set.kind);
}
