import { privateMeta } from "~/shared/i18n/site";

export const meta = ({ location }: { location: { pathname: string } }) =>
  privateMeta(`${location.pathname === "/app/leads" ? "Leads" : "My applications"} — Metrivum`);

import { Inbox } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Avatar, EmptyState, Option, PageHeader, SearchInput, Select, Toolbar } from "@metrivum/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { ClientHubActions } from "../hub-actions";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { money } from "../pricing";
import { CategoryTag, categoryTone } from "../offer-category";
import { DataView } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

type Application = Schema<"ApplicationDto">;
const submitted = (at?: string | null) => (at ? new Date(at).toLocaleDateString([], { dateStyle: "medium" }) : "Not submitted yet");

/** One line on the client's card saying where the application stands. */
const cardNote: Record<string, string> = {
  InProgress: "Draft: finish and submit it to reach the coach.",
  Submitted: "Sent. Waiting for the coach's decision.",
  Accepted: "Accepted by the coach.",
  Rejected: "The coach did not accept this application.",
  Withdrawn: "You withdrew this application.",
};

/** The same line on the coach's card: what the lead is waiting for, or how it ended. */
const leadNote: Record<string, string> = {
  Submitted: "Waiting for your decision. Open it to read the answers.",
  Accepted: "Accepted. The collaboration with this client has started.",
  Rejected: "You did not accept this application.",
  Withdrawn: "The applicant withdrew this application.",
};

export default function Applications() {
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ view: "list", q: "", status: coach ? "Submitted" : "", page: "1", sort: "updated" });
  const list = useCoachingQuery<Page<Schema<"ApplicationDto">>>(`/api/v1/coaching/${coach ? "leads" : "applications"}`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort });
  return <><PageHeader title={coach ? "Leads" : "My applications"} description={coach ? "Review submitted applications and start new collaborations." : "Continue a draft or follow the status of your application."} actions={coach ? <ClientHubActions /> : undefined} /><HubNavigation />
    <Toolbar aria-label="Filter applications" className={styles.toolbar}><SearchInput aria-label="Search applications" placeholder={coach ? "Search applicants or offers" : "Search applications"} value={state.q} onChange={(q) => update({ q })} /><Select aria-label="Application status" selectedKey={state.status || "all"} onSelectionChange={(k) => update({ status: k === "all" ? "" : String(k) })}><Option id="all">All statuses</Option>{(coach ? ["Submitted", "Accepted", "Rejected", "Withdrawn"] : ["InProgress", "Submitted", "Accepted", "Rejected", "Withdrawn"]).map((s) => <Option key={s} id={s}>{s === "InProgress" ? "Not submitted" : s}</Option>)}</Select><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<Inbox />} title={coach ? "No applications to review" : state.q || state.status ? "No applications match these filters" : "No applications yet"} description={coach ? "Submitted applications will appear here. Client drafts stay private." : state.q || state.status ? "Clear the search or choose another status." : "Open a coach's offer link or accept an invitation to get started."} /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(a) => ({ href: `/app/applications/${a.id}`, title: coach ? a.applicant.displayName : a.offerName, icon: coach ? <Avatar name={a.applicant.displayName || a.applicant.username || "Applicant"} size="md" decorative /> : <Inbox />, tone: categoryTone(a.offerCategory), badge: <StatusBadge status={a.status === "InProgress" ? "NotSubmitted" : a.status} />, subtitle: coach ? a.offerName : "Coaching application", description: (coach ? leadNote : cardNote)[a.status], meta: [a.offerCategory ? <CategoryTag key="type" category={a.offerCategory} /> : null, money(Number(a.amount), a.currency), ...(a.selectedSessionCount != null ? [`${a.selectedSessionCount} sessions`] : []), submitted(a.submittedAt)] })} label={coach ? "Leads" : "Applications"} rows={list.data.items} rowKey={(a) => a.id} columns={[
      { id: "name", header: coach ? "Applicant" : "Offer", cell: (a) => coach ? <span className={styles.person}>
        <Avatar name={a.applicant.displayName || a.applicant.username || "Applicant"} size="sm" decorative />
        <span className={styles.personText}><Link data-row-link to={`/app/applications/${a.id}`}>{a.applicant.displayName || a.applicant.username}</Link>{a.applicant.username ? <small>@{a.applicant.username}</small> : null}</span>
      </span> : <Link data-row-link to={`/app/applications/${a.id}`}>{a.offerName}</Link> },
      // The client's first column already is the offer; the coach sees who applied and for what.
      ...(coach ? [{ id: "offer", header: "Offer", cell: (a: Application) => a.offerName, hideOnMobile: true }] : []),
      { id: "price", header: "Amount", cell: (a) => money(a.amount, a.currency) },
      { id: "submitted", header: "Submitted", cell: (a) => <span className={a.submittedAt ? undefined : styles.none}>{submitted(a.submittedAt)}</span>, hideOnMobile: true },
      { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status === "InProgress" ? "NotSubmitted" : a.status} /> },
      ...(coach ? [] : [{ id: "next", header: "", cell: (a: Application) => <Link to={`/app/applications/${a.id}`}>{a.status === "InProgress" ? "Continue draft" : "Open"}</Link> }]),
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
