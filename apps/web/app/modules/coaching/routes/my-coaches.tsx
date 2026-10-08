import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, EmptyState, LinkButton, PageHeader } from "@trainflow/ui-web";
import { useProfile, profileKey } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type ClientRelationship, type Page } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";

export default function MyCoaches() {
  const profile = useProfile();
  const account = useAccountKey();
  const cache = useQueryClient();
  const client = profile.roles.includes("Client");
  const [state, update] = useUrlState({ page: "1" });
  const list = useCoachingQuery<Page<ClientRelationship>>("/api/v1/coaching/my-coaches", { page: pageFromParam(state.page), pageSize: 20 }, client);
  const activate = useCoachingMutation(async () => { await cache.invalidateQueries({ queryKey: profileKey(account) }); await cache.invalidateQueries({ queryKey: [account, "access"] }); });
  return <><PageHeader title="My coaches" description="Your collaborations and services, all in one place." />
    {!client ? <><EmptyState title="Get started as a client" description="Enable your client profile to apply for coaching and receive invitations. Your coach tools stay available." actions={<Button variant="primary" loading={activate.isPending} onPress={() => activate.mutate({ method: "POST", path: "/api/v1/me/roles/client" })}>Enable client profile</Button>} /><MutationError error={activate.error} /></> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState title="No coaching relationships yet" description="Apply using a coach's offer link or accept an invitation to begin." actions={<LinkButton href="/app/my-invitations" variant="primary">View invitations</LinkButton>} /> : <>
      <DataTable label="My coaches" rows={list.data.items} rowKey={(r) => r.id} columns={[
        { id: "coach", header: "Coach", cell: (r) => r.coach.displayName || r.coach.username },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "services", header: "Services", cell: (r) => <Link to={`/app/my-coaches/${r.id}/services`}>View services</Link> },
        { id: "documents", header: "Documentation", cell: (r) => <Link to={`/app/my-coaches/${r.id}/documents`}>Shared documents</Link> },
        { id: "training", header: "Training", cell: (r) => <Link to={`/app/my-training?relationshipId=${r.id}`}>My training</Link> },
        { id: "offers", header: "Offers", cell: (r) => <Link to={`/app/coaches/${r.coach.id}/offers`}>Browse offers</Link> },
      ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
