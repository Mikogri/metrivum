import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { DataTable, EmptyState, PageHeader } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { money } from "../pricing";
import { RelationshipBilling } from "../settlements";
import styles from "../coaching.module.css";

export default function Services() {
  const { relationshipId } = useParams();
  const coach = useWorkspace().mode === "coach";
  const [state, update] = useUrlState({ page: "1" });
  const query = useCoachingQuery<Page<Schema<"RelationshipServiceDto">>>(`/api/v1/coaching/relationships/${relationshipId}/services`, { page: pageFromParam(state.page), pageSize: 20 });
  return <><PageHeader title="Coaching services" description="Each service keeps its accepted offer and billing terms." /><HubNavigation /><div className={styles.stack}>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No services yet" description="Accepting a submitted application creates a service here." /> : <><DataTable label="Services" rows={query.data.items} rowKey={(s) => s.id} columns={[
      { id: "name", header: "Service", cell: (s) => <Link data-row-link to={`/app/services/${s.id}`}>{s.offerName}</Link> },
      { id: "amount", header: "Agreed price", cell: (s) => money(s.amount, s.currency) },
      { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
      { id: "started", header: "Started", cell: (s) => new Date(s.startedAt).toLocaleDateString() },
    ]} /><ListPagination data={query.data} onChange={(page) => update({ page: String(page) })} /></>}
    {coach ? <RelationshipBilling relationshipId={relationshipId!} /> : <Link to="/app/payments">My payments and orders</Link>}
  </div></>;
}
