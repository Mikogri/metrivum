import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, DataTable, EmptyState, PageHeader, Tab, TabList, Tabs, TextField, Toolbar, Select, Option, useMobileLayout } from "@trainflow/ui-web";
import { useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading, StatusBadge } from "~/modules/coaching";
import { AssignmentList, localDate } from "./Assignments";
import { TrainingProgress } from "./Progress";
import { TrainingPlansTab } from "../purchases/TrainingPlans";
import styles from "./delivery.module.css";

export interface Occurrence { exerciseCount?: number | null; revisionId: string; blockId: string; cycleId: string; performedDate: string | null; durationSeconds: number | null; hasComment: boolean; id: string; assignmentId: string; relationshipId: string; programId: string; programName: string; name: string; scheduledDate: string; deadline: string; status: string; executionId: string | null; loggedLate: boolean; allowedActions: string[] }
export function MobileWorkoutRows({ items, coach = false, onOpen }: { items: Occurrence[]; coach?: boolean; onOpen?: (id: string) => void }) {
  return <ul className={styles.rows} aria-label="Workouts">{items.map(item => {
    const content = <><span className={styles.itemMain}><strong>{item.name}</strong><span className={styles.itemMeta}>{item.programName} · {item.scheduledDate}{item.exerciseCount != null ? ` · ${item.exerciseCount} exercises` : ""}</span>{item.loggedLate && <span className={styles.itemMeta}>Logged late</span>}</span><StatusBadge status={item.status === "InProgress" ? "In progress" : item.status} /></>;
    return <li key={item.id}>{onOpen ? <button type="button" className={styles.workoutRow} onClick={() => onOpen(item.id)}>{content}</button> : <Link className={styles.workoutRow} to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}>{content}</Link>}</li>;
  })}</ul>;
}
export function TrainingSchedule({ relationshipId, programId, coach = false }: { relationshipId?: string; programId?: string; coach?: boolean }) {
  const mobile = useMobileLayout();
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - (mobile ? 30 : 7) * 86400000)));
  const [to, setTo] = useState(() => localDate(new Date(Date.now() + 30 * 86400000)));
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Occurrence>>("/api/v1/training/schedule", { relationshipId, programId, from, to, status: status || undefined, page, pageSize: 30, view: mode });
  return <section className={styles.stack} aria-label="Workout schedule and history"><Toolbar aria-label="Schedule filters" className={styles.filters}>
    <span className={styles.range}><TextField aria-label="From" type="date" value={from} onChange={value => { setFrom(value); setPage(1); }} /><span aria-hidden="true">–</span><TextField aria-label="Through" type="date" value={to} onChange={value => { setTo(value); setPage(1); }} /></span>
    <Select aria-label="Workout status" selectedKey={status || "all"} onSelectionChange={key => { setStatus(key === "all" ? "" : String(key)); setPage(1); }}><Option id="all">All statuses</Option>{["Scheduled", "InProgress", "Completed", "Skipped", "Missed"].map(value => <Option key={value} id={value}>{value === "InProgress" ? "In progress" : value}</Option>)}</Select>
    <Button variant="ghost" onPress={() => { setFrom(localDate()); setTo(localDate()); setPage(1); }}>Today</Button>
    <span className={styles.hint}>Dates follow each assignment’s time zone. Late logging is still possible after a miss.</span>
  </Toolbar>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No workouts in this period" description="Change the date range or ask your coach to assign an applied program." /> : <>
      {mobile ? <MobileWorkoutRows items={query.data.items} coach={coach} /> : <DataTable label="Workouts" rows={query.data.items} rowKey={item => item.id} columns={[
        { id: "workout", header: "Workout", width: "34%", cell: item => <Link data-row-link className={styles.rowLink} to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}><span>{item.name}</span><small>{item.programName}</small></Link> },
        { id: "scheduled", header: "Scheduled", cell: item => item.scheduledDate },
        { id: "performed", header: "Performed", hideOnMobile: true, cell: item => item.performedDate ?? "—" },
        { id: "notes", header: "Notes", hideOnMobile: true, muted: true, cell: item => item.loggedLate ? "Logged late" : "—" },
        { id: "status", header: "Status", cell: item => <StatusBadge status={item.status === "InProgress" ? "In progress" : item.status} /> },
      ]} />}
      {Number(query.data.total) > Number(query.data.pageSize) ? <ListPagination data={query.data} onChange={setPage} /> : null}
    </>}
  </section>;
}
export function RelationshipTraining({ relationshipId, teamId }: { relationshipId: string; teamId?: string | null }) {
  return <div className={styles.stack}><AssignmentList relationshipId={relationshipId} assign={{ relationshipId, teamId }} /><TrainingSchedule relationshipId={relationshipId} coach /></div>;
}
export default function TrainingHome() {
  const [params, setParams] = useSearchParams();
  const mobile = useMobileLayout();
  const historyView = params.get("historyView") === "progress" ? "progress" : "workouts";
  const tab = ["schedule", "plans", "progress", "history"].includes(params.get("tab") ?? "") ? params.get("tab")! : "schedule";
  // The tab lives in the URL (links can open "Training plans" directly) but replaces history, so Back leaves the page.
  const setTab = (next: string) => setParams(previous => { const url = new URLSearchParams(previous); if (next === "schedule") url.delete("tab"); else url.set("tab", next); return url; }, { replace: true });
  const relationshipId = params.get("relationshipId") || undefined;
  const programId = params.get("programId") || undefined;
  if (mobile) return <><PageHeader title={tab === "plans" ? "Plans" : "History"} description={tab === "plans" ? "Programs from your coach and plans you own" : "Your training log and progress"} /><div className={styles.stack}>
    {tab === "plans" ? <TrainingPlansTab relationshipId={relationshipId} /> : <>
      <Tabs selectedKey={tab === "progress" ? "progress" : historyView} onSelectionChange={key => setParams(previous => { const next = new URLSearchParams(previous); next.set("tab", "history"); if (key === "progress") next.set("historyView", "progress"); else next.delete("historyView"); return next; }, { replace: true })}><TabList aria-label="History view"><Tab id="workouts">Workouts</Tab><Tab id="progress">Progress</Tab></TabList></Tabs>
      {tab === "progress" || historyView === "progress" ? <TrainingProgress relationshipId={relationshipId} /> : <TrainingSchedule relationshipId={relationshipId} programId={programId} />}
    </>}
  </div></>;
  return <><PageHeader title="Training" description="Your workouts, training plans and progress." /><div className={styles.stack}>
    <Tabs selectedKey={tab === "history" ? "schedule" : tab} onSelectionChange={key => setTab(String(key))}><TabList aria-label="Training views"><Tab id="schedule">Schedule & history</Tab><Tab id="plans">Training plans</Tab><Tab id="progress">Progress</Tab></TabList></Tabs>
    {tab === "schedule" || tab === "history" ? <TrainingSchedule relationshipId={relationshipId} programId={programId} /> : tab === "plans" ? <TrainingPlansTab relationshipId={relationshipId} /> : <TrainingProgress relationshipId={relationshipId} />}
  </div></>;
}
