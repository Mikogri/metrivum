import { CalendarDays, ChevronRight, Dumbbell } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ExerciseInstance, Workout } from "@trainflow/api-client-web";
import { ContextMenu } from "@trainflow/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { addExercise, updateNode } from "../model/document";
import { CELL_H, type Size } from "../model/layout";
import { WORKOUT_COLS, WORKOUT_COLUMNS, moveWorkoutToDay } from "../model/workouts";
import { ExerciseCell, ExerciseRow, type Apply, type ExerciseColumn } from "./ExerciseCells";
import { SheetMenuButton as MenuButton } from "./SheetMenuButton";
import styles from "./SheetCanvas.module.css";

const place = (col: number, row: number, span = 1): React.CSSProperties => ({ gridColumn: `${col + 1} / span ${span}`, gridRow: `${row + 1}` });
const COL_START: Record<string, number> = {};
WORKOUT_COLUMNS.reduce((at, c) => ((COL_START[c.id] = at), at + c.span), 0);
const cellsAt = (line: number) => Object.fromEntries(WORKOUT_COLUMNS.map((c) => [c.id, place(COL_START[c.id]!, line, c.span)])) as Record<ExerciseColumn, React.CSSProperties>;

/**
 * A workout on the sheet: its own card, plugged into a cycle by a cable from the cycle's handle. The header holds
 * the name, the day of the cycle it falls on (when connected) and its menu; below, one row per exercise edited in
 * place, like the table editor. Without a cycle it is only kept on this page, like a disconnected cycle.
 */
export function WorkoutCard({
  workout,
  inactive = false,
  dayNumber,
  dayCount,
  size,
  style,
  dragging,
  selected,
  linkTarget,
  collapsed,
  renaming,
  apply,
  names,
  advancedAllowed,
  customFormulas,
  onToggleCollapse,
  onMenuButton,
  onRenameDone,
  onExerciseMenu,
  onColumnContextMenu,
  renderColumnResize,
  ...events
}: {
  workout: Workout;
  /** Its block is inactive: shown dimmed. */
  inactive?: boolean;
  /** The day it falls on, or null when it isn't connected to a cycle. */
  dayNumber: number | null;
  dayCount: number | null;
  size: Size;
  style: React.CSSProperties;
  dragging: boolean;
  selected: boolean;
  linkTarget: boolean;
  collapsed: boolean;
  renaming: boolean;
  apply?: Apply;
  names: Map<string, ExerciseLabel>;
  advancedAllowed: boolean;
  customFormulas: boolean;
  onToggleCollapse: () => void;
  onMenuButton: (x: number, y: number) => void;
  onRenameDone: () => void;
  onExerciseMenu: (event: { clientX: number; clientY: number }, instance: ExerciseInstance, workout: Workout) => void;
  onColumnContextMenu?: (col: number, event: React.MouseEvent) => void;
  renderColumnResize?: (col: number, label: string) => React.ReactNode;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  const loose = dayNumber === null;
  const nameRef = useRef<HTMLInputElement>(null);
  const [dayPicker, setDayPicker] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (renaming) nameRef.current?.select();
  }, [renaming]);

  return (
    <div
      className={styles.card}
      data-node
      data-kind="workout"
      data-node-id={workout.id}
      data-workout-id={workout.id}
      data-expanded
      data-loose={loose || undefined}
      data-inactive={inactive || undefined}
      data-collapsed={collapsed || undefined}
      data-link-target={linkTarget || undefined}
      data-dragging={dragging || undefined}
      data-selected={selected || undefined}
      tabIndex={0}
      aria-label={`${t.workoutLabel}: ${workout.name || m.editor.untitled}`}
      style={{ ...style, width: Number(style.width) + 2, minHeight: size.rows * CELL_H + 2 }}
      {...events}
    >
      <div className={styles.cardHead}>
        <div className={styles.headMain}>
          <button type="button" className={styles.toggle} aria-label={collapsed ? t.expandWorkout : t.collapseWorkout} aria-expanded={!collapsed} data-no-drag onClick={onToggleCollapse}>
            <ChevronRight aria-hidden="true" data-open={!collapsed || undefined} />
          </button>
          <span className={styles.chip} data-kind="workout" aria-hidden="true">
            <Dumbbell />
          </span>
          <input
            ref={nameRef}
            className={styles.workoutName}
            value={workout.name}
            aria-label={m.common.col.name}
            readOnly={readOnly}
            maxLength={200}
            placeholder={t.workoutName("A")}
            data-no-drag
            onBlur={onRenameDone}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
            }}
            onChange={(event) => apply?.((doc) => updateNode(doc, workout.id, { name: event.target.value }))}
          />
        </div>
        {collapsed ? (
          <span className={styles.kind} title={m.editor.week.exercises(workout.exercises.length)}>{workout.exercises.length}</span>
        ) : loose ? (
          <span className={styles.kind}>{t.workoutLabel}</span>
        ) : (
          <button
            type="button"
            className={styles.dayChip}
            aria-label={`${t.chooseDay}: ${t.dayShort(dayNumber)}`}
            disabled={readOnly}
            data-no-drag
            onClick={(event) => setDayPicker(event.currentTarget.getBoundingClientRect())}
          >
            <CalendarDays aria-hidden="true" />
            {t.dayShort(dayNumber)}
          </button>
        )}
        {!readOnly ? <MenuButton label={workout.name} onOpen={onMenuButton} /> : null}
      </div>
      {loose && !collapsed ? <p className={`${styles.loose} ${styles.workoutLoose}`}>{t.looseWorkout}</p> : null}

      {collapsed ? null : (
        <div className={styles.cells2} style={{ gridTemplateColumns: `var(--sheet-columns, repeat(${WORKOUT_COLS}, var(--cell-w)))` }} role="grid" aria-label={workout.name || m.editor.untitled} data-no-drag>
          <div role="row" className={styles.headRow}>
            {WORKOUT_COLUMNS.map((c) => (
              <div key={c.id} role="columnheader" onContextMenu={(event) => onColumnContextMenu?.(COL_START[c.id]! + c.span - 1, event)} className={`${styles.cell} ${styles.colHead} ${c.id === "comment" ? styles.commentHead : ""}`} style={place(COL_START[c.id]!, 0, c.span)}>
                {t.columns[c.id]}
                {renderColumnResize?.(COL_START[c.id]! + c.span - 1, t.columns[c.id])}
              </div>
            ))}
          </div>
          {workout.exercises.map((instance, index) => (
            <ExerciseRow
              key={instance.id}
              instance={instance}
              workout={workout}
              names={names}
              formulaAllowed={advancedAllowed}
              customFormulas={customFormulas}
              name={names.get(instance.exerciseId)?.name ?? "—"}
              cells={cellsAt(index + 1)}
              readOnly={readOnly}
              apply={apply}
              onContextMenu={(event) => onExerciseMenu(event, instance, workout)}
            />
          ))}
          {!readOnly ? (
            <ExerciseCell
              name=""
              mode="add"
              readOnly={false}
              style={place(0, workout.exercises.length + 1, 2)}
              idleStyle={place(0, workout.exercises.length + 1, 1)}
              onPick={(exerciseId) => apply?.((doc) => addExercise(doc, workout.id, exerciseId).doc)}
            />
          ) : null}
        </div>
      )}

      {dayPicker && dayCount ? (
        <ContextMenu x={dayPicker.left} y={dayPicker.bottom + 2} items={[]} label={t.chooseDay} onAction={() => undefined} onClose={() => setDayPicker(null)}>
          <div className={styles.dayGrid} role="listbox" aria-label={t.chooseDay}>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="option" aria-selected={n === dayNumber} className={styles.dayButton}
                onClick={() => {
                  // Changes this workout's day; it never creates another workout.
                  apply?.((doc) => moveWorkoutToDay(doc, workout.id, n));
                  setDayPicker(null);
                }}>
                {n}
              </button>
            ))}
          </div>
        </ContextMenu>
      ) : null}
    </div>
  );
}
