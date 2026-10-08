import { AssignmentLauncher, AssignmentList } from "~/modules/training";
import { TrainingProgress } from "~/modules/training";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { Link, useParams } from "react-router";
import { Alert, Button, DataTable, EmptyState, LinkButton, PageHeader } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import styles from "../coaching.module.css";

function GroupDetail() {
  const { groupId } = useParams();
  const [state, update] = useUrlState({ page: "1" });
  const group = useCoachingQuery<Group>(`/api/v1/coaching/groups/${groupId}`);
  const members = useCoachingQuery<Page<Relationship>>(`/api/v1/coaching/groups/${groupId}/members`, { page: pageFromParam(state.page), pageSize: 20 });
  const mutation = useCoachingMutation();
  if (group.isPending || members.isPending) return <Loading />;
  if (group.isError || members.isError) return <Failure error={group.error ?? members.error} retry={() => { void group.refetch(); void members.refetch(); }} />;
  return <><PageHeader title={group.data.name} description={group.data.description} actions={<LinkButton href={group.data.teamId ? "/app/team" : "/app/clients"} iconStart={<UserPlus />}>{group.data.teamId ? "Team clients" : "Open client profiles"}</LinkButton>} /><HubNavigation /><MutationError error={mutation.error} />
    <Alert title={group.data.teamId ? "Team-owned group" : "Personal group"}>Group members and assignments stay within this ownership scope.</Alert>
    {group.data.allowedActions.includes("add-member") && <GroupMemberPicker group={group.data} />}
    {!members.data.items.length ? <EmptyState title="This group has no clients" description="Open a client relationship and select this group to add them." /> : <>
      <DataTable label="Group members" rows={members.data.items} rowKey={(r) => r.id} columns={[
        { id: "name", header: "Client", cell: (r) => <Link to={`/app/clients/${r.id}`}>{r.client.displayName}</Link> },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "remove", header: "Actions", cell: (r) => <Button size="sm" isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "DELETE", path: `/api/v1/coaching/groups/${groupId}/members/${r.id}`, ifMatch: group.data.version })}>Remove from group</Button> },
      ]} /><ListPagination data={members.data} onChange={(page) => update({ page: String(page) })} /></>}
    <AssignmentLauncher groupId={groupId} teamId={group.data.teamId} /><AssignmentList groupId={groupId} /><TrainingProgress groupId={groupId} coach />
  </>;
}

function GroupMemberPicker({ group }: { group: Group }) {
  const [page, setPage] = useState(1);
  const [relationshipId, setRelationship] = useState("");
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { teamId: group.teamId ?? undefined, status: "Active", page, pageSize: 20 });
  const mutation = useCoachingMutation(() => setRelationship(""));
  return <section className={styles.panel}><h2>Add a client</h2><p>{group.teamId ? "Choose one of your assigned Team coaching cases." : "Choose a client from your private coaching practice."}</p><MutationError error={mutation.error} />
    {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} retry={() => void clients.refetch()} /> : <><form className={styles.row} onSubmit={event => { event.preventDefault(); mutation.mutate({ method: "PUT", path: `/api/v1/coaching/groups/${group.id}/members/${relationshipId}`, ifMatch: group.version }); }}>
      <label className={styles.field}>Client in this scope<select required value={relationshipId} onChange={event => setRelationship(event.target.value)}><option value="">Choose a client</option>{clients.data.items.filter(client => !client.groupIds.includes(group.id)).map(client => <option key={client.id} value={client.id}>{client.client.displayName || client.client.username}</option>)}</select></label><Button type="submit" isDisabled={!relationshipId || mutation.isPending}>Add to group</Button>
    </form><ListPagination data={clients.data} onChange={value => { setPage(value); setRelationship(""); }} /></>}
  </section>;
}
export default function GroupRoute() { return <RequireFeature feature="coaching.groups.manage"><GroupDetail /></RequireFeature>; }
