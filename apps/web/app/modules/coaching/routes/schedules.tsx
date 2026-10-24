import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Check-in schedules — Metrivum");

import { CalendarClock, Plus } from "lucide-react";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, LinkButton, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { DataView } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export default function Schedules() {
  const [state, update] = useUrlState({ view: "list", page: "1", q: "", status: "", sort: "next" });
  const list = useCoachingQuery<Page<Schema<"ScheduleDto">>>("/api/v1/check-ins/schedules", { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort });
  return <><PageHeader title="Check-in schedules" description="Send the right form to individual clients or groups." actions={<LinkButton href="/app/check-in-schedules/new" variant="primary" iconStart={<Plus />}>Create schedule</LinkButton>} /><Toolbar aria-label="Filter schedules" className={styles.toolbar}><SearchInput aria-label="Search schedules" placeholder="Search schedules" value={state.q} onChange={(q) => update({ q })} /><Select aria-label="Schedule status" selectedKey={state.status || "all"} onSelectionChange={(s) => update({ status: s === "all" ? "" : String(s) })}><Option id="all">All statuses</Option>{["Active", "Paused", "Ended"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title="Keep in touch with your clients" description="Publish a check-in form, then create a one-time or recurring schedule." actions={<LinkButton href="/app/forms?purpose=CheckIn" variant="primary">Check-in form library</LinkButton>} /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(s) => ({ href: `/app/check-in-schedules/${s.id}`, title: s.name, icon: <CalendarClock />, tone: "violet", badge: <StatusBadge status={s.status} />, subtitle: `${s.recurrence.kind} · ${[s.relationshipIds.length ? `${s.relationshipIds.length} ${s.relationshipIds.length === 1 ? "client" : "clients"}` : "", s.groupIds.length ? `${s.groupIds.length} ${s.groupIds.length === 1 ? "group" : "groups"}` : ""].filter(Boolean).join(", ") || "no recipients"}`, description: s.description.trim() || "No description. Clients see the form when each check-in is released.", meta: [s.nextAvailableAtUtc ? `Next ${new Date(s.nextAvailableAtUtc).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "No upcoming release"] })} label="Schedules" rows={list.data.items} rowKey={(s) => s.id} columns={[
      { id: "name", header: "Schedule", cell: (s) => <Link data-row-link to={`/app/check-in-schedules/${s.id}`}>{s.name}</Link> },
      { id: "recurrence", header: "Recurrence", cell: (s) => s.recurrence.kind },
      { id: "next", header: "Next release", cell: (s) => s.nextAvailableAtUtc ? new Date(s.nextAvailableAtUtc).toLocaleString() : "—" },
      { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
