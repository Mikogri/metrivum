import { CalendarDays, ChevronDown, ChevronRight, Copy, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Cycle, ExerciseInstance, Workout } from "@trainflow/api-client-web";
import { ContextMenu, type ContextMenuEntry } from "@trainflow/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { addExercise, duplicateNode, removeNode, updateNode } from "../model/document";
import { WORKOUT_COLS, WORKOUT_COLUMNS, addCycleWorkout, moveWorkoutToDay, nextWorkoutLetter, workoutRows } from "../model/workouts";
import { ExerciseCell, ExerciseRow, type Apply, type ExerciseColumn } from "./ExerciseCells";
import styles from "./SheetCanvas.module.css";

const place = (col: number, row: number, span = 1): React.CSSProperties => ({ gridColumn: `${col + 1} / span ${span}`, gridRow: `${row + 1}` });
const COL_START: Record<string, number> = {};
WORKOUT_COLUMNS.reduce((at, c) => ((COL_START[c.id] = at), at + c.span), 0);
const cellsAt = (line: number) => Object.fromEntries(WORKOUT_COLUMNS.map((c) => [c.id, place(COL_START[c.id]!, line, c.span)])) as Record<ExerciseColumn, React.CSSProperties>;

type Popup =
  { kind: "day"; rect: DOMRect; workout: Workout; dayNumber: number } | { kind: "workout"; x: number; y: number; workout: Workout; dayNumber: number; collapsed: boolean };

function DayPicker({ count, current, onPick }: { count: number; current: number; onPick: (day: number) => void }) {
  const m = useT();
  return (
    <div className={styles.dayGrid} role="listbox" aria-label={m.editor.sheet.chooseDay}>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" role="option" aria-selected={n === current} className={styles.dayButton} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

/**
 * Expanded cycle: workouts A, B, C… one under another, each assigned to a day of the cycle, with a
 * row per exercise. Every value is optional. Right click (or ⋮) on a workout opens its menu and
 * frames the whole workout so it's clear what the menu acts on.
 */
export function CycleCells({
  cycle,
  apply,
  names,
  collapsed,
  onToggleWorkout,
  onExerciseMenu,
}: {
  cycle: Cycle;
  apply?: Apply;
  names: Map<string, ExerciseLabel>;
  collapsed: ReadonlySet<string>;
  onToggleWorkout: (workoutId: string) => void;
  onExerciseMenu: (event: { clientX: number; clientY: number }, instance: ExerciseInstance, workout: Workout) => void;
}) {
  const m = useT();
  const t = m.editor.sheet;
  const readOnly = !apply;
  const rows = workoutRows(cycle, collapsed, !readOnly);
  const [popup, setPopup] = useState<Popup | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  // Workouts unfolded a moment ago: their rows fade in (only then, so editing a cell never animates).
  const [entering, setEntering] = useState<string[]>([]);
  const toggleWorkout = (id: string) => {
    if (collapsed.has(id)) {
      setEntering((list) => [...list, id]);
      setTimeout(() => setEntering((list) => list.filter((x) => x !== id)), 400);
    }
    onToggleWorkout(id);
  };

  // Row span of each workout (heading through its last row) for the selection frame.
  const spans = new Map<string, { from: number; to: number }>();
  rows.forEach((row, i) => {
    if (row.type === "add-workout") return;
    const id = row.workout.id;
    const span = spans.get(id);
    spans.set(id, span ? { from: span.from, to: i } : { from: i, to: i });
  });
  const framed = popup?.kind === "workout" ? spans.get(popup.workout.id) : undefined;

  const workoutMenu = (p: Extract<Popup, { kind: "workout" }>): ContextMenuEntry[] => [
    { id: "rename", label: t.renameWorkout, icon: <Pencil /> },
    { id: "day", label: `${t.changeDay} (${t.dayShort(p.dayNumber)})`, icon: <CalendarDays /> },
    { id: "add", label: t.addExerciseHere, icon: <Plus /> },
    { id: "toggle", label: p.collapsed ? t.expandWorkout : t.collapseWorkout, icon: p.collapsed ? <ChevronRight /> : <ChevronDown /> },
    { id: "duplicate", label: t.duplicateWorkout, icon: <Copy /> },
    { type: "separator", id: "s1" },
    { id: "remove", label: t.removeWorkout, icon: <Trash2 />, tone: "danger" },
  ];
  const onWorkoutAction = (p: Extract<Popup, { kind: "workout" }>, id: string) => {
    if (id === "rename") requestAnimationFrame(() => nameInputs.current.get(p.workout.id)?.select());
    else if (id === "day") setTimeout(() => setPopup({ kind: "day", rect: new DOMRect(p.x, p.y, 0, 0), workout: p.workout, dayNumber: p.dayNumber }));
    else if (id === "add") {
      if (p.collapsed) toggleWorkout(p.workout.id);
      setAdding(p.workout.id);
    } else if (id === "toggle") toggleWorkout(p.workout.id);
    else if (id === "duplicate") apply?.((doc) => duplicateNode(doc, p.workout.id).doc);
    else if (id === "remove") apply?.((doc) => removeNode(doc, p.workout.id));
  };

  return (
    <div className={styles.cells2} style={{ gridTemplateColumns: `repeat(${WORKOUT_COLS}, var(--cell-w))` }} role="grid" aria-label={cycle.name} data-no-drag>
      <div role="row" className={styles.headRow}>
        {WORKOUT_COLUMNS.map((c) => (
          <div key={c.id} role="columnheader" className={`${styles.cell} ${styles.colHead}`} style={place(COL_START[c.id]!, 0, c.span)}>
            {t.columns[c.id]}
          </div>
        ))}
      </div>

      {framed ? (
        <div className={styles.workoutFrame} style={{ gridColumn: `1 / span ${WORKOUT_COLS}`, gridRow: `${framed.from + 2} / ${framed.to + 3}` }} aria-hidden="true" />
      ) : null}

      {rows.map((row, r) => {
        const line = r + 1;
        if (row.type === "workout") {
          const { workout, dayNumber } = row;
          const openMenu = (x: number, y: number) => setPopup({ kind: "workout", x, y, workout, dayNumber, collapsed: row.collapsed });
          return (
            <div
              key={`w-${workout.id}`}
              role="row"
              className={styles.workoutRow}
              style={{ gridColumn: `1 / span ${WORKOUT_COLS}`, gridRow: `${line + 1}` }}
              onContextMenu={(event) => {
                if (readOnly) return;
                event.preventDefault();
                event.stopPropagation();
                openMenu(event.clientX, event.clientY);
              }}
            >
              <div className={styles.workoutMain}>
                <button
                  type="button"
                  className={styles.toggle}
                  aria-label={row.collapsed ? t.expandWorkout : t.collapseWorkout}
                  aria-expanded={!row.collapsed}
                  data-no-drag
                  onClick={() => toggleWorkout(workout.id)}
                >
                  <ChevronRight aria-hidden="true" data-open={!row.collapsed || undefined} />
                </button>
                <input
                  ref={(el) => {
                    if (el) nameInputs.current.set(workout.id, el);
                    else nameInputs.current.delete(workout.id);
                  }}
                  className={styles.workoutName}
                  value={workout.name}
                  aria-label={m.common.col.name}
                  readOnly={readOnly}
                  maxLength={200}
                  placeholder={t.workoutName("A")}
                  data-no-drag
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => apply?.((doc) => updateNode(doc, workout.id, { name: event.target.value }))}
                />
              </div>
              <button
                type="button"
                className={styles.dayChip}
                aria-label={`${t.chooseDay}: ${t.dayShort(dayNumber)}`}
                disabled={readOnly}
                data-no-drag
                onClick={(event) => setPopup({ kind: "day", rect: event.currentTarget.getBoundingClientRect(), workout, dayNumber })}
              >
                <CalendarDays aria-hidden="true" />
                {t.dayShort(dayNumber)}
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  className={styles.menu}
                  aria-label={t.workoutActions(workout.name)}
                  data-no-drag
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    openMenu(rect.left, rect.bottom + 2);
                  }}
                >
                  <MoreVertical aria-hidden="true" />
                </button>
              ) : null}
            </div>
          );
        }
        if (row.type === "exercise") {
          const { instance, workout } = row;
          return (
            <ExerciseRow
              key={instance.id}
              instance={instance}
              name={names.get(instance.exerciseId)?.name ?? "—"}
              cells={cellsAt(line)}
              readOnly={readOnly}
              apply={apply}
              entering={entering.includes(workout.id)}
              onContextMenu={(event) => onExerciseMenu(event, instance, workout)}
            />
          );
        }
        if (row.type === "add-exercise") {
          const open = adding === row.workout.id;
          return (
            <ExerciseCell
              key={`ae-${row.workout.id}-${open ? "open" : "closed"}`}
              name=""
              mode="add"
              readOnly={false}
              startOpen={open}
              style={place(0, line, 2)}
              idleStyle={place(0, line, 1)}
              onPick={(exerciseId) => {
                setAdding(null);
                apply?.((doc) => addExercise(doc, row.workout.id, exerciseId).doc);
              }}
            />
          );
        }
        return (
          <button
            key="add-workout"
            type="button"
            className={`${styles.cell} ${styles.addWorkout}`}
            style={place(0, line, 1)}
            data-no-drag
            onClick={() => apply?.((doc) => addCycleWorkout(doc, cycle.id, t.workoutName(nextWorkoutLetter(cycle))).doc)}
          >
            <Plus aria-hidden="true" />
            {t.addWorkout}
          </button>
        );
      })}

      {popup?.kind === "workout" ? (
        <ContextMenu
          x={popup.x}
          y={popup.y}
          label={t.workoutActions(popup.workout.name)}
          items={workoutMenu(popup)}
          onAction={(id) => onWorkoutAction(popup, id)}
          onClose={() => setPopup(null)}
        />
      ) : popup ? (
        <ContextMenu x={popup.rect.left} y={popup.rect.bottom + 2} items={[]} label={t.chooseDay} onAction={() => undefined} onClose={() => setPopup(null)}>
          <DayPicker
            count={Number(cycle.dayCount)}
            current={popup.dayNumber}
            onPick={(day) => {
              // Changes this workout's day; it never creates another workout.
              apply?.((doc) => moveWorkoutToDay(doc, popup.workout.id, day));
              setPopup(null);
            }}
          />
        </ContextMenu>
      ) : null}
    </div>
  );
}
