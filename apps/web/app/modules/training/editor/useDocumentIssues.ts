import { useMemo } from "react";
import type { TrainingDocument } from "@metrivum/api-client-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { documentIssues } from "./model/issues";

/** Format problems of a plan as readable lines: "Block › Cycle › Day 2 › Workout A › Squat › Set 3: reason". */
export function useDocumentIssues(doc: TrainingDocument | undefined, names: Map<string, ExerciseLabel>): string[] {
  const m = useT();
  const t = m.editor.issues;
  return useMemo(() => {
    if (!doc) return [];
    return documentIssues(doc, {
      day: m.editor.sheet.dayShort,
      set: t.set,
      exercise: (id) => names.get(id)?.name ?? t.unknownExercise,
      untitled: m.editor.untitled,
    }).map((issue) => `${issue.path.join(" › ")}: ${t.codes[issue.code]}`);
  }, [doc, names, m, t]);
}
