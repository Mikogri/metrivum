import type { TrainingDocument } from "@metrivum/api-client-web";
import { setIsAdvanced } from "./document";
import { maxesTables } from "./maxes";
import { isSimpleShape } from "./structure";

/**
 * True when the plan uses something only the advanced builder (Pro and above) can make: more than one block or
 * cycle, a cycle that is not 7 days, formulas, maxes tables, advanced set types or supersets. Without the builder
 * such a plan opens read-only, so nothing made with Pro is edited, or broken, on a lower plan.
 */
export function usesProFeatures(doc: TrainingDocument): boolean {
  if (!isSimpleShape(doc)) return true;
  if (maxesTables(doc).some((table) => table.rows.length > 0)) return true;
  for (const block of doc.blocks)
    for (const cycle of block.cycles)
      for (const day of cycle.days)
        for (const workout of day.workouts) {
          if (workout.groups?.length) return true;
          for (const exercise of workout.exercises)
            for (const set of exercise.sets) {
              if (setIsAdvanced(set)) return true;
              if (Object.keys(set.prescription.fieldFormulas ?? {}).length) return true;
            }
        }
  return false;
}
