import type { BlockExerciseMax, FormulaUse, Prescription, TrainingDocument } from "@trainflow/api-client-web";

/** Stored bindings identify sources; resolved values belong only to evaluation requests. */
export function storedFormula<T extends FormulaUse>(formula: T): T {
  return { ...formula, inputs: Object.fromEntries(Object.entries(formula.inputs).filter(([name]) => !formula.variableBindings?.[name])) };
}

export function storedDocument(document: TrainingDocument): TrainingDocument {
  const prescription = (p: Prescription): Prescription => ({ ...p, ...(p.loadFormula ? { loadFormula: storedFormula(p.loadFormula) } : {}), ...(p.fieldFormulas ? { fieldFormulas: Object.fromEntries(Object.entries(p.fieldFormulas).map(([key, formula]) => [key, storedFormula(formula)])) } : {}) });
  const maxes = (rows: BlockExerciseMax[] | null | undefined) => rows?.map(row => ({ ...row, ...(row.loadFormula ? { loadFormula: storedFormula(row.loadFormula) } : {}), ...(row.timeFormula ? { timeFormula: storedFormula(row.timeFormula) } : {}) }));
  return { ...document, maxesTables: document.maxesTables?.map(table => ({ ...table, rows: maxes(table.rows)! })), blocks: document.blocks.map(block => ({ ...block, exerciseMaxes: maxes(block.exerciseMaxes), cycles: block.cycles.map(cycle => ({ ...cycle, days: cycle.days.map(day => ({ ...day, workouts: day.workouts.map(workout => ({ ...workout, exercises: workout.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set, prescription: prescription(set.prescription), segments: set.segments?.map(segment => ({ ...segment, prescription: prescription(segment.prescription) })) })) })) })) })) })) })) };
}
