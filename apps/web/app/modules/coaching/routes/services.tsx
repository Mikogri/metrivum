import { Receipt } from "lucide-react";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, LinkButton, PageHeader, Toolbar } from "@trainflow/ui-web";
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
  const [state, update] = useUrlState({ view: "list", page: "1" });
  const query = useCoachingQuery<Page<Schema<"RelationshipServiceDto">>>(`/api/v1/coaching/relationships/${relationshipId}/services`, { page: pageFromParam(state.page), pageSize: 20 });
  return <><PageHeader title="Coaching services" description="Each service keeps its accepted offer and billing terms." actions={coach ? <LinkButton href={`/app/clients/${relationshipId}`}>Open client</LinkButton> : <LinkButton href="/app/payments">My payments</LinkButton>} /><div className={styles.stack}><Toolbar aria-label="View" className={styles.toolbar}><span className={styles.spacer} /><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No services yet" description="Accepting a submitted application creates a service here." /> : <><DataView view={state.view === "cards" ? "cards" : "list"} card={(s) => ({ href: `/app/services/${s.id}`, title: s.offerName, icon: <Receipt />, tone: "green", badge: <StatusBadge status={s.status} />, subtitle: s.offerRevision.coachingMode === "Offline" ? "In person" : `${s.offerRevision.coachingMode} coaching`, facts: [{ label: "Price", value: money(Number(s.amount), s.currency) }, { label: "Billing", value: s.currentBilling ? <StatusBadge status={s.currentBilling.status} /> : "—" }], meta: [`Started ${new Date(s.startedAt).toLocaleDateString()}`, ...(s.currentBilling?.validUntil ? [`${s.currentBilling.isExpired ? "Expired" : "Valid until"} ${new Date(s.currentBilling.validUntil).toLocaleString()}`] : [])] })} label="Services" rows={query.data.items} rowKey={(s) => s.id} columns={[
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
