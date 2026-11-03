import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Activity, Gauge, Moon, PencilLine, Smile, Star } from "lucide-react";
import { Button, EmptyState, TextArea } from "@metrivum/ui-web";
import { Failure, Loading, MutationError, ListPagination, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import styles from "./delivery.module.css";

type Feedback = Schema<"WorkoutFeedback">;
type Comparison = Schema<"WorkoutComparison">;
const format = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
const range = (value: Schema<"TargetRange"> | null | undefined) => value == null ? "—" : value.minimum === value.maximum ? format(value.minimum) : `${format(value.minimum)}–${format(value.maximum)}`;

const feedbackText = (pl: boolean) => pl ? {
  rating: "Trening", wellbeing: "Samopoczucie", sleep: "Sen ostatniej nocy", difficulty: "Trudność (Session RPE)", note: "Notatka dla trenera", notePlaceholder: "Co poszło dobrze, co bolało, co zmienić",
  scale: ["Słabo", "Tak sobie", "OK", "Dobrze", "Świetnie"], rpe: ["Bardzo lekko", "Lekko", "Umiarkowanie", "Ciężko", "Bardzo ciężko", "Maksymalnie"],
} : {
  rating: "Workout", wellbeing: "Wellbeing", sleep: "Last night's sleep", difficulty: "Effort (session RPE)", note: "Note for your coach", notePlaceholder: "What went well, what hurt, what to change",
  scale: ["Poor", "Meh", "OK", "Good", "Great"], rpe: ["Very easy", "Easy", "Moderate", "Hard", "Very hard", "Max"],
};
const rpeWordOf = (words: string[], value: number) => words[value <= 2 ? 0 : value <= 4 ? 1 : value <= 6 ? 2 : value <= 8 ? 3 : value < 10 ? 4 : 5];

/** The four answers and the note, used in the feedback card and in the log panel. */
export function FeedbackFields({ value, onChange }: { value: Partial<Feedback>; onChange: (next: Partial<Feedback>) => void }) {
  const t = feedbackText(useAppLocale().locale === "pl");
  const scale = (key: "rating" | "wellbeing" | "sleepQuality", label: string) => <fieldset className={styles.fbScale}>
    <legend>{label}</legend>
    <div role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={value[key] === n} data-value={n}
      onClick={() => onChange({ ...value, [key]: n })}><b>{n}</b><small>{t.scale[n - 1]}</small></button>)}</div>
  </fieldset>;
  return <>
    <div className={styles.fbScales}>{scale("rating", t.rating)}{scale("wellbeing", t.wellbeing)}{scale("sleepQuality", t.sleep)}</div>
    <fieldset className={styles.fbRpe}>
      <legend>{t.difficulty}{value.sessionRpe != null ? <span> · <b>{value.sessionRpe}</b> {rpeWordOf(t.rpe, Number(value.sessionRpe))}</span> : null}</legend>
      <div role="radiogroup" aria-label={t.difficulty}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <button key={n} type="button" role="radio" aria-checked={value.sessionRpe === n}
        style={{ "--rpe": n } as React.CSSProperties} onClick={() => onChange({ ...value, sessionRpe: n })}>{n}</button>)}</div>
    </fieldset>
    <TextArea label={t.note} placeholder={t.notePlaceholder} maxLength={2000} rows={3} value={value.note ?? ""} onChange={note => onChange({ ...value, note })} />
  </>;
}

/**
 * How the workout felt. Only the athlete fills it in (own); everyone else, the coach included, sees what they said.
 */
export function WorkoutFeedbackForm({ execution, own }: { execution: { id: string; version: number; status: string; feedback?: Feedback | null }; own: boolean }) {
  const pl = useAppLocale().locale === "pl";
  const [open, setOpen] = useState(own && !execution.feedback);
  const [draft, setDraft] = useState<Partial<Feedback>>(() => execution.feedback ?? {});
  const save = useCoachingMutation(() => setOpen(false));
  if (execution.status !== "Completed") return null;
  const t = pl ? {
    titleOwn: "Jak poszło?", title: "Feedback klienta", subOwn: "Krótka ocena po treningu. Trener ją zobaczy.", sub: "Jak klient ocenił ten trening.",
    rating: "Trening", wellbeing: "Samopoczucie", sleep: "Sen ostatniej nocy", difficulty: "Trudność (Session RPE)", note: "Notatka dla trenera", notePlaceholder: "Co poszło dobrze, co bolało, co zmienić",
    save: "Zapisz", later: "Później", edit: "Edytuj", add: "Dodaj feedback", none: "Klient nie dodał jeszcze feedbacku.", noneOwn: "Nie dodano jeszcze feedbacku.",
    scale: ["Słabo", "Tak sobie", "OK", "Dobrze", "Świetnie"], rpe: ["Bardzo lekko", "Lekko", "Umiarkowanie", "Ciężko", "Bardzo ciężko", "Maksymalnie"],
  } : {
    titleOwn: "How did it go?", title: "Client feedback", subOwn: "A quick check-in after the workout. Your coach sees it.", sub: "How the client rated this workout.",
    rating: "Workout", wellbeing: "Wellbeing", sleep: "Last night's sleep", difficulty: "Effort (session RPE)", note: "Note for your coach", notePlaceholder: "What went well, what hurt, what to change",
    save: "Save", later: "Later", edit: "Edit", add: "Add feedback", none: "The client hasn't added feedback yet.", noneOwn: "No feedback yet.",
    scale: ["Poor", "Meh", "OK", "Good", "Great"], rpe: ["Very easy", "Easy", "Moderate", "Hard", "Very hard", "Max"],
  };
  const rpeWord = (value: number) => t.rpe[value <= 2 ? 0 : value <= 4 ? 1 : value <= 6 ? 2 : value <= 8 ? 3 : value < 10 ? 4 : 5];
  const fb = execution.feedback;
  const summary = (key: "rating" | "wellbeing" | "sleepQuality", label: string, icon: React.ReactNode) => fb ? <div className={styles.fbStat} data-value={fb[key]}>
    <span className={styles.fbIcon}>{icon}</span><span><small>{label}</small><strong>{fb[key]}/5 · {t.scale[(fb[key] ?? 1) - 1]}</strong></span>
  </div> : null;
  return <section className={styles.fb} aria-labelledby={`feedback-${execution.id}`}>
    <header className={styles.fbHead}>
      <div><h2 id={`feedback-${execution.id}`}>{own ? t.titleOwn : t.title}</h2><p>{own ? t.subOwn : t.sub}</p></div>
      {own && !open ? <Button size="sm" variant="secondary" iconStart={<PencilLine />} onPress={() => setOpen(true)}>{fb ? t.edit : t.add}</Button> : null}
    </header>
    {own && open ? <form className={styles.fbForm} onSubmit={event => { event.preventDefault(); save.mutate({ method: "PUT", path: `/api/v1/training/executions/${execution.id}/feedback`, ifMatch: execution.version, json: draft }); }}>
      <FeedbackFields value={draft} onChange={setDraft} />
      <MutationError error={save.error} />
      <div className={styles.fbActions}>
        <Button variant="ghost" isDisabled={save.isPending} onPress={() => { setDraft(fb ?? {}); setOpen(false); }}>{t.later}</Button>
        <Button type="submit" variant="primary" loading={save.isPending} isDisabled={!draft.rating || !draft.wellbeing || !draft.sleepQuality || draft.sessionRpe == null}>{t.save}</Button>
      </div>
    </form> : fb ? <>
      <div className={styles.fbStats}>
        {summary("rating", t.rating, <Star />)}
        {summary("wellbeing", t.wellbeing, <Smile />)}
        {summary("sleepQuality", t.sleep, <Moon />)}
        <div className={styles.fbStat} data-rpe><span className={styles.fbIcon}><Gauge /></span><span><small>{t.difficulty}</small><strong>{format(fb.sessionRpe)}/10 · {rpeWord(Number(fb.sessionRpe))}</strong></span></div>
      </div>
      {fb.note ? <blockquote className={styles.fbNote}>{fb.note}</blockquote> : null}
    </> : <p className={styles.fbEmpty}>{own ? t.noneOwn : t.none}</p>}
  </section>;
}

/** Planned against actual: four headline numbers, then each exercise with its sets side by side. */
export function WorkoutComparisonView({ data }: { data: Comparison }) {
  const uiCopy = useUiCopy();

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
        <thead><tr><th>{t.set}</th><th>{uiCopy["editor"]["columns"]["reps"]}</th><th>kg</th><th>RPE</th><th>RIR</th><th>{t.deviation}</th></tr></thead>
        <tbody>{exercise.sets.map((set, i) => <tr key={i} data-tone={tone(set.status)}>
          <td><span className={styles.cmpNo}>{i + 1}</span></td>
          <td><b>{format(set.actualReps)}</b>{range(set.plannedReps) !== "—" ? <small>{range(set.plannedReps)}</small> : null}</td>
          <td><b>{format(set.actualLoadKg)}</b>{range(set.plannedLoadKg) !== "—" ? <small>{range(set.plannedLoadKg)}</small> : null}</td>
          <td><b>{format(set.actualRpe)}</b>{format(set.plannedRpe) !== "—" ? <small>{format(set.plannedRpe)}</small> : null}</td>
          <td><b>{format(set.actualRir)}</b>{format(set.plannedRir) !== "—" ? <small>{format(set.plannedRir)}</small> : null}</td>
          <td><span className={styles.cmpNotes}>{set.deviations.length ? set.deviations.map(d => <span key={d}>{d.replaceAll("_", " ").toLowerCase()}</span>) : ["Missing", "Skipped"].includes(set.status) ? <span data-tone="missing">{set.status.toLowerCase()}</span> : <i>—</i>}</span></td>
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
 const uiCopy = useUiCopy();

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
                <span className={styles.reportSets}>{item.performedSets} / {item.plannedSets} {pl ? "serii" : uiCopy["ui"]["sets"]}</span>
              </span>
              <span className={styles.reportChips}>
                <span title={uiCopy["ui"]["Session RPE"]}>RPE <b>{format(item.feedback?.sessionRpe)}</b></span>
                <span title={pl ? "Samopoczucie" : uiCopy["ui"]["Wellbeing"]}>{pl ? "Samop." : "Mood"} <b>{format(item.feedback?.wellbeing)}</b>/5</span>
                <span title={pl ? "Sen" : uiCopy["profile"]["fields"]["Sleep"]}>{pl ? "Sen" : uiCopy["profile"]["fields"]["Sleep"]} <b>{format(item.feedback?.sleepQuality)}</b>/5</span>
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
