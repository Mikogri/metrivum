import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Badge, LinkButton, PageHeader } from "@trainflow/ui-web";
import { Failure, Loading, StatusBadge, useCoachingQuery, type Page } from "~/modules/coaching";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import styles from "./mobile-home.module.css";

const day = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}
function DateTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>;
}
function Workouts({ active = false, date }: { active?: boolean; date: string }) {
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Schema<"OccurrenceDto">>>("/api/v1/training/schedule", {
    from: active ? day(new Date(Date.now() - 365 * 86400000)) : date, to: date,
    status: active ? "InProgress" : undefined, page: 1, pageSize: 10, view: mode,
  });
  if (active && query.data?.items.length === 0) return null;
  return <Section title={active ? "In progress" : "Workouts today"}>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length ? <ul className={styles.rows}>
      {query.data.items.map(item => <li key={item.id}><Link className={styles.row} to={`/app/${mode === "coach" ? "training" : "my-training"}/workouts/${item.id}`}>
        <span><strong>{item.name}</strong><small>{item.programName}{item.exerciseCount != null ? ` · ${item.exerciseCount} exercises` : ""}</small>{active && <small>Continue workout</small>}</span><StatusBadge status={item.status} />
      </Link></li>)}
    </ul> : <p className={styles.muted}>No workouts scheduled for today.</p>}
    {Number(query.data?.total) > 10 && <Link className={styles.more} to={mode === "coach" ? "/app/training" : "/app/my-training?tab=history"}>View all {query.data?.total} workouts</Link>}
  </Section>;
}
function CheckIns({ overdue = false }: { overdue?: boolean }) {
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Schema<"CheckInRequestDto">>>("/api/v1/check-ins/requests", {
    role: mode, page: 1, pageSize: 10, status: overdue ? "Overdue" : mode === "coach" ? "Submitted" : "Available", sort: "due",
  });
  if (overdue && !query.isError && !query.data?.items.length) return null;
  return <Section title={overdue ? "Overdue check-ins" : mode === "coach" ? "Awaiting your review" : "Check-ins to fill in"}>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : query.data.items.length ? <ul className={styles.rows}>
      {query.data.items.map(item => <li key={item.id}><Link className={styles.row} to={`/app/check-ins/${item.id}`}><span><strong>{item.scheduleName}</strong><small>Due <DateTime value={item.dueAtUtc} /></small></span>{overdue && <Badge tone="danger">Overdue</Badge>}</Link></li>)}
    </ul> : <p className={styles.muted}>No check-ins are waiting.</p>}
    {Number(query.data?.total) > 10 && <Link className={styles.more} to={mode === "coach" ? "/app/check-ins" : "/app/my-check-ins"}>View all {query.data?.total} check-ins</Link>}
  </Section>;
}
function CoachSummary() {
  const clients = useCoachingQuery<Page<Schema<"CoachRelationshipDto">>>("/api/v1/coaching/clients", { status: "Active", page: 1, pageSize: 1 });
  const leads = useCoachingQuery<Page<Schema<"ApplicationDto">>>("/api/v1/coaching/leads", { page: 1, pageSize: 1 });
  if (clients.error || leads.error) return <Failure error={clients.error || leads.error} retry={() => { void clients.refetch(); void leads.refetch(); }} />;
  return <div className={styles.stats}><Link to="/app/clients"><strong>{clients.data?.total ?? "–"}</strong><span>Active clients</span></Link><Link to="/app/leads"><strong>{leads.data?.total ?? "–"}</strong><span>Leads to answer</span></Link></div>;
}
export default function Today() {
  const { mode } = useWorkspace();
  const [date] = useState(() => day(new Date()));
  const [range] = useState(() => { const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from); to.setDate(to.getDate() + 7); return { from: from.toISOString(), to: to.toISOString() }; });
  const events = useCoachingQuery<Page<Schema<"EventDto">>>("/api/v1/calendar/events", { ...range, role: mode, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", page: 1, pageSize: 10 });
  return <div className={styles.home}><PageHeader title="Today" description={new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })} />
    {mode === "coach" && <CoachSummary />}
    <Workouts active date={date} /><Workouts date={date} /><CheckIns /><CheckIns overdue />
    <Section title="This week">{events.isPending ? <Loading /> : events.isError ? <Failure error={events.error} retry={() => void events.refetch()} /> : events.data.items.length ? <ul className={styles.rows}>{events.data.items.map(event => <li key={event.id}><Link className={styles.row} to={`/app/calendar?event=${event.id}`}><span><strong>{event.title}</strong><small><DateTime value={event.startsAtUtc} /></small></span>{event.cancelled && <Badge tone="danger">Cancelled</Badge>}</Link></li>)}</ul> : <p className={styles.muted}>No events this week.</p>}
      <LinkButton href="/app/calendar" variant="ghost">Open calendar</LinkButton>
    </Section>
  </div>;
}
