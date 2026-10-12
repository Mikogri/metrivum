import { useSearchParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { Button, DataTable, EmptyState, Option, Select, Toolbar, useMobileLayout } from "@trainflow/ui-web";
import { PeriodFilter } from "~/shared/ui/PeriodFilter";
import { StatStrip, StatStripSkeleton } from "~/shared/ui/Panel";
import { useCoachingQuery, Failure, Loading, ListPagination, StatusBadge, type Page } from "~/modules/coaching";
import { localDate } from "./Assignments";
import { MobileWorkoutRows, type Occurrence } from "./TrainingHome";
import type { ProgressData } from "./Progress";
import { WorkoutDetail } from "./WorkoutLog";
import styles from "./delivery.module.css";

export interface ActivityOptions { earliestDate?: string | null; programs: { id: string; name: string }[]; structure: { blockId: string; cycleId: string; firstDate: string; lastDate: string }[] }
export function TrainingActivity({ relationshipId }: { relationshipId: string }) {
  const mobile = useMobileLayout();
  const [params, setParams] = useSearchParams();
  const get = (name: string, fallback = "") => params.get(`activity.${name}`) || fallback;
  const update = (values: Record<string, string>) => setParams(previous => { const next = new URLSearchParams(previous); if (!Object.hasOwn(values, "workout") && !Object.hasOwn(values, "page")) next.delete("activity.page"); for (const [key, value] of Object.entries(values)) { if (value) next.set(`activity.${key}`, value); else next.delete(`activity.${key}`); } return next; }, { replace: true });
  const from = get("from", localDate(new Date(Date.now() - 29 * 86400000))), to = get("to", localDate());
  const programId = get("program"), blockId = get("block"), cycleId = get("cycle"), occurrence = get("workout");
  const filters = { relationshipId, from, to, programId: programId || undefined, blockId: blockId || undefined, cycleId: cycleId || undefined };
  const list = useCoachingQuery<Page<Occurrence>>("/api/v1/training/schedule", { ...filters, status: get("status") || undefined, sort: get("sort", "latest"), page: Number(get("page", "1")), pageSize: 25 });
  const summary = useCoachingQuery<ProgressData>("/api/v1/training/progress", filters);
  const options = useCoachingQuery<ActivityOptions>("/api/v1/training/activity-options", { relationshipId, programId: programId || undefined });
  const blocks = [...new Set(options.data?.structure.map(item => item.blockId) ?? [])];
  const cycleIndex = (id: string) => options.data?.structure.findIndex(s => s.cycleId === id) ?? -1;
  if (occurrence) return <section className={styles.stack}><div><Button variant="ghost" size="sm" iconStart={<ArrowLeft />} onPress={() => update({ workout: "" })}>Back to activity</Button></div><WorkoutDetail occurrenceId={occurrence} relationshipId={relationshipId} /></section>;
  const completed = summary.data?.programs.reduce((count, program) => count + program.completed, 0) ?? 0;
  return <section className={styles.stack} aria-label="Training activity">
    <Toolbar aria-label="Activity filters" className={styles.filters}>
      <PeriodFilter from={from} to={to} earliest={options.data?.earliestDate} onChange={range => update(range)} />
      <Select aria-label="Program" selectedKey={programId || "all"} onSelectionChange={key => update({ program: key === "all" ? "" : String(key), block: "", cycle: "" })}><Option id="all">All programs</Option>{(options.data?.programs ?? []).map(p => <Option key={p.id} id={p.id}>{p.name}</Option>)}</Select>
      {programId && <Select aria-label="Block" selectedKey={blockId || "all"} onSelectionChange={key => update({ block: key === "all" ? "" : String(key), cycle: "" })}><Option id="all">All blocks</Option>{blocks.map((id, i) => <Option key={id} id={id}>{`Block ${i + 1}`}</Option>)}</Select>}
      {programId && <Select aria-label="Cycle" selectedKey={cycleId || "all"} onSelectionChange={key => update({ cycle: key === "all" ? "" : String(key) })}><Option id="all">All cycles</Option>{(options.data?.structure ?? []).filter(s => !blockId || s.blockId === blockId).map((s, i) => <Option key={`${s.blockId}:${s.cycleId}`} id={s.cycleId}>{`Cycle ${i + 1} · ${s.firstDate}`}</Option>)}</Select>}
      <Select aria-label="Status" selectedKey={get("status") || "all"} onSelectionChange={key => update({ status: key === "all" ? "" : String(key) })}><Option id="all">All statuses</Option>{["Scheduled", "InProgress", "Completed", "Skipped", "Missed"].map(s => <Option key={s} id={s}>{s === "InProgress" ? "In progress" : s}</Option>)}</Select>
      <Select aria-label="Sort" selectedKey={get("sort", "latest")} onSelectionChange={key => update({ sort: String(key) })}><Option id="latest">Latest first</Option><Option id="oldest">Oldest first</Option></Select>
    </Toolbar>
    {options.isError && <Failure error={options.error} />}
    {summary.isPending ? <StatStripSkeleton labels={["Scheduled", "Completed", "Missed", "Skipped", "Completion rate"]} /> : summary.isError ? <Failure error={summary.error} /> : <StatStrip items={[
      { label: "Scheduled", value: summary.data.planned },
      { label: "Completed", value: completed, tone: "accent" },
      { label: "Missed", value: summary.data.missed, tone: summary.data.missed ? "warning" : "default" },
      { label: "Skipped", value: summary.data.skipped },
      { label: "Completion rate", value: summary.data.completionPercentage == null ? "—" : `${summary.data.completionPercentage}%` },
    ]} />}
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title="No workouts in this period" description="Change filters or assign a program with applied changes from Overview." /> : <>
      {mobile ? <MobileWorkoutRows items={list.data.items} onOpen={id => update({ workout: id })} /> : <DataTable label="Workouts" rows={list.data.items} rowKey={item => item.id} columns={[
        { id: "workout", header: "Workout", width: "26%", cell: item => <button type="button" data-row-link className={styles.rowLink} onClick={() => update({ workout: item.id })}><span>{item.name}</span><small>{item.programName}</small></button> },
        { id: "scheduled", header: "Scheduled", cell: item => item.scheduledDate },
        { id: "performed", header: "Performed", cell: item => item.performedDate ?? "—", hideOnMobile: true },
        { id: "structure", header: "Block / cycle", hideOnMobile: true, muted: true, cell: item => `B${blocks.includes(item.blockId) ? blocks.indexOf(item.blockId) + 1 : "?"} · C${cycleIndex(item.cycleId) >= 0 ? cycleIndex(item.cycleId) + 1 : "?"}` },
        { id: "duration", header: "Duration", hideOnMobile: true, align: "end", cell: item => item.durationSeconds == null ? "—" : `${Math.round(item.durationSeconds / 60)} min` },
        { id: "exercises", header: "Exercises", hideOnMobile: true, align: "end", cell: item => item.exerciseCount ?? "—" },
        { id: "notes", header: "Notes", hideOnMobile: true, muted: true, cell: item => [item.hasComment && "Comment", item.loggedLate && "Logged late"].filter(Boolean).join(" · ") || "—" },
        { id: "status", header: "Status", cell: item => <StatusBadge status={item.status === "InProgress" ? "In progress" : item.status} /> },
      ]} />}
      <ListPagination data={list.data} onChange={page => update({ page: String(page) })} />
    </>}
  </section>;
}
