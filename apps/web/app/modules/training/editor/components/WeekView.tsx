import { effectiveBlock } from "../model/maxes";
import { Copy, MessageSquare, Moon, Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Option, Select } from "@trainflow/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { addWorkout, newWorkout, updateNode } from "../model/document";
import { WEEK_DAYS, copyDay, ensureWeekday, ensureWeekdayWorkout, swapDays } from "../model/structure";
import { cycleWorkouts, setDayNote } from "../model/workouts";
import type { TrainingDocument } from "@trainflow/api-client-web";
import { BlockFormulaScope } from "../block-maxes";
import { SimpleWorkoutTable } from "./SimpleWorkoutTable";
import { VolumeContent } from "./VolumePanel";
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
}: {
  doc: TrainingDocument;
  /** Without it the view is read-only (e.g. the program page preview). */
  apply?: (fn: (doc: TrainingDocument) => TrainingDocument) => void;
  names: Map<string, ExerciseLabel>;
}) {
  const readOnly = !apply;
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
  const dayName = (n: number) => (week ? weekdays[n - 1]!.long : t.day(n));
  const notes = (doc.annotations ?? []).filter((note) => !note.targetId || note.targetId === cycle?.id || note.targetId === cycles.find((item) => item.cycle.id === cycle?.id)?.block.id);
  // Moving and copying days: drag a day onto another to swap them; "copy" then a day to paste onto it.
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [copying, setCopying] = useState<number | null>(null);
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

  const planDay = () => {
    edit((doc) => {
      if (!cycle) return ensureWeekdayWorkout(doc, { block: t.blockName, cycle: t.cycleName, workout: m.editor.workoutName(1) }, current).doc;
      const ensured = ensureWeekday(doc, cycle.id, current);
      return ensured.dayId ? updateNode(ensured.doc, ensured.dayId, { workouts: [newWorkout(m.editor.workoutName(1))] }) : doc;
    });
    setWorkoutIndex(0);
  };

  // Comments and goals for this cycle (or the whole plan): compact cards under the day's table.
  const notesBlock = notes.length ? (
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
      {cycles.length > 1 ? (
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
                {`${block.name || m.editor.untitled} · ${c.name || m.editor.untitled}`}
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
      ) : null}
      <div className={styles.strip} role="tablist" aria-label={t.label} data-copying={copying !== null || undefined} style={week ? undefined : { gridTemplateColumns: `repeat(${length}, minmax(7.5rem, 1fr))` }}
        onKeyDown={(event) => { if (event.key === "Escape") setCopying(null); }}>
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
              data-over={(over === number && dragging !== null && dragging !== number) || undefined}
              data-paste={(copying !== null && copying !== number) || undefined}
              draggable={movable}
              title={movable ? t.dragHint : undefined}
              onDragStart={(event) => { setDragging(number); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(number)); }}
              onDragEnd={() => { setDragging(null); setOver(null); }}
              onDragOver={(event) => { if (dragging !== null && !readOnly) { event.preventDefault(); setOver(number); } }}
              onDragLeave={() => setOver((value) => (value === number ? null : value))}
              onDrop={(event) => { event.preventDefault(); if (dragging !== null) dropDay(dragging, number); setDragging(null); setOver(null); }}
              onClick={() => {
                if (copying !== null) { pasteDay(number); return; }
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
            {movable && copying === null ? (
              <button type="button" className={styles.dayCopy} aria-label={t.copyDay(dayName(number))} title={t.copyDay(dayName(number))} onClick={() => setCopying(number)}>
                <Copy aria-hidden="true" />
              </button>
            ) : null}
            </div>
          );
        })}
      </div>

      <div className={styles.body}>
        <section className={styles.panel} role="tabpanel" aria-label={dayName(current)}>
          {workout && day ? (
            <>
              <header className={styles.panelHeader}>
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
                        <button key={w.id} type="button" className={styles.workoutTab} aria-pressed={w.id === workout.id} onClick={() => setWorkoutIndex(i)}>
                          {w.name || m.editor.workoutName(i + 1)}
                        </button>
                      ))}
                    </div>
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
                <BlockFormulaScope block={effectiveBlock(doc, cycles.find(item => item.cycle.id === cycle?.id)?.block)}><SimpleWorkoutTable key={workout.id} workout={workout} names={names} apply={apply} /></BlockFormulaScope>
              </div>
              {notesBlock}
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
            </div>
          )}
        </section>
      </div>
      </div>

        <aside className={styles.side} aria-label={m.editor.sheet.volume.title}>
          {/* Volume of the whole selected cycle (not of one day). */}
          <VolumeContent
            names={names}
            title={<h2 className={styles.sideTitle}>{m.editor.sheet.volume.title}</h2>}
            sections={cycle ? [{ id: "cycle", title: `${m.editor.sheet.volume.cycleTotal} · ${cycle.name}`, workouts: cycleWorkouts(cycle), perWorkout: false }] : []}
          />
        </aside>
    </div>
  );
}
