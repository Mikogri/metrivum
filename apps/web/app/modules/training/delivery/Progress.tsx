import type { Schema } from "@trainflow/api-client-web";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarDays, Dumbbell, X } from "lucide-react";
import { Alert, Button, DataTable, EmptyState, IconButton, NumberInput, Option, Select, Toolbar } from "@trainflow/ui-web";
import { Panel, StatStrip, StatStripSkeleton } from "~/shared/ui/Panel";
import { PeriodFilter } from "~/shared/ui/PeriodFilter";
import { useCoachingQuery } from "~/modules/coaching";
import { Failure } from "~/modules/coaching";
import { ExercisePicker } from "~/modules/exercises";
import { localDate } from "./Assignments";
import { ComparisonReport } from "./WorkoutReview";
import { PerformanceChart } from "./PerformanceChart";
import type { ActivityOptions } from "./Activity";
import styles from "./delivery.module.css";

interface Performance { occurrenceId?: string | null; exerciseId: string; name: string; performedDate: string; loadMeaning: string; sets: number; reps: number; volumeKg: number | null; bestLoadKg: number | null; averageRpe: number | null; averageRir: number | null; substitutionSets: number }
export interface ProgressData { feedback?: Schema<"TrainingFeedbackPoint">[] | null; feedbackHasMore?: boolean; from: string; to: string; planned: number; due: number; completed: number; skipped: number; missed: number; inProgress: number; completionPercentage: number | null; loggedLate: number; activeAssignments: number; actualSets: number; actualReps: number; volumeKg: number | null; programs: { programId: string; programName: string; completed: number }[]; clients: { relationshipId: string; due: number; completed: number; missed: number; latestCompletedAt: string | null }[]; performance: Performance[]; metricDefinition: string; clientsHasMore?: boolean; performanceHasMore?: boolean; totalTrainingSeconds?: number | null; averageSessionSeconds?: number | null; sessionsPerWeek?: number | null; weeks?: { weekStart: string; scheduled: number; completed: number; completionPercentage: number | null }[] | null }

export function TrainingProgress({ relationshipId, programId, groupId, from: fixedFrom, to: fixedTo, coach = false, report }: { relationshipId?: string; programId?: string; groupId?: string; from?: string; to?: string; coach?: boolean; report?: ProgressData }) {
  const [params, setParams] = useSearchParams();
  const update = (values: Record<string, string>) => setParams(previous => { const next = new URLSearchParams(previous); for (const [key, value] of Object.entries(values)) { if (value) next.set(`progress.${key}`, value); else next.delete(`progress.${key}`); } return next; }, { replace: true });
  const selectedProgram = params.get("progress.program") || "", blockId = params.get("progress.block") || "", cycleId = params.get("progress.cycle") || "";
  const setProgram = (value: string) => update({ program: value, block: "", cycle: "" });
  const setBlock = (value: string) => update({ block: value, cycle: "" });
  const setCycle = (value: string) => update({ cycle: value });
  const repetitions = params.get("progress.repetitions") || "";
  const metricParam = params.get("progress.metric");
  const metric = metricParam === "volumeKg" || metricParam === "reps" || metricParam === "sets" ? metricParam : "bestLoadKg";
  const setMetric = (value: string) => update({ metric: value });
  const from = params.get("progress.from") || localDate(new Date(Date.now() - 29 * 86400000)), to = params.get("progress.to") || localDate();
  const exercise = params.get("progress.exercise") ? { id: params.get("progress.exercise")!, name: params.get("progress.exerciseName") || "Selected exercise" } : null;
  const setExercise = (value: { id: string; name: string } | null) => update({ exercise: value?.id || "", exerciseName: value?.name || "" });
  const [picker, setPicker] = useState(false);
  const { mode } = useWorkspace();
  const options = useCoachingQuery<ActivityOptions>("/api/v1/training/activity-options", { relationshipId, programId: programId || selectedProgram || undefined }, !!relationshipId && !report);
  const query = useCoachingQuery<ProgressData>("/api/v1/training/progress", { relationshipId, programId: programId || selectedProgram || undefined, blockId: blockId || undefined, cycleId: cycleId || undefined, groupId, from: fixedFrom || from, to: fixedTo || to, exerciseId: exercise?.id, repetitions: repetitions ? Number(repetitions) : undefined, view: mode }, !report);
  const data = report ? { ...report, performance: report.performance.filter(point => !exercise || point.exerciseId === exercise.id) } : query.data;
  const series = new Map<string, Performance[]>();
  for (const point of data?.performance ?? []) { const key = `${point.exerciseId}:${point.loadMeaning}`; series.set(key, [...(series.get(key) ?? []), point]); }
  const minutes = (seconds: number | null | undefined) => (seconds == null ? "—" : `${Math.round(seconds / 60)} min`);
  const metricLabel = metric === "bestLoadKg" ? "Best load (kg)" : metric === "volumeKg" ? "Volume (kg·reps)" : metric === "reps" ? "Repetitions" : "Sets";
  const blocks = [...new Set(options.data?.structure.map(s => s.blockId))];
  return <section className={styles.stack} aria-labelledby="training-progress-title">
    <h2 id="training-progress-title" className={styles.sectionTitle}>Training progress</h2>
    <Toolbar aria-label="Progress filters" className={styles.filters}>
      {!fixedFrom && !fixedTo && <PeriodFilter from={from} to={to} earliest={options.data?.earliestDate} onChange={range => update(range)} />}
      {!!relationshipId && !programId && !report && <Select aria-label="Program" selectedKey={selectedProgram || "all"} onSelectionChange={key => setProgram(key === "all" ? "" : String(key))}><Option id="all">All programs</Option>{(options.data?.programs ?? []).map(p => <Option key={p.id} id={p.id}>{p.name}</Option>)}</Select>}
      {!!relationshipId && !programId && !report && selectedProgram && <Select aria-label="Block" selectedKey={blockId || "all"} onSelectionChange={key => setBlock(key === "all" ? "" : String(key))}><Option id="all">All blocks</Option>{blocks.map((id, i) => <Option key={id} id={id}>{`Block ${i + 1}`}</Option>)}</Select>}
      {!!relationshipId && !programId && !report && selectedProgram && <Select aria-label="Cycle" selectedKey={cycleId || "all"} onSelectionChange={key => setCycle(key === "all" ? "" : String(key))}><Option id="all">All cycles</Option>{(options.data?.structure ?? []).filter(s => !blockId || s.blockId === blockId).map((s, i) => <Option key={s.cycleId} id={s.cycleId}>{`Cycle ${i + 1} · ${s.firstDate}`}</Option>)}</Select>}
      <Button iconStart={<Dumbbell />} onPress={() => setPicker(true)}>{exercise?.name || "All exercises"}</Button>
      {exercise && <IconButton label="Clear exercise filter" icon={<X />} onPress={() => setExercise(null)} />}
      {!report && <NumberInput aria-label="Best performance at repetitions" placeholder="Any reps" minValue={1} maxValue={1000} value={repetitions ? Number(repetitions) : Number.NaN} onChange={value => update({ repetitions: Number.isFinite(value) ? String(value) : "" })} className={styles.reps} />}
      <Select aria-label="Strength metric" selectedKey={metric} onSelectionChange={key => setMetric(String(key))}><Option id="bestLoadKg">Best weight (kg)</Option><Option id="volumeKg">Volume (kg·reps)</Option><Option id="reps">Total repetitions</Option><Option id="sets">Recorded sets</Option></Select>
    </Toolbar>
    <ExercisePicker isOpen={picker} onOpenChange={setPicker} onPick={setExercise} />
    {!report && query.isPending ? <StatStripSkeleton labels={["Completed / due", "Completion", "Not logged", "Skipped", "Logged late", "Sets / reps", "Training time", "Avg. session", "Sessions / week"]} /> : !report && query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : data && <>
      {(data.clientsHasMore || data.performanceHasMore) && <Alert title="Showing part of the detailed results">Totals include all matching records. Narrow the date range, client or exercise filters to see the remaining details.</Alert>}
      <StatStrip items={[
        { label: "Completed / due", value: `${data.completed} / ${data.due}` },
        { label: "Completion", value: data.completionPercentage == null ? "—" : `${data.completionPercentage}%`, tone: "accent" },
        { label: "Not logged", value: data.missed, tone: data.missed ? "warning" : "default" },
        { label: "Skipped", value: data.skipped },
        { label: "Logged late", value: data.loggedLate },
        { label: "Sets / reps", value: `${data.actualSets} / ${data.actualReps}` },
        { label: "Training time", value: minutes(data.totalTrainingSeconds) },
        { label: "Avg. session", value: minutes(data.averageSessionSeconds) },
        { label: "Sessions / week", value: data.sessionsPerWeek ?? "—" },
      ]} />
      {!!data.weeks?.length && <Panel title="Weekly training" icon={<CalendarDays />} tone="blue" flush><DataTable label="Weekly training" rows={data.weeks} rowKey={w => w.weekStart} columns={[
        { id: "week", header: "Week starting", cell: w => w.weekStart },
        { id: "done", header: "Completed", cell: w => <span className={styles.itemProgress}><span className={styles.bar} role="meter" aria-valuemin={0} aria-valuemax={Math.max(1, w.scheduled)} aria-valuenow={w.completed} aria-label={`Completed workouts in week ${w.weekStart}`}><span style={{ width: `${Math.min(100, (w.completed / Math.max(1, w.scheduled)) * 100)}%` }} /></span>{w.completed} / {w.scheduled}</span> },
        { id: "rate", header: "Completion rate", align: "end", cell: w => w.completionPercentage == null ? "—" : `${w.completionPercentage}%` },
      ]} /></Panel>}
      {!data.performance.length ? <EmptyState title="No recorded exercise performance" description="Charts appear after actual sets are logged." /> : <div className={styles.charts}>{[...series].map(([key, points]) => {
        const usable = points.filter(point => point[metric] != null).sort((a, b) => a.performedDate.localeCompare(b.performedDate));
        const high = Math.max(...usable.map(point => point[metric]!));
        const workoutLink = (point: Performance) => { const next = new URLSearchParams(params); next.set("tab", "activity"); next.set("activity.workout", point.occurrenceId!); return `?${next}`; };
        const change = usable.length ? Number((usable.at(-1)![metric]! - usable[0]![metric]!).toFixed(2)) : null;
        return <Panel key={key} title={points[0]!.name} description={`${metricLabel}${points[0]!.loadMeaning !== "absolute" ? ` · ${points[0]!.loadMeaning}` : ""}`} actions={usable.length ? <span className={styles.chartFacts}><span>Latest <strong>{usable.at(-1)![metric]}</strong></span><span>Best <strong>{high}</strong></span>{change != null && <span data-tone={change > 0 ? "up" : change < 0 ? "down" : undefined}>{change > 0 ? "+" : ""}{change}</span>}</span> : undefined}>
          {usable.length > 0 && <PerformanceChart label={`${points[0]!.name}: ${metric} over time`} points={usable.map(point => ({ date: point.performedDate, value: point[metric]!, href: point.occurrenceId && relationshipId ? workoutLink(point) : undefined }))} />}
          <details className={styles.details}><summary>Sessions ({points.length})</summary><div className={styles.scroll}><table className={styles.table}><thead><tr><th>Date</th><th>Sets / reps</th><th>Best load (kg)</th><th>Volume</th><th>RPE / RIR</th></tr></thead><tbody>{points.map(point => <tr key={point.performedDate}><td>{point.occurrenceId && relationshipId ? <Link to={workoutLink(point)}>{point.performedDate}</Link> : point.performedDate}</td><td>{point.sets} / {point.reps}</td><td>{point.bestLoadKg ?? "—"}</td><td>{point.volumeKg ?? "—"}</td><td>{point.averageRpe ?? "—"} / {point.averageRir ?? "—"}</td></tr>)}</tbody></table></div></details>
        </Panel>;
      })}</div>}
      {!!data.feedback?.length && <Panel title="Workout feedback" description="Recorded session RPE, wellbeing and sleep. One observation per completed workout; missing feedback stays missing.">
        {data.feedbackHasMore && <Alert tone="warning" title="Showing the latest 1000 feedback entries. Narrow the dates for detail." />}
        {(["sessionRpe", "wellbeing", "sleepQuality"] as const).map(field => <section key={field}><h3>{field === "sessionRpe" ? "Session RPE (0–10)" : field === "wellbeing" ? "Wellbeing (1–5)" : "Sleep quality (1–5)"}</h3><PerformanceChart label={field} points={data.feedback!.map(point => ({ date: point.date, value: point[field] }))} /></section>)}
      </Panel>}
      {coach && data.clients.length > 0 && <Panel title="Client summary" flush><DataTable label="Client summary" rows={data.clients} rowKey={c => c.relationshipId} columns={[
        { id: "client", header: "Client", cell: c => <Link data-row-link to={`/app/clients/${c.relationshipId}?tab=progress`}>Open client progress</Link> },
        { id: "done", header: "Completed / due", cell: c => `${c.completed} / ${c.due}` },
        { id: "missed", header: "Not logged", cell: c => c.missed },
        { id: "last", header: "Last completion", cell: c => c.latestCompletedAt ? new Date(c.latestCompletedAt).toLocaleString() : "—" },
      ]} /></Panel>}
    </>}
    {!report && <ComparisonReport key={`${from}:${to}:${selectedProgram}:${blockId}:${cycleId}`} from={fixedFrom || from} to={fixedTo || to} relationshipId={relationshipId} programId={programId || selectedProgram || undefined} blockId={blockId || undefined} cycleId={cycleId || undefined} view={mode} />}
  </section>;
}
