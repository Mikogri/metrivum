import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Activity } from "lucide-react";
import { Button, EmptyState, NumberInput, TextArea } from "@trainflow/ui-web";
import { Failure, Loading, MutationError, ListPagination, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import styles from "./delivery.module.css";

type Feedback = Schema<"WorkoutFeedback">;
type Comparison = Schema<"WorkoutComparison">;
const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const range = (value: Schema<"TargetRange"> | null | undefined) => value == null ? "—" : value.minimum === value.maximum ? format(value.minimum) : `${format(value.minimum)}–${format(value.maximum)}`;

export function WorkoutFeedbackForm({ execution, own }: { execution: { id: string; version: number; status: string; feedback?: Feedback | null }; own: boolean }) {
  const pl = useAppLocale().locale === "pl";
  const [open, setOpen] = useState(!execution.feedback);
  const [draft, setDraft] = useState<Partial<Feedback>>(() => execution.feedback ?? {});
  const save = useCoachingMutation(() => setOpen(false));
  if (execution.status !== "Completed") return null;
  const labels = pl ? { title: "Krótki feedback po treningu", rating: "Ocena treningu", wellbeing: "Samopoczucie po treningu", sleep: "Sen ostatniej nocy", difficulty: "Trudność całego treningu (Session RPE)", note: "Notatka dla trenera (opcjonalnie)", save: "Zapisz feedback", later: "Później", edit: "Uzupełnij lub edytuj" }
    : { title: "Quick workout feedback", rating: "Workout rating", wellbeing: "Wellbeing after training", sleep: "Last night's sleep", difficulty: "Whole session difficulty (Session RPE)", note: "Note for your coach (optional)", save: "Save feedback", later: "Later", edit: "Add or edit feedback" };
  const rating = (key: "rating" | "wellbeing" | "sleepQuality", label: string) => <fieldset style={{ border: 0, padding: 0 }}><legend>{label} (1–5)</legend><div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>{[1, 2, 3, 4, 5].map(value => <Button key={value} size="sm" variant={draft[key] === value ? "primary" : "secondary"} aria-pressed={draft[key] === value} onPress={() => setDraft(previous => ({ ...previous, [key]: value }))}>{value}</Button>)}</div></fieldset>;
  return <section className={styles.card} aria-label={labels.title}><h2>{labels.title}</h2>
    {own && open ? <form className={styles.stack} onSubmit={event => { event.preventDefault(); save.mutate({ method: "PUT", path: `/api/v1/training/executions/${execution.id}/feedback`, ifMatch: execution.version, json: draft }); }}>
      {rating("rating", labels.rating)}{rating("wellbeing", labels.wellbeing)}{rating("sleepQuality", labels.sleep)}
      <NumberInput label={labels.difficulty} minValue={0} maxValue={10} step={0.5} value={draft.sessionRpe ?? NaN} onChange={value => setDraft(previous => ({ ...previous, sessionRpe: Number.isFinite(value) ? value : undefined }))} />
      <TextArea label={labels.note} maxLength={2000} value={draft.note ?? ""} onChange={note => setDraft(previous => ({ ...previous, note }))} />
      <MutationError error={save.error} /><div className={styles.actions}><Button type="submit" variant="primary" loading={save.isPending} isDisabled={!draft.rating || !draft.wellbeing || !draft.sleepQuality || draft.sessionRpe == null}>{labels.save}</Button><Button isDisabled={save.isPending} onPress={() => setOpen(false)}>{labels.later}</Button></div>
    </form> : <><p>{execution.feedback ? `${labels.rating}: ${execution.feedback.rating}/5 · Session RPE: ${execution.feedback.sessionRpe}/10 · ${labels.wellbeing}: ${execution.feedback.wellbeing}/5 · ${labels.sleep}: ${execution.feedback.sleepQuality}/5` : (pl ? "Feedback nie został jeszcze uzupełniony." : "Feedback has not been added yet.")}</p>{execution.feedback?.note && <p>{execution.feedback.note}</p>}{own && <Button onPress={() => setOpen(true)}>{labels.edit}</Button>}</>}
  </section>;
}

/** Planned against actual: four headline numbers, then each exercise with its sets side by side. */
export function WorkoutComparisonView({ data }: { data: Comparison }) {
  const pl = useAppLocale().locale === "pl";
  const t = pl
    ? { exercises: "Ćwiczenia", sets: "Serie", reps: "Powtórzenia", volume: "Objętość", plan: "plan", set: "Seria", status: "Status", deviation: "Odchylenia", note: "Porównanie z wersją planu zapisaną przy rozpoczęciu. Puste dane pozostają nieznane. Objętość obejmuje tylko jawnie podany całkowity ciężar zewnętrzny." }
    : { exercises: "Exercises", sets: "Sets", reps: "Reps", volume: "Volume", plan: "plan", set: "Set", status: "Status", deviation: "Notes", note: data.definition };
  const share = (done: number, planned: number) => planned ? Math.min(1, done / planned) : 0;
  const tiles = [
    { label: t.exercises, plan: format(data.plannedExercises), actual: format(data.performedExercises), progress: share(Number(data.performedExercises), Number(data.plannedExercises)) },
    { label: t.sets, plan: format(data.plannedSets), actual: format(data.performedSets), progress: share(Number(data.performedSets), Number(data.plannedSets)) },
    { label: t.reps, plan: range(data.plannedReps), actual: format(data.actualReps), progress: null },
    { label: `${t.volume} (kg)`, plan: range(data.plannedVolumeKg), actual: format(data.actualVolumeKg), progress: null },
  ];
  const tone = (status: string) => /missing|skipped|not/i.test(status) ? "missing" : /partial|substitut|extra/i.test(status) ? "partial" : "done";
  return <div className={styles.cmp}>
    <dl className={styles.cmpTiles}>{tiles.map(tile => <div key={tile.label}>
      <dt>{tile.label}</dt>
      <dd><strong>{tile.actual}</strong><span>{t.plan} {tile.plan}</span></dd>
      {tile.progress != null ? <span className={styles.cmpBar}><span style={{ transform: `scaleX(${tile.progress})` }} /></span> : null}
    </div>)}</dl>
    <ol className={styles.cmpList}>{data.exercises.map((exercise, index) => <li key={exercise.plannedInstanceId ?? `${exercise.actualExerciseId}:${index}`} className={styles.cmpExercise}>
      <header>
        <strong>{exercise.name}</strong>
        <span className={styles.cmpStatus} data-tone={tone(exercise.status)}>{exercise.status.replaceAll("_", " ")}</span>
        <span className={styles.cmpCount}>{format(exercise.performedSets)}<small>/{format(exercise.plannedSets)} {t.sets.toLowerCase()}</small></span>
      </header>
      <table className={styles.cmpTable}>
        <thead><tr><th>{t.set}</th><th>Reps</th><th>kg</th><th>RPE</th><th>RIR</th><th>{t.deviation}</th></tr></thead>
        <tbody>{exercise.sets.map((set, i) => <tr key={i} data-tone={tone(set.status)}>
          <td><span className={styles.cmpNo}>{i + 1}</span></td>
          <td><b>{format(set.actualReps)}</b>{range(set.plannedReps) !== "—" ? <small>{range(set.plannedReps)}</small> : null}</td>
          <td><b>{format(set.actualLoadKg)}</b>{range(set.plannedLoadKg) !== "—" ? <small>{range(set.plannedLoadKg)}</small> : null}</td>
          <td><b>{format(set.actualRpe)}</b>{format(set.plannedRpe) !== "—" ? <small>{format(set.plannedRpe)}</small> : null}</td>
          <td><b>{format(set.actualRir)}</b>{format(set.plannedRir) !== "—" ? <small>{format(set.plannedRir)}</small> : null}</td>
          <td className={styles.cmpNotes}>{set.deviations.length ? set.deviations.map(d => <span key={d}>{d.replaceAll("_", " ").toLowerCase()}</span>) : ["Missing", "Skipped"].includes(set.status) ? <span>{set.status.toLowerCase()}</span> : <i>—</i>}</td>
        </tr>)}</tbody>
      </table>
    </li>)}</ol>
    <p className={styles.cmpNote}>{t.note}</p>
  </div>;
}

export function WorkoutComparisonPanel({ executionId }: { executionId: string }) {
  const query = useCoachingQuery<Comparison>(`/api/v1/training/executions/${executionId}/comparison`);
  return query.isPending ? <Loading /> : query.error ? <Failure error={query.error} /> : query.data ? <WorkoutComparisonView data={query.data} /> : null;
}

export function ComparisonReport({ from, to, relationshipId, programId, blockId, cycleId, view }: { from: string; to: string; relationshipId?: string; programId?: string; blockId?: string; cycleId?: string; view?: string }) {
  const [page, setPage] = useState(1);
  const query = useCoachingQuery<{ items: Comparison[]; total: number; page: number; pageSize: number }>("/api/v1/training/comparison-report", { from, to, relationshipId, programId, blockId, cycleId, view, page, pageSize: 10 });
  const pl = useAppLocale().locale === "pl";
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(pl ? "pl-PL" : "en-GB", { day: "numeric", month: "short" });
  const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(pl ? "pl-PL" : "en-GB", { weekday: "short" });
  return <section className={styles.report} aria-labelledby="progress-report">
    <header className={styles.reportHead}>
      <h2 id="progress-report">{pl ? "Wykonanie i feedback" : "Execution and feedback"}</h2>
      <p>{pl ? "Każdy ukończony trening z tego okresu: ile serii zrobiono z planu i jak klient się czuł. Rozwiń, aby porównać z planem." : "Every completed workout in this period: how much of the plan was done and how the client felt. Open one to compare it with the plan."}</p>
    </header>
    {query.isPending ? <Loading /> : query.error ? <Failure error={query.error} /> : !query.data?.items.length ? (
      <EmptyState icon={<Activity />} title={pl ? "Brak ukończonych treningów" : "No completed workouts yet"}
        description={pl ? "Gdy klient oznaczy trening jako zrobiony, pojawi się tutaj razem z feedbackiem. Zmień okres, aby zobaczyć wcześniejsze." : "When the client marks a workout as done, it shows up here with their feedback. Change the period to see earlier ones."} />
    ) : <>
      <ul className={styles.reportList}>
        {query.data.items.map(item => {
          const done = item.plannedSets ? Math.min(1, Number(item.performedSets) / Number(item.plannedSets)) : 0;
          return <li key={item.executionId}><details className={styles.reportItem}>
            <summary>
              <span className={styles.reportDate}><strong>{day(item.performedDate)}</strong><span>{weekday(item.performedDate)}</span></span>
              <span className={styles.reportMain}>
                <strong>{item.name}</strong>
                <span className={styles.reportBar} aria-label={`${item.performedSets} / ${item.plannedSets} ${pl ? "serii" : "sets"}`}><span style={{ transform: `scaleX(${done})` }} /></span>
                <span className={styles.reportSets}>{item.performedSets} / {item.plannedSets} {pl ? "serii" : "sets"}</span>
              </span>
              <span className={styles.reportChips}>
                <span title="Session RPE">RPE <b>{format(item.feedback?.sessionRpe)}</b></span>
                <span title={pl ? "Samopoczucie" : "Wellbeing"}>{pl ? "Samop." : "Mood"} <b>{format(item.feedback?.wellbeing)}</b>/5</span>
                <span title={pl ? "Sen" : "Sleep"}>{pl ? "Sen" : "Sleep"} <b>{format(item.feedback?.sleepQuality)}</b>/5</span>
              </span>
            </summary>
            {item.feedback?.note ? <p className={styles.reportNote}>“{item.feedback.note}”</p> : null}
            <WorkoutComparisonView data={item} />
          </details></li>;
        })}
      </ul>
      <ListPagination data={query.data} onChange={setPage} />
    </>}
  </section>;
}
