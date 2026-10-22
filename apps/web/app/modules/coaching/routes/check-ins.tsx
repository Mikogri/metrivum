import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Check-ins — TrainFlow");

import { ClipboardCheck } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { ClientHubActions } from "../hub-actions";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { DataView } from "~/shared/library/DataView";
import { ResponsiveFilters } from "~/shared/library/ResponsiveFilters";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export default function CheckIns() {
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ view: "list", page: "1", status: "", q: "", sort: "due", relationshipId: "", scheduleId: "" });
  const list = useCoachingQuery<Page<Schema<"CheckInRequestDto">>>("/api/v1/check-ins/requests", { role: coach ? "coach" : "client", page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort, relationshipId: state.relationshipId || undefined, scheduleId: state.scheduleId || undefined });
  return <><PageHeader title={coach ? "Client check-ins" : "My check-ins"} description={coach ? "Review responses and follow up with your clients." : "Complete your coach's check-ins and see their replies."} actions={coach ? <ClientHubActions /> : undefined} /><HubNavigation />
    <Toolbar aria-label="Filter check-ins" className={styles.toolbar}><SearchInput aria-label="Search check-ins" placeholder="Search check-ins" value={state.q} onChange={(q) => update({ q })} /><ResponsiveFilters active={Boolean(state.status)}><Select aria-label="Check-in status" selectedKey={state.status || "all"} onSelectionChange={(s) => update({ status: s === "all" ? "" : String(s) })}><Option id="all">All statuses</Option>{["Scheduled", "Available", "Overdue", "Submitted", "Reviewed", "Cancelled"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select><Select aria-label="Sort check-ins" selectedKey={state.sort} onSelectionChange={(s) => update({ sort: String(s) })}><Option id="due">Due date</Option><Option id="available">Release date</Option><Option id="status">Status</Option></Select></ResponsiveFilters><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title="No check-ins to show" description={coach ? "Create a schedule to send a form to selected clients or groups." : "Your coach's requests will appear here when they are issued."} /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(r) => ({ href: `/app/check-ins/${r.id}`, title: r.scheduleName, icon: <ClipboardCheck />, tone: "violet", badge: <StatusBadge status={r.status} />, subtitle: r.wasLate ? "Submitted late" : r.submittedAt ? `Submitted ${new Date(r.submittedAt).toLocaleDateString([], { dateStyle: "medium" })}` : r.status === "Cancelled" ? "Cancelled" : "Awaiting response", description: r.assignmentGroups?.length ? `Sent to ${r.assignmentGroups.map((g) => g.name).join(", ")}.` : coach ? "Sent to this client directly." : "From your coach.", meta: [`Due ${new Date(r.dueAtUtc).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`] })} label="Check-ins" rows={list.data.items} rowKey={(r) => r.id} columns={[
      { id: "name", header: "Check-in", cell: (r) => <Link data-row-link to={`/app/check-ins/${r.id}`}>{r.scheduleName}</Link> },
      { id: "due", header: "Due", cell: (r) => new Date(r.dueAtUtc).toLocaleString() },
      { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
      { id: "late", header: "Submission", cell: (r) => r.wasLate ? "Submitted late" : r.submittedAt ? "Submitted" : "Awaiting response", hideOnMobile: true },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
