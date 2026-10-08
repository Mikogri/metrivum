import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { DataTable, EmptyState, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { money } from "../pricing";
import styles from "../coaching.module.css";

export default function Applications() {
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ q: "", status: coach ? "Submitted" : "", page: "1", sort: "updated" });
  const list = useCoachingQuery<Page<Schema<"ApplicationDto">>>(`/api/v1/coaching/${coach ? "leads" : "applications"}`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort });
  return <><PageHeader title={coach ? "Leads" : "My applications"} description={coach ? "Review submitted applications and start new collaborations." : "Continue a draft or follow the status of your application."} /><HubNavigation />
    <Toolbar aria-label="Filter applications" className={styles.toolbar}><SearchInput aria-label="Search applications" placeholder={coach ? "Search applicants or offers" : "Search applications"} value={state.q} onChange={(q) => update({ q })} /><Select aria-label="Application status" selectedKey={state.status || "all"} onSelectionChange={(k) => update({ status: k === "all" ? "" : String(k) })}><Option id="all">All statuses</Option>{(coach ? ["Submitted", "Accepted", "Rejected", "Withdrawn"] : ["InProgress", "Submitted", "Accepted", "Rejected", "Withdrawn"]).map((s) => <Option key={s} id={s}>{s === "InProgress" ? "Draft" : s}</Option>)}</Select></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title={coach ? "No applications to review" : "No applications yet"} description={coach ? "Submitted applications will appear here. Client drafts stay private." : "Open a coach's offer link or accept an invitation to get started."} /> : <><DataTable label={coach ? "Leads" : "Applications"} rows={list.data.items} rowKey={(a) => a.id} columns={[
      { id: "name", header: coach ? "Applicant" : "Offer", cell: (a) => <Link data-row-link to={`/app/applications/${a.id}`}>{coach ? a.applicant.displayName : a.offerName}</Link> },
      { id: "offer", header: "Offer", cell: (a) => a.offerName, hideOnMobile: true },
      { id: "price", header: "Amount", cell: (a) => money(a.amount, a.currency) },
      { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
