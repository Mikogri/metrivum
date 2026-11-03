import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { Schema } from "@metrivum/api-client-web";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link, useSearchParams } from "react-router";
import { CalendarDays } from "lucide-react";
import { Alert, DataTable, EmptyState, NumberInput, Option, Select, Toolbar } from "@metrivum/ui-web";
import { Panel, StatStrip, StatStripSkeleton } from "~/shared/ui/Panel";
import { PeriodFilter } from "~/shared/ui/PeriodFilter";
import { useCoachingQuery } from "~/modules/coaching";
import { Failure } from "~/modules/coaching";
import { localDate } from "./Assignments";
import { ComparisonReport } from "./WorkoutReview";
import { ExerciseProgress } from "./ExerciseProgress";
import { FeedbackSummary } from "./FeedbackSummary";
import type { ActivityOptions } from "./Activity";
import styles from "./delivery.module.css";

interface Performance { occurrenceId?: string | null; exerciseId: string; name: string; performedDate: string; loadMeaning: string; sets: number; reps: number; volumeKg: number | null; bestLoadKg: number | null; averageRpe: number | null; averageRir: number | null; substitutionSets: number }
export interface ProgressData { feedback?: Schema<"TrainingFeedbackPoint">[] | null; feedbackHasMore?: boolean; from: string; to: string; planned: number; due: number; completed: number; skipped: number; missed: number; inProgress: number; completionPercentage: number | null; loggedLate: number; activeAssignments: number; actualSets: number; actualReps: number; volumeKg: number | null; programs: { programId: string; programName: string; completed: number }[]; clients: { relationshipId: string; due: number; completed: number; missed: number; latestCompletedAt: string | null }[]; performance: Performance[]; metricDefinition: string; clientsHasMore?: boolean; performanceHasMore?: boolean; totalTrainingSeconds?: number | null; averageSessionSeconds?: number | null; sessionsPerWeek?: number | null; weeks?: { weekStart: string; scheduled: number; completed: number; completionPercentage: number | null }[] | null }

export function TrainingProgress({ relationshipId, programId, groupId, from: fixedFrom, to: fixedTo, coach = false, report }: { relationshipId?: string; programId?: string; groupId?: string; from?: string; to?: string; coach?: boolean; report?: ProgressData }) {
  const uiCopy = useUiCopy();

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
  // Up to five exercises on the chart, kept in the address as "exerciseId:loadMeaning" keys.
  const chartKeys = (params.get("progress.chart") || "").split(",").filter(Boolean);
  const { mode } = useWorkspace();
  const options = useCoachingQuery<ActivityOptions>("/api/v1/training/activity-options", { relationshipId, programId: programId || selectedProgram || undefined }, !!relationshipId && !report);
  const query = useCoachingQuery<ProgressData>("/api/v1/training/progress", { relationshipId, programId: programId || selectedProgram || undefined, blockId: blockId || undefined, cycleId: cycleId || undefined, groupId, from: fixedFrom || from, to: fixedTo || to, repetitions: repetitions ? Number(repetitions) : undefined, view: mode }, !report);
  const data = report ?? query.data;
  const series = new Map<string, Performance[]>();
  for (const point of data?.performance ?? []) { const key = `${point.exerciseId}:${point.loadMeaning}`; series.set(key, [...(series.get(key) ?? []), point]); }
  const minutes = (seconds: number | null | undefined) => (seconds == null ? "—" : `${Math.round(seconds / 60)} min`);
  const blocks = [...new Set(options.data?.structure.map(s => s.blockId))];
  return <section className={styles.stack} aria-labelledby="training-progress-title">
    <h2 id="training-progress-title" className={styles.sectionTitle}>{uiCopy["ui"]["Training progress"]}</h2>
    <Toolbar aria-label={uiCopy["ui"]["Progress filters"]} className={styles.filters}>
      {!fixedFrom && !fixedTo && <PeriodFilter from={from} to={to} earliest={options.data?.earliestDate} onChange={range => update(range)} />}
      {!!relationshipId && !programId && !report && <Select aria-label={uiCopy["ui"]["Program"]} selectedKey={selectedProgram || "all"} onSelectionChange={key => setProgram(key === "all" ? "" : String(key))}><Option id="all">{uiCopy["ui"]["All programs"]}</Option>{(options.data?.programs ?? []).map(p => <Option key={p.id} id={p.id}>{p.name}</Option>)}</Select>}
      {!!relationshipId && !programId && !report && selectedProgram && <Select aria-label={uiCopy["editor"]["sheet"]["blockLabel"]} selectedKey={blockId || "all"} onSelectionChange={key => setBlock(key === "all" ? "" : String(key))}><Option id="all">{uiCopy["ui"]["All blocks"]}</Option>{blocks.map((id, i) => <Option key={id} id={id}>{formatInterfaceText(uiCopy["ui"]["Block {0}"], [i + 1])}</Option>)}</Select>}
      {!!relationshipId && !programId && !report && selectedProgram && <Select aria-label={uiCopy["editor"]["sheet"]["cycleLabel"]} selectedKey={cycleId || "all"} onSelectionChange={key => setCycle(key === "all" ? "" : String(key))}><Option id="all">{uiCopy["ui"]["All cycles"]}</Option>{(options.data?.structure ?? []).filter(s => !blockId || s.blockId === blockId).map((s, i) => <Option key={s.cycleId} id={s.cycleId}>{formatInterfaceText(uiCopy["ui"]["Cycle {0} · {1}"], [i + 1,s.firstDate])}</Option>)}</Select>}
      {!report && <NumberInput aria-label={uiCopy["ui"]["Best performance at repetitions"]} placeholder={uiCopy["ui"]["Any reps"]} minValue={1} maxValue={1000} value={repetitions ? Number(repetitions) : Number.NaN} onChange={value => update({ repetitions: Number.isFinite(value) ? String(value) : "" })} className={styles.reps} />}
    </Toolbar>
    {!report && query.isPending ? <StatStripSkeleton labels={["Completed / due", "Completion", "Not logged", "Skipped", "Logged late", "Sets / reps", "Training time", "Avg. session", "Sessions / week"]} /> : !report && query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : data && <>
      {(data.clientsHasMore || data.performanceHasMore) && <Alert title={uiCopy["ui"]["Showing part of the detailed results"]}>{uiCopy["ui"]["Totals include all matching records. Narrow the date range, client or exercise filters to see the remaining details."]}</Alert>}
      <StatStrip items={[
        { label: uiCopy["ui"]["Completed / due"], value: `${data.completed} / ${data.due}` },
        { label: uiCopy["ui"]["Completion"], value: data.completionPercentage == null ? "—" : `${data.completionPercentage}%`, tone: "accent" },
        { label: uiCopy["ui"]["Not logged"], value: data.missed, tone: data.missed ? "warning" : "default" },
        { label: uiCopy["ui"]["Skipped"], value: data.skipped },
        { label: uiCopy["ui"]["Logged late"], value: data.loggedLate },
        { label: uiCopy["ui"]["Sets / reps"], value: `${data.actualSets} / ${data.actualReps}` },
        { label: uiCopy["ui"]["Training time"], value: minutes(data.totalTrainingSeconds) },
        { label: uiCopy["ui"]["Avg. session"], value: minutes(data.averageSessionSeconds) },
        { label: uiCopy["ui"]["Sessions / week"], value: data.sessionsPerWeek ?? "—" },
      ]} />
      {!!data.weeks?.length && <Panel title={uiCopy["ui"]["Weekly training"]} icon={<CalendarDays />} tone="blue" flush><DataTable label={uiCopy["ui"]["Weekly training"]} rows={data.weeks} rowKey={w => w.weekStart} columns={[
        { id: "week", header: "Week starting", cell: w => w.weekStart },
        { id: "done", header: "Completed", cell: w => <span className={styles.itemProgress}><span className={styles.bar} role="meter" aria-valuemin={0} aria-valuemax={Math.max(1, w.scheduled)} aria-valuenow={w.completed} aria-label={formatInterfaceText(uiCopy["ui"]["Completed workouts in week {0}"], [w.weekStart])}><span style={{ width: `${Math.min(100, (w.completed / Math.max(1, w.scheduled)) * 100)}%` }} /></span>{w.completed} / {w.scheduled}</span> },
        { id: "rate", header: "Completion rate", align: "end", cell: w => w.completionPercentage == null ? "—" : `${w.completionPercentage}%` },
      ]} /></Panel>}
      {!data.performance.length ? <EmptyState title={uiCopy["ui"]["No recorded exercise performance"]} description={uiCopy["ui"]["The chart appears after actual sets are logged."]} />
        : <ExerciseProgress series={series} selected={chartKeys} onSelect={keys => update({ chart: keys.join(",") })} metric={metric} onMetric={setMetric}
          workoutLink={relationshipId ? point => { const next = new URLSearchParams(params); next.set("tab", "activity"); next.set("activity.workout", point.occurrenceId!); return `?${next}`; } : undefined} />}
      {!!data.feedback?.length && <FeedbackSummary points={data.feedback} completed={data.completed} hasMore={data.feedbackHasMore} />}
      {coach && data.clients.length > 0 && <Panel title={uiCopy["ui"]["Client summary"]} flush><DataTable label={uiCopy["ui"]["Client summary"]} rows={data.clients} rowKey={c => c.relationshipId} columns={[
        { id: "client", header: "Client", cell: c => <Link data-row-link to={`/app/clients/${c.relationshipId}?tab=progress`}>{uiCopy["ui"]["Open client progress"]}</Link> },
        { id: "done", header: "Completed / due", cell: c => `${c.completed} / ${c.due}` },
        { id: "missed", header: "Not logged", cell: c => c.missed },
        { id: "last", header: "Last completion", cell: c => c.latestCompletedAt ? new Date(c.latestCompletedAt).toLocaleString() : "—" },
      ]} /></Panel>}
    </>}
    {!report && <ComparisonReport key={`${from}:${to}:${selectedProgram}:${blockId}:${cycleId}`} from={fixedFrom || from} to={fixedTo || to} relationshipId={relationshipId} programId={programId || selectedProgram || undefined} blockId={blockId || undefined} cycleId={cycleId || undefined} view={mode} />}
  </section>;
}
