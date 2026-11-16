import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  ListOrdered,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import type { ExerciseInstance, Workout } from "@metrivum/api-client-web";
import { ContextMenu, type ContextMenuEntry } from "@portable-ui/react";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import {
  addExercise,
  duplicateNode,
  moveNode,
  removeNode,
} from "../model/document";
import { reorderExercise } from "../model/workouts";
import { useTableWidths } from "./useTableWidths";
import {
  ExerciseCell,
  ExerciseRow,
  type Apply,
  type ExerciseColumn,
} from "./ExerciseCells";
import sheet from "./SheetCanvas.module.css";
import styles from "./WeekView.module.css";

const COLUMNS: ExerciseColumn[] = [
  "exercise",
  "sets",
  "reps",
  "load",
  "time",
  "rest",
  "comment",
];
const at = (col: number, row: number): React.CSSProperties => ({
  gridColumn: `${col + 1}`,
  gridRow: `${row + 1}`,
});

/**
 * Simple editor table: one row per exercise, values typed straight into the cells (a single click
 * starts typing). Sets is a number — every set of the exercise gets the same reps, load, time and
 * rest — so there is no separate set list. Exercises are picked by typing a name or muscle.
 */
export function SimpleWorkoutTable({
  workout,
  names,
  apply,
  formulaAllowed = false,
  customFormulas = false,
  onEditSets,
}: {
  workout: Workout;
  names: Map<string, ExerciseLabel>;
  apply?: Apply;
  /** Pro: formulas in the sets, reps and load cells, the same as on the sheet. */
  formulaAllowed?: boolean;
  customFormulas?: boolean;
  /** Pro: opens the set-by-set editor (set types, per-set load and formulas). */
  onEditSets?: () => void;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  // Editable tables get a narrow first column with a handle: drag a row onto another to move it there.
  const lead = readOnly ? 0 : 1;
  const cell = (col: number, row: number) => at(col + lead, row);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    instance: ExerciseInstance;
  } | null>(null);
  // Drag a header's right edge to resize its column; double-click the edge to make it flexible again.
  const { resize, template } = useTableWidths();
  const columns = `${lead ? "1.5rem " : ""}${template(COLUMNS)} 2.75rem`;
  const startResize = (
    column: ExerciseColumn,
    event: React.PointerEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const header = handle.parentElement!;
    const startX = event.clientX;
    const startWidth = header.getBoundingClientRect().width;
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
    const move = (e: PointerEvent) =>
      resize(column, startWidth + e.clientX - startX);
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const items = (instance: ExerciseInstance): ContextMenuEntry[] => {
    const index = workout.exercises.findIndex((e) => e.id === instance.id);
    return [
      ...(onEditSets
        ? ([
            {
              id: "sets",
              label: m.editor.week.editSets,
              icon: <ListOrdered />,
            },
            { type: "separator", id: "s0" },
          ] as ContextMenuEntry[])
        : []),
      { id: "duplicate", label: t.duplicateExercise, icon: <Copy /> },
      {
        id: "up",
        label: m.editor.moveUp,
        icon: <ArrowUp />,
        isDisabled: index === 0,
      },
      {
        id: "down",
        label: m.editor.moveDown,
        icon: <ArrowDown />,
        isDisabled: index === workout.exercises.length - 1,
      },
      { type: "separator", id: "s1" },
      {
        id: "remove",
        label: t.removeExercise,
        icon: <Trash2 />,
        tone: "danger",
      },
    ];
  };
  const onAction = (instance: ExerciseInstance, id: string) => {
    if (id === "sets") onEditSets?.();
    else if (id === "duplicate")
      apply?.((doc) => duplicateNode(doc, instance.id).doc);
    else if (id === "up") apply?.((doc) => moveNode(doc, instance.id, -1));
    else if (id === "down") apply?.((doc) => moveNode(doc, instance.id, 1));
    else if (id === "remove") apply?.((doc) => removeNode(doc, instance.id));
  };

  return (
    <div
      className={styles.table}
      role="grid"
      aria-label={workout.name || m.editor.untitled}
      data-readonly={readOnly || undefined}
      data-sortable={!readOnly || undefined}
      style={{ gridTemplateColumns: columns }}
    >
      <div role="row" style={{ display: "contents" }}>
        {lead ? (
          <div
            role="columnheader"
            className={`${sheet.cell} ${styles.head}`}
            style={at(0, 0)}
            aria-label={m.editor.week.reorderColumn}
          />
        ) : null}
        {COLUMNS.map((c, i) => (
          <div
            key={c}
            role="columnheader"
            className={`${sheet.cell} ${styles.head} ${c === "comment" ? sheet.commentHead : ""}`}
            style={cell(i, 0)}
          >
            {t.columns[c]}
            <span
              className={styles.colResize}
              role="separator"
              aria-orientation="vertical"
              aria-label={m.editor.week.resizeColumn(t.columns[c])}
              title={m.editor.week.resizeHint}
              onPointerDown={(event) => startResize(c, event)}
              onDoubleClick={() => resize(c, null)}
            />
          </div>
        ))}
        <div
          role="columnheader"
          className={`${sheet.cell} ${styles.head}`}
          style={cell(COLUMNS.length, 0)}
          aria-label={m.common.actions}
        />
      </div>

      {workout.exercises.map((instance, index) => {
        const row = index + 1;
        const cells = Object.fromEntries(
          COLUMNS.map((c, i) => [c, cell(i, row)]),
        ) as Record<ExerciseColumn, React.CSSProperties>;
        const name = names.get(instance.exerciseId)?.name ?? t.columns.exercise;
        // Where the moved row lands: below this one when it comes from above, above it when it comes from below.
        const drop =
          dragging !== null && over === index && dragging !== index
            ? dragging < index
              ? "after"
              : "before"
            : undefined;
        return (
          <ExerciseRow
            key={instance.id}
            instance={instance}
            workout={workout}
            names={names}
            name={names.get(instance.exerciseId)?.name ?? "—"}
            cells={cells}
            readOnly={readOnly}
            apply={apply}
            formulaAllowed={formulaAllowed}
            customFormulas={customFormulas}
            rowProps={
              readOnly
                ? undefined
                : {
                    "data-drop": drop,
                    "data-dragging": dragging === index || undefined,
                    onDragOver: (event) => {
                      if (dragging === null) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setOver(index);
                    },
                    onDrop: (event) => {
                      event.preventDefault();
                      if (dragging !== null && dragging !== index)
                        apply?.((doc) =>
                          reorderExercise(
                            doc,
                            workout.exercises[dragging]!.id,
                            index,
                          ),
                        );
                      endDrag();
                    },
                  }
            }
            lead={
              readOnly ? null : (
                <div
                  className={`${sheet.cell} ${styles.grip}`}
                  style={at(0, row)}
                  draggable
                  role="button"
                  tabIndex={-1}
                  aria-label={m.editor.week.dragExercise(name)}
                  title={m.editor.week.dragExercise(name)}
                  onDragStart={(event) => {
                    setDragging(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", instance.id);
                  }}
                  onDragEnd={endDrag}
                >
                  <GripVertical aria-hidden="true" />
                </div>
              )
            }
            onContextMenu={(event) =>
              setMenu({ x: event.clientX, y: event.clientY, instance })
            }
          >
            <div
              className={`${sheet.cell} ${styles.rowMenu}`}
              style={cell(COLUMNS.length, row)}
            >
              {!readOnly ? (
                <button
                  type="button"
                  className={sheet.menu}
                  aria-label={m.common.moreActions(
                    names.get(instance.exerciseId)?.name ?? t.columns.exercise,
                  )}
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
          style={cell(0, workout.exercises.length + 1)}
          idleStyle={{
            gridColumn: "1 / -1",
            gridRow: `${workout.exercises.length + 2}`,
          }}
          onPick={(exerciseId) =>
            apply?.((doc) => addExercise(doc, workout.id, exerciseId).doc)
          }
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={
            names.get(menu.instance.exerciseId)?.name ?? t.columns.exercise
          }
          items={items(menu.instance)}
          onAction={(id) => onAction(menu.instance, id)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
