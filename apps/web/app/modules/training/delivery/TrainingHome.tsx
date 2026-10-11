import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, DataTable, EmptyState, PageHeader, Tab, TabList, Tabs, TextField, Toolbar } from "@trainflow/ui-web";
import { useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading, StatusBadge } from "~/modules/coaching";
import { AssignmentList, localDate } from "./Assignments";
import { TrainingProgress } from "./Progress";
import { TrainingPlansTab } from "../purchases/TrainingPlans";
import styles from "./delivery.module.css";

export interface Occurrence { exerciseCount?: number | null; revisionId: string; blockId: string; cycleId: string; performedDate: string | null; durationSeconds: number | null; hasComment: boolean; id: string; assignmentId: string; relationshipId: string; programId: string; programName: string; name: string; scheduledDate: string; deadline: string; status: string; executionId: string | null; loggedLate: boolean; allowedActions: string[] }
export function TrainingSchedule({ relationshipId, coach = false }: { relationshipId?: string; coach?: boolean }) {
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(() => localDate(new Date(Date.now() + 30 * 86400000)));
  const [page, setPage] = useState(1);
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Occurrence>>("/api/v1/training/schedule", { relationshipId, from, to, page, pageSize: 30, view: mode });
  return <section className={styles.stack} aria-label="Workout schedule and history"><Toolbar aria-label="Schedule filters" className={styles.filters}>
    <span className={styles.range}><TextField aria-label="From" type="date" value={from} onChange={value => { setFrom(value); setPage(1); }} /><span aria-hidden="true">–</span><TextField aria-label="Through" type="date" value={to} onChange={value => { setTo(value); setPage(1); }} /></span>
    <Button variant="ghost" onPress={() => { setFrom(localDate()); setTo(localDate()); setPage(1); }}>Today</Button>
    <span className={styles.hint}>Dates follow each assignment’s time zone. Late logging is still possible after a miss.</span>
  </Toolbar>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No workouts in this period" description="Change the date range or ask your coach to assign a applied program." /> : <>
      <DataTable label="Workouts" rows={query.data.items} rowKey={item => item.id} columns={[
        { id: "workout", header: "Workout", width: "34%", cell: item => <Link data-row-link className={styles.rowLink} to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}><span>{item.name}</span><small>{item.programName}</small></Link> },
        { id: "scheduled", header: "Scheduled", cell: item => item.scheduledDate },
        { id: "performed", header: "Performed", hideOnMobile: true, cell: item => item.performedDate ?? "—" },
        { id: "notes", header: "Notes", hideOnMobile: true, muted: true, cell: item => item.loggedLate ? "Logged late" : "—" },
        { id: "status", header: "Status", cell: item => <StatusBadge status={item.status === "InProgress" ? "In progress" : item.status} /> },
      ]} />
      {Number(query.data.total) > Number(query.data.pageSize) ? <ListPagination data={query.data} onChange={setPage} /> : null}
    </>}
  </section>;
}
export function RelationshipTraining({ relationshipId, teamId }: { relationshipId: string; teamId?: string | null }) {
  return <div className={styles.stack}><AssignmentList relationshipId={relationshipId} assign={{ relationshipId, teamId }} /><TrainingSchedule relationshipId={relationshipId} coach /></div>;
}
export default function TrainingHome() {
  const [params, setParams] = useSearchParams();
  const tab = ["schedule", "plans", "progress"].includes(params.get("tab") ?? "") ? params.get("tab")! : "schedule";
  // The tab lives in the URL (links can open "Training plans" directly) but replaces history, so Back leaves the page.
  const setTab = (next: string) => setParams(previous => { const url = new URLSearchParams(previous); if (next === "schedule") url.delete("tab"); else url.set("tab", next); return url; }, { replace: true });
  const relationshipId = params.get("relationshipId") || undefined;
  return <><PageHeader title="Training" description="Your workouts, training plans and progress." /><div className={styles.stack}>
    <Tabs selectedKey={tab} onSelectionChange={key => setTab(String(key))}><TabList aria-label="Training views"><Tab id="schedule">Schedule & history</Tab><Tab id="plans">Training plans</Tab><Tab id="progress">Progress</Tab></TabList></Tabs>
    {tab === "schedule" ? <TrainingSchedule relationshipId={relationshipId} /> : tab === "plans" ? <TrainingPlansTab relationshipId={relationshipId} /> : <TrainingProgress relationshipId={relationshipId} />}
  </div></>;
}
