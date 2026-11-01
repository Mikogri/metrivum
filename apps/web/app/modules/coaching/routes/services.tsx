import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Services — Metrivum");

import { Receipt } from "lucide-react";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link, useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { EmptyState, LinkButton, Option, PageHeader, SearchInput, Select, Toolbar } from "@metrivum/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { money } from "../pricing";
import { RelationshipBilling } from "../settlements";
import { DataView } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export default function Services() {
  const { relationshipId } = useParams();
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ view: "list", page: "1", q: "", status: "", sort: "updated" });
  const filtered = Boolean(state.q || state.status);
  const query = useCoachingQuery<Page<Schema<"RelationshipServiceDto">>>(`/api/v1/coaching/relationships/${relationshipId}/services`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, status: state.status || undefined, sort: state.sort });
  return <><PageHeader title="Coaching services" description="Each service keeps its accepted offer and billing terms." actions={coach ? <LinkButton href={`/app/clients/${relationshipId}`}>Open client</LinkButton> : <LinkButton href="/app/payments">My payments</LinkButton>} /><Toolbar aria-label="Filter services" className={styles.toolbar}>
      <SearchInput aria-label="Search services" placeholder="Search by offer name" value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <Select aria-label="Service status" selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key) })}><Option id="all">All statuses</Option><Option id="Active">Active</Option><Option id="Completed">Completed</Option></Select>
      <Select aria-label="Sort services" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}><Option id="updated">Recently updated</Option><Option id="created">Recently started</Option><Option id="name">Name</Option><Option id="status">Status</Option></Select>
      <span className={styles.spacer} /><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    <div className={styles.stack}>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title={filtered ? "No matching services" : "No services yet"} description={filtered ? "Clear the search or choose another status." : "Accepting a submitted application creates a service here."} /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(s) => ({ href: `/app/services/${s.id}`, title: s.offerName, icon: <Receipt />, tone: "green", badge: <StatusBadge status={s.status} />, subtitle: s.offerRevision.coachingMode === "Offline" ? "In person" : `${s.offerRevision.coachingMode} coaching`, description: s.offerRevision.description.trim() || (s.status === "Active" ? "An active service from an accepted application. Open it for billing and terms." : "A completed service. Open it for its billing history and terms."), facts: [{ label: "Price", value: money(Number(s.amount), s.currency) }, { label: "Billing", value: s.currentBilling ? <StatusBadge size="sm" status={s.currentBilling.status} /> : "—" }], meta: [s.currentBilling?.validUntil ? `${s.currentBilling.isExpired ? "Expired" : "Until"} ${new Date(s.currentBilling.validUntil).toLocaleDateString([], { dateStyle: "medium" })}` : `Since ${new Date(s.startedAt).toLocaleDateString([], { dateStyle: "medium" })}`] })} label="Services" rows={query.data.items} rowKey={(s) => s.id} columns={[
      { id: "name", header: "Service", cell: (s) => <Link data-row-link to={`/app/services/${s.id}`}>{s.offerName}</Link> },
      { id: "amount", header: "Agreed price", cell: (s) => money(s.amount, s.currency) },
      { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
      { id: "billing", header: "Billing", hideOnMobile: true, cell: (s) => s.currentBilling ? <StatusBadge status={s.currentBilling.status} /> : <span className={styles.none}>—</span> },
      { id: "validity", header: "Session expiry", cell: (s) => s.currentBilling?.validUntil ? `${s.currentBilling.isExpired ? "Expired · " : ""}${new Date(s.currentBilling.validUntil).toLocaleString()}` : "—" },
      { id: "started", header: "Started", muted: true, hideOnMobile: true, cell: (s) => new Date(s.startedAt).toLocaleDateString() },
    ]} />{Number(query.data.total) > Number(query.data.pageSize) ? <ListPagination data={query.data} onChange={(page) => update({ page: String(page) })} /> : null}</>}
    {coach ? <RelationshipBilling relationshipId={relationshipId!} /> : null}
  </div></>;
}
