import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Button, NumberInput, TextArea } from "@trainflow/ui-web";
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

export function WorkoutComparisonView({ data }: { data: Comparison }) {
  const pl = useAppLocale().locale === "pl";
  return <section className={styles.card}><h2>{pl ? "Plan a wykonanie" : "Planned vs Actual"}</h2>
    <p>{data.plannedExercises} → {data.performedExercises} {pl ? "ćwiczeń" : "exercises"} · {data.plannedSets} → {data.performedSets} {pl ? "serii/segmentów" : "sets/segments"}</p>
    <p>{pl ? "Powtórzenia" : "Repetitions"}: {range(data.plannedReps)} → {format(data.actualReps)} · {pl ? "Objętość" : "Volume"} (kg·reps): {range(data.plannedVolumeKg)} → {format(data.actualVolumeKg)}</p>
    {data.exercises.map((exercise, index) => <details className={styles.details} key={exercise.plannedInstanceId ?? `${exercise.actualExerciseId}:${index}`}><summary>{exercise.name} · {exercise.status} · {exercise.plannedSets} → {exercise.performedSets}</summary>
      <div className={styles.scroll}><table className={styles.table}><thead><tr><th>{pl ? "Seria" : "Set"}</th><th>{pl ? "Status" : "Status"}</th><th>Reps ({pl ? "plan → wynik" : "plan → actual"})</th><th>kg</th><th>RPE</th><th>RIR</th><th>{pl ? "Odchylenia" : "Deviations"}</th></tr></thead><tbody>{exercise.sets.map((set, i) => <tr key={i} style={set.deviations.length || ["Missing", "Skipped"].includes(set.status) ? { background: "color-mix(in srgb, var(--color-warning, #e9ae4a) 8%, transparent)" } : undefined}><td>{i + 1}</td><td>{set.status}</td><td>{range(set.plannedReps)} → {format(set.actualReps)}</td><td>{range(set.plannedLoadKg)} → {format(set.actualLoadKg)}</td><td>{format(set.plannedRpe)} → {format(set.actualRpe)}</td><td>{format(set.plannedRir)} → {format(set.actualRir)}</td><td>{set.deviations.join(" · ").replaceAll("_", " ") || "—"}</td></tr>)}</tbody></table></div>
    </details>)}
    <p className={styles.muted}>{pl ? "Porównanie z wersją planu zapisaną przy rozpoczęciu. Puste dane pozostają nieznane. Objętość obejmuje tylko jawnie podany całkowity ciężar zewnętrzny." : data.definition}</p>
  </section>;
}

export function WorkoutComparisonPanel({ executionId }: { executionId: string }) {
  const query = useCoachingQuery<Comparison>(`/api/v1/training/executions/${executionId}/comparison`);
  return query.isPending ? <Loading /> : query.error ? <Failure error={query.error} /> : query.data ? <WorkoutComparisonView data={query.data} /> : null;
}

export function ComparisonReport({ from, to, relationshipId, programId, blockId, cycleId, view }: { from: string; to: string; relationshipId?: string; programId?: string; blockId?: string; cycleId?: string; view?: string }) {
  const [page, setPage] = useState(1);
  const query = useCoachingQuery<{ items: Comparison[]; total: number; page: number; pageSize: number }>("/api/v1/training/comparison-report", { from, to, relationshipId, programId, blockId, cycleId, view, page, pageSize: 10 });
  const pl = useAppLocale().locale === "pl";
  return <section className={styles.stack}><h2>{pl ? "Wykonanie i feedback w czasie" : "Execution and feedback over time"}</h2>{query.isPending ? <Loading /> : query.error ? <Failure error={query.error} /> : <>{query.data?.items.map(item => <details className={styles.details} key={item.executionId}><summary>{item.performedDate} · {item.name} · {item.performedSets}/{item.plannedSets} · RPE {format(item.feedback?.sessionRpe)} · {pl ? "Samopoczucie" : "Wellbeing"} {format(item.feedback?.wellbeing)}/5 · {pl ? "Sen" : "Sleep"} {format(item.feedback?.sleepQuality)}/5</summary>{item.feedback?.note && <p>{item.feedback.note}</p>}<WorkoutComparisonView data={item} /></details>)}{query.data?.items.length === 0 && <p>{pl ? "Brak wykonanych treningów w tym okresie." : "No completed workouts in this period."}</p>}{query.data && <ListPagination data={query.data} onChange={setPage} />}</>}</section>;
}
