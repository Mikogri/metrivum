import { useState } from "react";
import type { Workout } from "@trainflow/api-client-web";
import type { ExerciseLabel } from "~/modules/exercises";
import type { EditorApi } from "../useEditor";
import { DetailsPanel } from "./DetailsPanel";
import { SetGrid, type GridSelection } from "./SetGrid";
import styles from "./WorkoutEditor.module.css";

/**
 * The structured part of a plan: one workout's exercise table with the details of the selected
 * set beside it. Used by the week view (simple mode) and the sheet's workout panel (advanced).
 */
export function WorkoutEditor({
  editor,
  workout,
  names,
  advancedAllowed,
  customFormulas,
  readOnly,
  simple = false,
}: {
  editor: EditorApi;
  workout: Workout;
  names: Map<string, ExerciseLabel>;
  advancedAllowed: boolean;
  customFormulas: boolean;
  readOnly: boolean;
  simple?: boolean;
}) {
  const [selection, setSelection] = useState<GridSelection>({ instanceId: null, setId: null });
  return (
    <div className={styles.editor}>
      <div className={styles.grid}>
        <SetGrid key={workout.id} editor={editor} workout={workout} names={names} advancedAllowed={advancedAllowed && !simple} customFormulas={customFormulas && !simple} readOnly={readOnly} onSelectionChange={setSelection} />
      </div>
      <aside className={styles.details}>
        <DetailsPanel
          editor={editor}
          workout={workout}
          selection={selection}
          advancedAllowed={advancedAllowed && !simple}
          customFormulas={customFormulas && !simple}
          readOnly={readOnly}
          simple={simple}
        />
      </aside>
    </div>
  );
}
