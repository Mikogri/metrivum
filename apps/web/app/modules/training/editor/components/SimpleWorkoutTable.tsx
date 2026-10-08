import { ArrowDown, ArrowUp, Copy, MoreVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ExerciseInstance, Workout } from "@trainflow/api-client-web";
import { ContextMenu, type ContextMenuEntry } from "@trainflow/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { addExercise, duplicateNode, moveNode, removeNode } from "../model/document";
import { ExerciseCell, ExerciseRow, type Apply, type ExerciseColumn } from "./ExerciseCells";
import sheet from "./SheetCanvas.module.css";
import styles from "./WeekView.module.css";

const COLUMNS: ExerciseColumn[] = ["exercise", "sets", "reps", "load", "time", "rest", "comment"];
const at = (col: number, row: number): React.CSSProperties => ({ gridColumn: `${col + 1}`, gridRow: `${row + 1}` });

/**
 * Simple editor table: one row per exercise, values typed straight into the cells (a single click
 * starts typing). Sets is a number — every set of the exercise gets the same reps, load, time and
 * rest — so there is no separate set list. Exercises are picked by typing a name or muscle.
 */
export function SimpleWorkoutTable({ workout, names, apply }: { workout: Workout; names: Map<string, ExerciseLabel>; apply?: Apply }) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  const [menu, setMenu] = useState<{ x: number; y: number; instance: ExerciseInstance } | null>(null);

  const items = (instance: ExerciseInstance): ContextMenuEntry[] => {
    const index = workout.exercises.findIndex((e) => e.id === instance.id);
    return [
      { id: "duplicate", label: t.duplicateExercise, icon: <Copy /> },
      { id: "up", label: m.editor.moveUp, icon: <ArrowUp />, isDisabled: index === 0 },
      { id: "down", label: m.editor.moveDown, icon: <ArrowDown />, isDisabled: index === workout.exercises.length - 1 },
      { type: "separator", id: "s1" },
      { id: "remove", label: t.removeExercise, icon: <Trash2 />, tone: "danger" },
    ];
  };
  const onAction = (instance: ExerciseInstance, id: string) => {
    if (id === "duplicate") apply?.((doc) => duplicateNode(doc, instance.id).doc);
    else if (id === "up") apply?.((doc) => moveNode(doc, instance.id, -1));
    else if (id === "down") apply?.((doc) => moveNode(doc, instance.id, 1));
    else if (id === "remove") apply?.((doc) => removeNode(doc, instance.id));
  };

  return (
    <div className={styles.table} role="grid" aria-label={workout.name || m.editor.untitled} data-readonly={readOnly || undefined}>
      <div role="row" style={{ display: "contents" }}>
        {COLUMNS.map((c, i) => (
          <div key={c} role="columnheader" className={`${sheet.cell} ${styles.head}`} style={at(i, 0)}>
            {t.columns[c]}
          </div>
        ))}
        <div role="columnheader" className={`${sheet.cell} ${styles.head}`} style={at(COLUMNS.length, 0)} aria-label={m.common.actions} />
      </div>

      {workout.exercises.map((instance, index) => {
        const row = index + 1;
        const cells = Object.fromEntries(COLUMNS.map((c, i) => [c, at(i, row)])) as Record<ExerciseColumn, React.CSSProperties>;
        return (
          <ExerciseRow
            key={instance.id}
            instance={instance}
            name={names.get(instance.exerciseId)?.name ?? "—"}
            cells={cells}
            readOnly={readOnly}
            apply={apply}
            onContextMenu={(event) => setMenu({ x: event.clientX, y: event.clientY, instance })}
          >
            <div className={`${sheet.cell} ${styles.rowMenu}`} style={at(COLUMNS.length, row)}>
              {!readOnly ? (
                <button
                  type="button"
                  className={sheet.menu}
                  aria-label={m.common.moreActions(names.get(instance.exerciseId)?.name ?? t.columns.exercise)}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setMenu({ x: rect.left, y: rect.bottom + 2, instance });
                  }}
                >
                  <MoreVertical aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </ExerciseRow>
        );
      })}

      {!readOnly ? (
        <ExerciseCell
          name=""
          mode="add"
          readOnly={false}
          style={at(0, workout.exercises.length + 1)}
          idleStyle={{ gridColumn: "1 / -1", gridRow: `${workout.exercises.length + 2}` }}
          onPick={(exerciseId) => apply?.((doc) => addExercise(doc, workout.id, exerciseId).doc)}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={names.get(menu.instance.exerciseId)?.name ?? t.columns.exercise}
          items={items(menu.instance)}
          onAction={(id) => onAction(menu.instance, id)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
