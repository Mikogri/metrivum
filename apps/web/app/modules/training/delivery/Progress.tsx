import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, Button } from "@trainflow/ui-web";
import { useCoachingQuery } from "~/modules/coaching";
import { Failure, Loading } from "~/modules/coaching";
import { ExercisePicker } from "~/modules/exercises";
import { localDate } from "./Assignments";
import styles from "./delivery.module.css";

interface Performance { exerciseId: string; name: string; performedDate: string; loadMeaning: string; sets: number; reps: number; volumeKg: number | null; bestLoadKg: number | null; averageRpe: number | null; averageRir: number | null; substitutionSets: number }
export interface ProgressData { from: string; to: string; planned: number; due: number; completed: number; skipped: number; missed: number; inProgress: number; completionPercentage: number | null; loggedLate: number; activeAssignments: number; actualSets: number; actualReps: number; volumeKg: number | null; programs: { programId: string; programName: string; completed: number }[]; clients: { relationshipId: string; due: number; completed: number; missed: number; latestCompletedAt: string | null }[]; performance: Performance[]; metricDefinition: string }

export function TrainingProgress({ relationshipId, programId, groupId, from: fixedFrom, to: fixedTo, coach = false, report }: { relationshipId?: string; programId?: string; groupId?: string; from?: string; to?: string; coach?: boolean; report?: ProgressData }) {
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(localDate());
  const [exercise, setExercise] = useState<{ id: string; name: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const { mode } = useWorkspace();
  const query = useCoachingQuery<ProgressData>("/api/v1/training/progress", { relationshipId, programId, groupId, from: fixedFrom || from, to: fixedTo || to, exerciseId: exercise?.id, view: mode }, !report);
  const data = report ? { ...report, performance: report.performance.filter(point => !exercise || point.exerciseId === exercise.id) } : query.data;
  const series = new Map<string, Performance[]>();
  for (const point of data?.performance ?? []) { const key = `${point.exerciseId}:${point.loadMeaning}`; series.set(key, [...(series.get(key) ?? []), point]); }
  return <section className={styles.stack}><h2>Training progress</h2><div className={styles.toolbar}>
    {!fixedFrom && <label className={styles.field}>From<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label>}
    {!fixedTo && <label className={styles.field}>Through<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label>}
    <Button onPress={() => setPicker(true)}>{exercise?.name || "Filter by exercise"}</Button>{exercise && <Button variant="ghost" onPress={() => setExercise(null)}>All exercises</Button>}
  </div><ExercisePicker isOpen={picker} onOpenChange={setPicker} onPick={setExercise} />
    {!report && query.isPending ? <Loading /> : !report && query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : data && <>
      <div className={styles.grid}>{[["Completed / due", `${data.completed} / ${data.due}`], ["Completion", data.completionPercentage == null ? "N/A" : `${data.completionPercentage}%`], ["Not logged by deadline", data.missed], ["Skipped", data.skipped], ["Logged late", data.loggedLate], ["Actual sets / reps", `${data.actualSets} / ${data.actualReps}`]].map(([label, value]) => <div key={label} className={styles.card}><p className={styles.muted}>{label}</p><strong className={styles.number}>{value}</strong></div>)}</div>
      <p className={styles.muted}>{data.metricDefinition}</p>
      {!data.performance.length ? <EmptyState title="No recorded exercise performance" description="Charts appear after actual sets are logged. Prescribed weights are never treated as performed training." /> : [...series].map(([key, points]) => {
        const usable = points.filter(point => point.bestLoadKg != null).sort((a, b) => a.performedDate.localeCompare(b.performedDate));
        const low = Math.min(...usable.map(point => point.bestLoadKg!)); const high = Math.max(...usable.map(point => point.bestLoadKg!));
        const line = usable.map((point, i) => `${20 + i / Math.max(1, usable.length - 1) * 560},${135 - (point.bestLoadKg! - low) / Math.max(1, high - low) * 115}`).join(" ");
        return <article className={styles.card} key={key}><h3>{points[0]!.name} · {points[0]!.loadMeaning}</h3><p className={styles.muted}>Best recorded load per training date, kg. Different exercises and load meanings are kept separate.</p>
          {usable.length > 1 && <svg className={styles.chart} viewBox="0 0 600 160" role="img" aria-label={`${points[0]!.name}: best recorded load in kg over time`}><polyline points={line} /></svg>}
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Date</th><th>Sets / reps</th><th>Best load (kg)</th><th>Volume (kg·reps)</th><th>RPE / RIR</th><th>Substituted sets</th></tr></thead><tbody>{points.map(point => <tr key={point.performedDate}><td>{point.performedDate}</td><td>{point.sets} / {point.reps}</td><td>{point.bestLoadKg ?? "—"}</td><td>{point.volumeKg ?? "—"}</td><td>{point.averageRpe ?? "—"} / {point.averageRir ?? "—"}</td><td>{point.substitutionSets}</td></tr>)}</tbody></table></div></article>;
      })}
      {coach && data.clients.length > 0 && <article className={styles.card}><h3>Client summary</h3><table className={styles.table}><thead><tr><th>Client record</th><th>Completed / due</th><th>Unlogged</th><th>Last completion</th></tr></thead><tbody>{data.clients.map(client => <tr key={client.relationshipId}><td><Link to={`/app/clients/${client.relationshipId}?tab=progress`}>Open client progress</Link></td><td>{client.completed} / {client.due}</td><td>{client.missed}</td><td>{client.latestCompletedAt ? new Date(client.latestCompletedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></article>}
    </>}
  </section>;
}
