import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, EmptyState, PageHeader, Segment, SegmentedControl } from "@trainflow/ui-web";
import { useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading, StatusBadge } from "~/modules/coaching";
import { AssignmentList, AssignmentLauncher, localDate } from "./Assignments";
import { TrainingProgress } from "./Progress";
import styles from "./delivery.module.css";

export interface Occurrence { id: string; assignmentId: string; relationshipId: string; programId: string; programName: string; name: string; scheduledDate: string; deadline: string; status: string; executionId: string | null; loggedLate: boolean; allowedActions: string[] }
export function TrainingSchedule({ relationshipId, coach = false }: { relationshipId?: string; coach?: boolean }) {
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(() => localDate(new Date(Date.now() + 30 * 86400000)));
  const [page, setPage] = useState(1);
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Occurrence>>("/api/v1/training/schedule", { relationshipId, from, to, page, pageSize: 30, view: mode });
  return <section className={styles.stack}><h2>Workout schedule and history</h2><div className={styles.toolbar}>
    <label className={styles.field}>From<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label><label className={styles.field}>Through<input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>
    <Button variant="ghost" onPress={() => { setFrom(localDate()); setTo(localDate()); setPage(1); }}>Today</Button>
  </div><p className={styles.muted}>Dates follow each assignment’s schedule time zone. Missed means not logged by the deadline; late completion is still possible.</p>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No workouts in this period" description="Change the date range or ask your coach to assign a published program." /> : <>
      {query.data.items.map(item => <article key={item.id} className={styles.card}><div className={styles.row}><div><h3><Link to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}>{item.name}</Link></h3><p className={styles.muted}>{item.programName} · {item.scheduledDate}</p></div><StatusBadge status={item.status} /></div>{item.loggedLate && <p className={styles.muted}>Logged after the planned deadline.</p>}</article>)}<ListPagination data={query.data} onChange={setPage} />
    </>}
  </section>;
}
export function RelationshipTraining({ relationshipId, teamId }: { relationshipId: string; teamId?: string | null }) {
  return <div className={styles.stack}><AssignmentLauncher relationshipId={relationshipId} teamId={teamId} /><AssignmentList relationshipId={relationshipId} /><TrainingSchedule relationshipId={relationshipId} coach /></div>;
}
export default function TrainingHome() {
  const [tab, setTab] = useState("schedule");
  const [params] = useSearchParams();
  const relationshipId = params.get("relationshipId") || undefined;
  return <><PageHeader title="My training" description="Your assigned workouts, actual training log and progress." /><div className={styles.stack}>
    <SegmentedControl aria-label="My training views" selectedKeys={[tab]} onSelectionChange={keys => setTab(String([...keys][0]))}><Segment id="schedule">Schedule & history</Segment><Segment id="programs">Programs</Segment><Segment id="progress">Progress</Segment></SegmentedControl>
    {tab === "schedule" ? <TrainingSchedule relationshipId={relationshipId} /> : tab === "programs" ? <AssignmentList relationshipId={relationshipId} coach={false} /> : <TrainingProgress relationshipId={relationshipId} />}
  </div></>;
}
