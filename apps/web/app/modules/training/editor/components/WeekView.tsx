import { effectiveBlock } from "../model/maxes";
import { ArrowRightLeft, Copy, CopyPlus, GripVertical, ListOrdered, MessageSquare, Moon, MoreVertical, Plus, Target, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AlertDialog, Button, ContextMenu, IconButton, Option, Select, type ContextMenuEntry } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { addWorkout, duplicateNode, newWorkout, removeNode, updateNode } from "../model/document";
import { WEEK_DAYS, copyDay, ensureWeekday, ensureWeekdayWorkout, nodeLabel, swapDays } from "../model/structure";
import { copyWorkoutToDay, moveWorkoutToDay, reorderWorkout, setDayNote } from "../model/workouts";
import type { TrainingDocument } from "@metrivum/api-client-web";
import { BlockFormulaScope } from "../block-maxes";
import { SimpleWorkoutTable } from "./SimpleWorkoutTable";
import { VolumeContent } from "./VolumePanel";
import { BlockMaxes, NotesEditor, SetsDialog, StructureBar } from "./TablePlanTools";
import type { EditorApi } from "../useEditor";
import styles from "./WeekView.module.css";

/** Monday-based weekday names for the current language (1 January 2024 was a Monday). */
function useWeekdays() {
  const locale = useLocale();
  return useMemo(() => {
    const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    const short = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    return Array.from({ length: WEEK_DAYS }, (_, i) => {
      const date = new Date(Date.UTC(2024, 0, 1 + i));
      return { long: long.format(date), short: short.format(date) };
    });
  }, [locale]);
}

/**
 * Simple mode: one cycle at a time, day by day. Each workout is a plain table where values are
 * typed straight into the cells (sets is a number), and the right panel sums up the volume of the
 * day and of the whole cycle. It works on any plan without changing its structure: blocks, cycles,
 * connections and formulas are left as they are (and edited in advanced mode). A 7-day cycle shows
 * weekdays (day 1 = Monday); an empty plan starts as one week.
 */
export function WeekView({
  doc,
  apply,
  names,
  pro,
}: {
  doc: TrainingDocument;
  /** Without it the view is read-only (e.g. the program page preview). */
  apply?: (fn: (doc: TrainingDocument) => TrainingDocument) => void;
  names: Map<string, ExerciseLabel>;
  /**
   * Pro (advanced builder): the table edits everything the sheet does. Blocks and cycles (with custom lengths),
   * progression, maxes, formulas, set-by-set editing and plan notes. Without it the table stays basic.
   */
  pro?: { editor: EditorApi; advancedAllowed: boolean; customFormulas: boolean; onEditNode: (id: string) => void };
}) {
  const readOnly = !apply;
  const full = pro && apply ? pro : null;
  const [setsFor, setSetsFor] = useState<string | null>(null);
  const edit = (fn: (doc: TrainingDocument) => TrainingDocument) => apply?.(fn);
  const m = useT();
  const t = m.editor.week;
  const weekdays = useWeekdays();
  const cycles = doc.blocks.flatMap((block) => block.cycles.map((cycle) => ({ block, cycle })));
  const [cycleId, setCycleId] = useState<string | null>(null);
  const cycle = (cycles.find((c) => c.cycle.id === cycleId) ?? cycles[0])?.cycle;
  const length = cycle ? Number(cycle.dayCount) : WEEK_DAYS;
  const week = length === WEEK_DAYS;
  const dayOf = (n: number) => cycle?.days.find((d) => Number(d.dayNumber) === n);
  const firstPlanned = cycle?.days.find((d) => d.workouts.length)?.dayNumber;
  const [dayNumber, setDayNumber] = useState<number>(firstPlanned ? Number(firstPlanned) : 1);
  const current = Math.min(dayNumber, length);
  const [workoutIndex, setWorkoutIndex] = useState(0);
  const day = dayOf(current);
  const workout = day?.workouts[Math.min(workoutIndex, (day?.workouts.length ?? 1) - 1)] ?? null;
  const currentBlock = cycles.find((item) => item.cycle.id === cycle?.id)?.block;
  const dayName = (n: number) => (week ? weekdays[n - 1]!.long : t.day(n));
  const notes = (doc.annotations ?? []).filter((note) => !note.targetId || note.targetId === cycle?.id || note.targetId === cycles.find((item) => item.cycle.id === cycle?.id)?.block.id);
  // Moving and copying days: drag a day onto another to swap them; "copy" then a day to paste onto it.
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [copying, setCopying] = useState<number | null>(null);
  // A workout on its way to another day (from its menu: copy or move), and a workout tab being dragged.
  const [placing, setPlacing] = useState<{ kind: "copy" | "move"; workoutId: string; name: string } | null>(null);
  const [draggingWorkout, setDraggingWorkout] = useState<string | null>(null);
  const [overTab, setOverTab] = useState<number | null>(null);
  const [workoutMenu, setWorkoutMenu] = useState<{ x: number; y: number } | null>(null);
  // Removing a workout asks first: it takes every exercise and set in it.
  const [removing, setRemoving] = useState<{ id: string; name: string; index: number } | null>(null);
  const dropDay = (from: number, to: number) => {
    if (!cycle || from === to) return;
    edit((doc) => swapDays(doc, cycle.id, from, to));
    setDayNumber(to);
    setWorkoutIndex(0);
  };
  const pasteDay = (to: number) => {
    if (!cycle || copying === null) return;
    const from = copying;
    setCopying(null);
    if (from === to) return;
    edit((doc) => copyDay(doc, cycle.id, from, to));
    setDayNumber(to);
    setWorkoutIndex(0);
  };

  // Pro: the cycle is as long as its days. "+" adds a day at the end; the last day, while empty, can be removed.
  const lastDay = dayOf(length);
  const canRemoveDay = Boolean(full && cycle && length > 1 && !lastDay?.workouts.length && !lastDay?.note);
  const addDay = () => {
    if (!cycle || length >= 366) return;
    edit((doc) => updateNode(doc, cycle.id, { dayCount: length + 1 }));
    setDayNumber(length + 1);
    setWorkoutIndex(0);
  };
  const removeDay = () => {
    if (!cycle || !canRemoveDay) return;
    edit((doc) => updateNode(doc, cycle.id, { days: cycle.days.filter((d) => Number(d.dayNumber) !== length), dayCount: length - 1 }));
    if (current >= length) setDayNumber(length - 1);
  };
  const placeWorkout = (to: number) => {
    if (!placing) return;
    const { kind, workoutId } = placing;
    setPlacing(null);
    if (kind === "move" && to === current) return;
    const targetCount = dayOf(to)?.workouts.length ?? 0;
    edit((doc) => (kind === "copy" ? copyWorkoutToDay(doc, workoutId, to) : moveWorkoutToDay(doc, workoutId, to)));
    setDayNumber(to);
    setWorkoutIndex(targetCount);
  };
  const dropWorkoutOnDay = (workoutId: string, to: number) => {
    if (to === current) return;
    const targetCount = dayOf(to)?.workouts.length ?? 0;
    edit((doc) => moveWorkoutToDay(doc, workoutId, to));
    setDayNumber(to);
    setWorkoutIndex(targetCount);
  };
  const workoutItems: ContextMenuEntry[] = [
    { id: "duplicate", label: t.duplicateWorkout, icon: <CopyPlus /> },
    { id: "copy", label: t.copyWorkoutTo, icon: <Copy /> },
    { id: "move", label: t.moveWorkoutTo, icon: <ArrowRightLeft /> },
    { type: "separator", id: "s1" },
    { id: "remove", label: t.removeWorkout, icon: <Trash2 />, tone: "danger" },
  ];
  const onWorkoutAction = (id: string) => {
    if (!workout || !day) return;
    const index = day.workouts.indexOf(workout);
    if (id === "duplicate") {
      edit((doc) => duplicateNode(doc, workout.id).doc);
      setWorkoutIndex(index + 1);
    } else if (id === "copy" || id === "move") {
      setCopying(null);
      setPlacing({ kind: id, workoutId: workout.id, name: workout.name || m.editor.untitled });
    } else if (id === "remove") {
      setRemoving({ id: workout.id, name: workout.name || m.editor.untitled, index });
    }
  };

  const planDay = () => {
    edit((doc) => {
      if (!cycle) return ensureWeekdayWorkout(doc, { block: t.blockName, cycle: t.cycleName, workout: m.editor.workoutName(1) }, current).doc;
      const ensured = ensureWeekday(doc, cycle.id, current);
      return ensured.dayId ? updateNode(ensured.doc, ensured.dayId, { workouts: [newWorkout(m.editor.workoutName(1))] }) : doc;
    });
    setWorkoutIndex(0);
  };

  // Comments and goals for this cycle (or the whole plan): compact cards under the day's table.
  const notesBlock = full ? <NotesEditor notes={notes} apply={apply!} /> : notes.length ? (
        <ul className={styles.planNotes} aria-label={t.notes}>
          {notes.map((note) => (
            <li key={note.id} className={styles.planNote} data-kind={note.kind}>
              <span className={styles.planNoteIcon} aria-hidden="true">{note.kind === "Goal" ? <Target /> : <MessageSquare />}</span>
              <span className={styles.planNoteText}>
                <span className={styles.planNoteMeta}>
                  {note.kind === "Goal" ? t.goal : t.comment}
                  <span className={styles.planNoteAudience}>{note.visibility === "Client" ? t.visibleToClient : t.coachOnly}</span>
                </span>
                {note.title && note.title !== note.kind ? <strong className={styles.planNoteTitle}>{note.title}</strong> : null}
                {note.content ? <span className={styles.planNoteBody} title={note.content}>{note.content}</span> : <span className={styles.planNoteEmpty}>{t.noteEmpty}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : null;

  return (
    <div className={styles.week}>
      {/* Left: cycle, days and the selected day. Right: the cycle's volume, from the top beside the days. */}
      <div className={styles.weekMain}>
      {full ? (
        <StructureBar doc={doc} apply={apply!} cycleId={cycle?.id ?? null} names={names} onEditNode={full.onEditNode}
          onSelectCycle={(id) => { setCycleId(id); setDayNumber(1); setWorkoutIndex(0); }} />
      ) : cycles.length > 1 ? (
        <div className={styles.cycleBar}>
          <Select
            label={t.cycle}
            size="sm"
            selectedKey={cycle?.id ?? null}
            onSelectionChange={(key) => {
              setCycleId(String(key));
              setDayNumber(1);
              setWorkoutIndex(0);
            }}
            className={styles.cycleSelect}
          >
            {cycles.map(({ block, cycle: c }) => (
              <Option key={c.id} id={c.id}>
                {`${nodeLabel(block, { untitled: m.editor.untitled, implicit: m.editor.noBlock })} · ${c.implicit ? (c.days[0]?.workouts[0]?.name || m.editor.untitled) : c.name || m.editor.untitled}`}
              </Option>
            ))}
          </Select>
        </div>
      ) : null}

      {copying !== null ? (
        <div className={styles.copyHint} role="status">
          <span>{t.copyHint(dayName(copying))}</span>
          <button type="button" className={styles.copyCancel} onClick={() => setCopying(null)}>{m.common.cancel}</button>
        </div>
      ) : placing ? (
        <div className={styles.copyHint} role="status">
          <span>{placing.kind === "copy" ? t.copyWorkoutHint(placing.name) : t.moveWorkoutHint(placing.name)}</span>
          <button type="button" className={styles.copyCancel} onClick={() => setPlacing(null)}>{m.common.cancel}</button>
        </div>
      ) : null}
      <div data-tip="table-days" className={styles.strip} role="tablist" aria-label={t.label} data-copying={copying !== null || placing !== null || undefined} style={week ? (full && cycle ? { gridTemplateColumns: "repeat(7, minmax(0, 1fr)) 2.75rem" } : undefined) : { gridTemplateColumns: "repeat(auto-fill, minmax(7.5rem, 1fr))" }}
        onKeyDown={(event) => { if (event.key === "Escape") { setCopying(null); setPlacing(null); } }}>
        {Array.from({ length }, (_, index) => {
          const number = index + 1;
          const d = dayOf(number);
          const count = d?.workouts.reduce((sum, w) => sum + w.exercises.length, 0) ?? 0;
          const movable = !readOnly && !!cycle && !!(d?.workouts.length || d?.note);
          return (
            <div key={number} className={styles.daySlot}>
            <button
              type="button"
              role="tab"
              aria-selected={number === current}
              className={styles.day}
              data-planned={d?.workouts.length ? true : undefined}
              data-dragging={dragging === number || undefined}
              data-over={(over === number && ((dragging !== null && dragging !== number) || (draggingWorkout !== null && number !== current))) || undefined}
              data-paste={(copying !== null && copying !== number) || (placing !== null && (placing.kind === "copy" || number !== current)) || undefined}
              draggable={movable}
              title={movable ? t.dragHint : undefined}
              onDragStart={(event) => { setDragging(number); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(number)); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              onDragOver={(event) => { if ((dragging !== null || draggingWorkout !== null) && !readOnly) { event.preventDefault(); setOver(number); } }}
              onDragLeave={() => setOver((value) => (value === number ? null : value))}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging !== null) dropDay(dragging, number);
                else if (draggingWorkout !== null) dropWorkoutOnDay(draggingWorkout, number);
                setDragging(null); setDraggingWorkout(null); setOver(null);
              }}
              onClick={() => {
                if (copying !== null) { pasteDay(number); return; }
                if (placing) { placeWorkout(number); return; }
                setDayNumber(number);
                setWorkoutIndex(0);
              }}
            >
              <span className={styles.dayName}>
                <span className={styles.long}>{dayName(number)}</span>
                <span className={styles.short}>{week ? weekdays[index]!.short : t.day(number)}</span>
              </span>
              <span className={styles.dayMeta}>{d?.workouts.length ? d.workouts.map((w) => w.name).join(", ") : d?.note || t.rest}</span>
              {count ? <span className={styles.dayCount}>{t.exercises(count)}</span> : null}
            </button>
            {number === length && canRemoveDay && copying === null && !placing ? (
              <button type="button" className={styles.dayCopy} aria-label={t.removeLastDay} title={t.removeLastDay} onClick={removeDay}>
                <X aria-hidden="true" />
              </button>
            ) : null}
            {movable && copying === null && !placing ? (
              <button type="button" className={styles.dayCopy} aria-label={t.copyDay(dayName(number))} title={t.copyDay(dayName(number))} onClick={() => setCopying(number)}>
                <Copy aria-hidden="true" />
              </button>
            ) : null}
            </div>
          );
        })}
        {full && cycle && copying === null && !placing ? (
          <button type="button" className={styles.addDay} aria-label={t.addDay} title={t.addDay} onClick={addDay}>
            <Plus aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.body}>
        <section data-tip="table-workout" className={styles.panel} role="tabpanel" aria-label={dayName(current)}>
          {workout && day ? (
            <>
              <header className={styles.panelHeader}>
                {!readOnly ? (
                  <IconButton label={t.workoutActions} icon={<MoreVertical />} size="sm" variant="ghost"
                    onPress={(event) => { const rect = (event.target as HTMLElement).getBoundingClientRect(); setWorkoutMenu({ x: rect.left, y: rect.bottom + 4 }); }} />
                ) : null}
                {workoutMenu ? <ContextMenu x={workoutMenu.x} y={workoutMenu.y} label={t.workoutActions} items={workoutItems} onAction={onWorkoutAction} onClose={() => setWorkoutMenu(null)} /> : null}
                <input
                  className={styles.workoutName}
                  aria-label={m.common.col.name}
                  value={workout.name}
                  readOnly={readOnly}
                  maxLength={200}
                  placeholder={m.editor.workoutName(1)}
                  onChange={(event) => edit((doc) => updateNode(doc, workout.id, { name: event.target.value }))}
                />
                <div className={styles.headerEnd}>
                  {day.workouts.length > 1 ? (
                    <div className={styles.workoutTabs}>
                      {day.workouts.map((w, i) => (
                        <button key={w.id} type="button" className={styles.workoutTab} aria-pressed={w.id === workout.id} onClick={() => setWorkoutIndex(i)}
                          draggable={!readOnly}
                          title={!readOnly ? t.workoutDragHint : undefined}
                          data-dragging={draggingWorkout === w.id || undefined}
                          // A line on the side where the dragged workout will land, not a frame around this one.
                          data-drop={overTab === i && draggingWorkout !== null && draggingWorkout !== w.id
                            ? (day.workouts.findIndex((x) => x.id === draggingWorkout) < i ? "after" : "before") : undefined}
                          onDragStart={(event) => { setDraggingWorkout(w.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", w.id); }}
                          onDragEnd={() => { setDraggingWorkout(null); setOverTab(null); setOver(null); }}
                          onDragOver={(event) => { if (draggingWorkout !== null) { event.preventDefault(); setOverTab(i); } }}
                          onDragLeave={() => setOverTab((value) => (value === i ? null : value))}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggingWorkout !== null && draggingWorkout !== w.id) {
                              edit((doc) => reorderWorkout(doc, draggingWorkout, i));
                              setWorkoutIndex(i);
                            }
                            setDraggingWorkout(null); setOverTab(null);
                          }}>
                          {!readOnly ? <GripVertical className={styles.workoutGrip} aria-hidden="true" /> : null}
                          {w.name || m.editor.workoutName(i + 1)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {full ? (
                    <Button size="sm" variant="ghost" iconStart={<ListOrdered />} onPress={() => setSetsFor(workout.id)}>{t.editSets}</Button>
                  ) : null}
                  {!readOnly ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconStart={<Plus />}
                      onPress={() => {
                        edit((doc) => addWorkout(doc, day.id, m.editor.workoutName(day.workouts.length + 1)).doc);
                        setWorkoutIndex(day.workouts.length);
                      }}
                    >
                      {t.addWorkout}
                    </Button>
                  ) : null}
                </div>
              </header>
              <div className={styles.editorArea}>
                <BlockFormulaScope block={effectiveBlock(doc, cycles.find(item => item.cycle.id === cycle?.id)?.block)}><SimpleWorkoutTable key={workout.id} workout={workout} names={names} apply={apply}
                  formulaAllowed={full?.advancedAllowed} customFormulas={full?.customFormulas} onEditSets={full ? () => setSetsFor(workout.id) : undefined} /></BlockFormulaScope>
              </div>
              {notesBlock}
              {full ? <BlockMaxes doc={doc} block={currentBlock} apply={apply} names={names} /> : null}
            </>
          ) : (
            <div className={styles.rest}>
              <div className={styles.restCard}>
                <span className={styles.restIcon} aria-hidden="true">
                  <Moon />
                </span>
                <div className={styles.restText}>
                  <h2 className={styles.restTitle}>{t.rest}</h2>
                  <p className={styles.restDay}>{dayName(current)}</p>
                </div>
                {!readOnly ? (
                  <Button size="sm" variant="primary" iconStart={<Plus />} onPress={planDay} className={styles.restAction}>
                    {t.startDay}
                  </Button>
                ) : null}
                {cycle ? (
                  <label className={styles.note}>
                    <span>{t.note}</span>
                    <textarea
                      key={`${cycle.id}-${current}`}
                      rows={3}
                      maxLength={2000}
                      readOnly={readOnly}
                      placeholder={t.notePlaceholder}
                      defaultValue={day?.note ?? ""}
                      onChange={(event) => edit((doc) => setDayNote(doc, cycle.id, current, event.target.value))}
                    />
                  </label>
                ) : null}
              </div>
              {notesBlock}
              {full ? <BlockMaxes doc={doc} block={currentBlock} apply={apply} names={names} /> : null}
            </div>
          )}
        </section>
      </div>
      </div>

        {full ? (
          <SetsDialog editor={full.editor} workout={day?.workouts.find((w) => w.id === setsFor) ?? null} names={names}
            advancedAllowed={full.advancedAllowed} customFormulas={full.customFormulas} onClose={() => setSetsFor(null)} />
        ) : null}
        <AlertDialog
          isOpen={removing !== null}
          onOpenChange={(open) => { if (!open) setRemoving(null); }}
          tone="danger"
          title={t.removeWorkoutTitle}
          confirmLabel={t.removeWorkout}
          cancelLabel={m.common.cancel}
          onConfirm={() => {
            if (!removing) return;
            edit((doc) => removeNode(doc, removing.id));
            setWorkoutIndex(Math.max(0, removing.index - 1));
            setRemoving(null);
          }}
        >
          <p>{removing ? t.removeWorkoutBody(removing.name) : null}</p>
        </AlertDialog>
        <aside data-tip="volume" className={styles.side} aria-label={m.editor.sheet.volume.title}>
          {/* Volume of the selected cycle by default; the panel switches to a workout, block or the whole plan. */}
          <VolumeContent
            key={cycle?.id ?? "none"}
            doc={doc}
            initial={{ scope: "cycle", id: cycle?.id ?? null }}
            names={names}
            title={<h2 className={styles.sideTitle}>{m.editor.sheet.volume.title}</h2>}
          />
        </aside>
    </div>
  );
}
