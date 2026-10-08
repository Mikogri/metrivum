import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { ArrowRightLeft, UserPlus } from "lucide-react";
import { AlertDialog, Badge, Button, Card, DataTable, EmptyState, LinkButton, Option, Select } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { Failure, Loading, MutationError, useCoachingMutation, useCoachingQuery, type Page, type Relationship } from "~/modules/coaching";
import type { Member } from "./team";
import styles from "./team.module.css";

type TeamClientCase = Schema<"TeamClientCaseDto">;
type Transfer = Schema<"TeamClientTransferDto">;

export function TransferRequests() {
  const client = useProfile().roles.includes("Client");
  const requests = useCoachingQuery<Transfer[]>("/api/v1/me/team-client-transfer-requests", undefined, client);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const mutation = useCoachingMutation();
  if (!client) return null;
  if (requests.isPending) return <Loading />;
  if (requests.isError) return <Failure error={requests.error} retry={() => void requests.refetch()} />;
  if (!requests.data.length) return null;
  return <section aria-labelledby="transfer-requests" className={styles.invites}>
    <div><h2 id="transfer-requests" className={styles.sectionTitle}>Client transfer requests</h2><p className={styles.muted}>A Team transfer changes who owns your coaching case. Review the exact consent before deciding.</p></div>
    <MutationError error={mutation.error} />
    {requests.data.map((request) => <Card key={request.id} padding="md" className={styles.stack}>
      <div className={styles.invite}>
        <span className={styles.inviteIcon} aria-hidden="true"><ArrowRightLeft /></span>
        <div className={styles.grow}><p className={styles.strong}>{request.teamName}</p><p className={styles.muted}>Requested by {request.proposerName} · expires {new Date(request.expiresAt).toLocaleString()}</p></div>
        <Badge size="sm">{request.status}</Badge>
      </div>
      <p className={styles.note}>{request.consentText}</p>
      <div className={styles.rowActions}>
        {request.allowedActions.includes("decline") && <Button variant="ghost" isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/me/team-client-transfer-requests/${request.id}/decline`, json: { version: request.version } })}>Decline transfer</Button>}
        {request.allowedActions.includes("accept") && <Button variant="primary" isDisabled={mutation.isPending} onPress={() => setSelected(request)}>Review and accept transfer</Button>}
      </div>
    </Card>)}
    <AlertDialog isOpen={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Accept transfer to Team?" confirmLabel="Accept transfer" cancelLabel="Keep reviewing" isConfirming={mutation.isPending} onConfirm={() => { if (selected) mutation.mutate({ method: "POST", path: `/api/v1/me/team-client-transfer-requests/${selected.id}/accept`, json: { version: selected.version } }, { onSuccess: () => setSelected(null) }); }}>
      <p>{selected?.consentText}</p><p>Consent version: {selected?.consentVersion}. Historical private records are not automatically shared with the Team.</p><MutationError error={mutation.error} />
    </AlertDialog>
  </section>;
}

export function TeamClients({ teamId, members, active }: { teamId: string; members: Member[]; active: boolean }) {
  const profile = useProfile();
  const clients = useCoachingQuery<TeamClientCase[]>(`/api/v1/teams/${teamId}/clients`);
  const transfers = useCoachingQuery<Transfer[]>(`/api/v1/teams/${teamId}/client-transfer-requests`);
  const [relationshipId, setRelationship] = useState("");
  const [page, setPage] = useState(1);
  const privateClients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { status: "Active", page, pageSize: 20 }, active && profile.roles.includes("Coach"));
  const mutation = useCoachingMutation();
  const coachName = (id: string) => members.find((member) => member.userId === id)?.displayName || "Assigned coach";
  return <div className={styles.stack}>
    <MutationError error={mutation.error} />
    <p className={styles.note}>Team-owned cases are separate from each coach's private clients. Only authorized assignments grant access.</p>
    {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} retry={() => void clients.refetch()} /> : !clients.data.length ? <EmptyState title="No Team clients available" description="Clients appear here after an authorized Team transfer or a Team-scoped acquisition." /> : <DataTable label="Team clients" rows={clients.data} rowKey={(client) => client.id} columns={[
      { id: "name", header: "Client", cell: (client) => <span className={styles.person}><span className={styles.avatar} aria-hidden="true">{client.clientName.slice(0, 1).toUpperCase()}</span>{client.clientName}</span> },
      { id: "status", header: "Status", width: "8rem", cell: (client) => <Badge size="sm" tone={client.status === "Active" ? "success" : "neutral"} dot>{client.status}</Badge> },
      { id: "assigned", header: "Assigned coaches", cell: (client) => client.assignedCoachIds.length ? client.assignedCoachIds.map(coachName).join(", ") : <span className={styles.muted}>Awaiting assignment</span> },
      { id: "actions", header: <span className="tf-visually-hidden">Actions</span>, cell: (client) => <div className={styles.stack}>{client.relationshipId && <LinkButton size="sm" href={`/app/clients/${client.relationshipId}`}>Open Team coaching case</LinkButton>}{client.allowedActions.includes("assign-coach") && <AssignCoach key={`${client.id}:${client.version}`} client={client} members={members} />}</div> },
    ]} />}
    {active && profile.roles.includes("Coach") && <form className={styles.inviteForm} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/teams/${teamId}/client-transfer-requests`, json: { relationshipId } }, { onSuccess: () => setRelationship("") }); }}>
      <div className={styles.grow} style={{ flexBasis: "100%" }}><h3 className={styles.sectionTitle}>Request a private client transfer</h3><p className={styles.muted}>The client must accept before any Team case is created. Existing private history remains private. Active private services and unpaid obligations must be resolved first.</p></div>
      {privateClients.isPending ? <Loading /> : privateClients.isError ? <Failure error={privateClients.error} retry={() => void privateClients.refetch()} /> : <>
        <Select label="Private coaching client" placeholder="Select your client" isRequired selectedKey={relationshipId || null} onSelectionChange={(key) => setRelationship(key ? String(key) : "")} className={styles.ownerSelect}>{privateClients.data.items.map((client) => <Option key={client.id} id={client.id}>{client.client.displayName || client.client.username}</Option>)}</Select>
        <Button variant="ghost" isDisabled={page <= 1} onPress={() => { setPage(page - 1); setRelationship(""); }}>Previous clients</Button>
        <span className={styles.muted}>Page {page}</span>
        <Button variant="ghost" isDisabled={page * 20 >= Number(privateClients.data.total)} onPress={() => { setPage(page + 1); setRelationship(""); }}>Next clients</Button>
      </>}
      <Button type="submit" variant="primary" iconStart={<ArrowRightLeft />} isDisabled={!relationshipId || mutation.isPending}>Request client consent</Button>
    </form>}
    {transfers.isError ? <Failure error={transfers.error} retry={() => void transfers.refetch()} /> : !!transfers.data?.length && <section className={styles.stack}><h3 className={styles.sectionTitle}>Transfer status</h3><ul className={styles.requestList}>{transfers.data.map((transfer) => <li key={transfer.id}><span className={styles.grow}>Requested {new Date(transfer.createdAt).toLocaleDateString()} <span className={styles.muted}>· expires {new Date(transfer.expiresAt).toLocaleDateString()}</span></span><Badge size="sm">{transfer.status}</Badge></li>)}</ul></section>}
  </div>;
}

function AssignCoach({ client, members }: { client: TeamClientCase; members: Member[] }) {
  const [coachId, setCoach] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const mutation = useCoachingMutation();
  return <div className={styles.stack}>
    <form className={styles.rowActions} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assign-coach`, json: { coachId, version: client.version } }); }}>
      <Select aria-label={`Assign coach to ${client.clientName}`} placeholder="Select coach" size="sm" selectedKey={coachId || null} onSelectionChange={(key) => setCoach(key ? String(key) : "")} className={styles.roleSelect}>{members.filter((member) => member.userId !== client.clientId && !client.assignedCoachIds.includes(member.userId)).map((member) => <Option key={member.userId} id={member.userId}>{member.displayName || member.username}</Option>)}</Select>
      <Button type="submit" size="sm" iconStart={<UserPlus />} isDisabled={!coachId || mutation.isPending}>Assign coach</Button>
    </form>
    {client.assignedCoachIds.map((id) => <Button key={id} size="sm" variant="ghost" isDisabled={mutation.isPending} onPress={() => setRemove(id)}>Unassign {members.find((member) => member.userId === id)?.displayName || "coach"}</Button>)}
    <MutationError error={mutation.error} />
    <AlertDialog isOpen={!!remove} onOpenChange={(open) => { if (!open) setRemove(null); }} title="End this coach assignment?" tone="danger" confirmLabel="Unassign coach" cancelLabel="Keep assignment" isConfirming={mutation.isPending} onConfirm={() => { if (remove) mutation.mutate({ method: "DELETE", path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assignments/${remove}`, json: { version: client.version } }, { onSuccess: () => setRemove(null) }); }}><p>The coach will lose access to this Team case. The client remains with the organization. Assign another authorized coach if needed; private data remains unchanged.</p><MutationError error={mutation.error} /></AlertDialog>
  </div>;
}
