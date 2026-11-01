import { useState } from "react";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import type { Schema } from "@metrivum/api-client-web";
import { ArrowRightLeft, UserPlus, X } from "lucide-react";
import { AlertDialog, Avatar, Badge, Button, Card, DataTable, EmptyState, IconButton, LinkButton, Option, Pagination, Select } from "@metrivum/ui-web";
import { useProfile } from "~/modules/accounts";
import { Failure, Loading, MutationError, useCoachingMutation, useCoachingQuery, type Page, type Relationship } from "~/modules/coaching";
import type { Member } from "./team";
import styles from "./team.module.css";

type TeamClientCase = Schema<"TeamClientCaseDto">;
type Transfer = Schema<"TeamClientTransferDto">;
export const TEAM_PAGE_SIZE = 25;

export function TeamPageControls({ label, page, count, loading, onChange }: { label: string; page: number; count: number; loading: boolean; onChange: (page: number) => void }) {
  // Team lists come without a total: a full page means there may be another one.
  return <Pagination page={page} pageCount={null} hasNextPage={count >= TEAM_PAGE_SIZE} isDisabled={loading} onPageChange={onChange}
    labels={{ previous: "Previous", next: "Next", status: (p) => `Page ${p}`, navigation: `${label} pages` }} />;
}

export function TransferRequests() {
  const client = useProfile().roles.includes("Client");
  const [page, setPage] = useState(1);
  const requests = useCoachingQuery<Transfer[]>("/api/v1/me/team-client-transfer-requests", { page, pageSize: TEAM_PAGE_SIZE }, client);
  const [selected, setSelected] = useState<Transfer | null>(null);
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const mutation = useCoachingMutation();
  if (!client) return null;
  if (requests.isPending) return <Loading />;
  if (requests.isError) return <Failure error={requests.error} retry={() => void requests.refetch()} />;
  if (!requests.data.length && page === 1) return null;
  return <section aria-labelledby="transfer-requests" className={styles.invites}>
    <div><h2 id="transfer-requests" className={styles.sectionTitle}>Client transfer requests</h2><p className={styles.muted}>A Team transfer changes who owns your coaching case. Review the exact consent before deciding.</p></div>
    <MutationError error={mutation.error} />
    {confirmDialog}
    {requests.data.map((request) => <Card key={request.id} padding="md" className={styles.stack}>
      <div className={styles.invite}>
        <span className={styles.inviteIcon} aria-hidden="true"><ArrowRightLeft /></span>
        <div className={styles.grow}><p className={styles.strong}>{request.teamName}</p><p className={styles.muted}>Requested by {request.proposerName} · expires {new Date(request.expiresAt).toLocaleString()}</p></div>
        <Badge size="sm">{request.status}</Badge>
      </div>
      <p className={styles.note}>{request.consentText}</p>
      <div className={styles.rowActions}>
        {request.allowedActions.includes("decline") && <Button variant="danger-ghost" isDisabled={mutation.isPending} onPress={async () => { if (await ask({ title: "Decline this transfer?", body: "Your coaching stays private with your current coach.", confirmLabel: "Decline transfer", cancelLabel: "Keep request" })) mutation.mutate({ method: "POST", path: `/api/v1/me/team-client-transfer-requests/${request.id}/decline`, json: { version: request.version } }); }}>Decline transfer</Button>}
        {request.allowedActions.includes("accept") && <Button variant="primary" isDisabled={mutation.isPending} onPress={() => setSelected(request)}>Review and accept transfer</Button>}
      </div>
    </Card>)}
    <TeamPageControls label="Transfer requests" page={page} count={requests.data.length} loading={requests.isFetching || mutation.isPending} onChange={setPage} />
    <AlertDialog isOpen={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }} title="Accept transfer to Team?" confirmLabel="Accept transfer" cancelLabel="Keep reviewing" isConfirming={mutation.isPending} onConfirm={() => { if (selected) mutation.mutate({ method: "POST", path: `/api/v1/me/team-client-transfer-requests/${selected.id}/accept`, json: { version: selected.version } }, { onSuccess: () => setSelected(null) }); }}>
      <p>{selected?.consentText}</p><p>Consent version: {selected?.consentVersion}. Historical private records are not automatically shared with the Team.</p><MutationError error={mutation.error} />
    </AlertDialog>
  </section>;
}

export function TeamClients({ teamId, members, active }: { teamId: string; members: Member[]; active: boolean }) {
  const profile = useProfile();
  const [clientPage, setClientPage] = useState(1);
  const [transferPage, setTransferPage] = useState(1);
  const clients = useCoachingQuery<TeamClientCase[]>(`/api/v1/teams/${teamId}/clients`, { page: clientPage, pageSize: TEAM_PAGE_SIZE });
  const transfers = useCoachingQuery<Transfer[]>(`/api/v1/teams/${teamId}/client-transfer-requests`, { page: transferPage, pageSize: TEAM_PAGE_SIZE });
  const [relationshipId, setRelationship] = useState("");
  const [page, setPage] = useState(1);
  const privateClients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { status: "Active", page, pageSize: 20 }, active && profile.roles.includes("Coach"));
  const mutation = useCoachingMutation();
  return <div className={styles.stack}>
    <MutationError error={mutation.error} />
    <p className={styles.note}>Team-owned cases are separate from each coach's private clients. Only authorized assignments grant access.</p>
    {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} retry={() => void clients.refetch()} /> : !clients.data.length ? <EmptyState title="No Team clients available" description="Clients appear here after an authorized Team transfer or a Team-scoped acquisition." /> : <DataTable label="Team clients" rows={clients.data} rowKey={(client) => client.id} columns={[
      { id: "name", header: "Client", width: "26%", cell: (client) => <span className={styles.person}><Avatar name={client.clientName || "Client"} size="sm" decorative /><span className={styles.personText}><span>{client.clientName}</span></span></span> },
      { id: "status", header: "Status", width: "7rem", cell: (client) => <Badge size="sm" tone={client.status === "Active" ? "success" : "neutral"} dot>{client.status}</Badge> },
      { id: "assigned", header: "Assigned coaches", cell: (client) => <AssignedCoaches client={client} members={members} /> },
      { id: "actions", header: <span className="tf-visually-hidden">Actions</span>, width: "19rem", align: "end", cell: (client) => <div className={styles.rowActions}>{client.relationshipId && <LinkButton size="sm" variant="ghost" href={`/app/clients/${client.relationshipId}`}>Open case</LinkButton>}{client.allowedActions.includes("assign-coach") && <AssignCoach key={`${client.id}:${client.version}`} client={client} members={members} />}</div> },
    ]} />}
    {!clients.isError && <TeamPageControls label="Team clients" page={clientPage} count={clients.data?.length ?? 0} loading={clients.isFetching || mutation.isPending} onChange={setClientPage} />}
    {active && profile.roles.includes("Coach") && <form className={styles.inviteForm} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/teams/${teamId}/client-transfer-requests`, json: { relationshipId } }, { onSuccess: () => setRelationship("") }); }}>
      <div className={styles.grow} style={{ flexBasis: "100%" }}><h3 className={styles.sectionTitle}>Request a private client transfer</h3><p className={styles.muted}>The client must accept before any Team case is created. Existing private history remains private. Active private services and unpaid obligations must be resolved first.</p></div>
      {privateClients.isPending ? <Loading /> : privateClients.isError ? <Failure error={privateClients.error} retry={() => void privateClients.refetch()} /> : <>
        <Select label="Private coaching client" placeholder="Select your client" isRequired selectedKey={relationshipId || null} onSelectionChange={(key) => setRelationship(key ? String(key) : "")} className={styles.ownerSelect}>{privateClients.data.items.map((client) => <Option key={client.id} id={client.id}>{client.client.displayName || client.client.username}</Option>)}</Select>
        <Button type="submit" variant="primary" iconStart={<ArrowRightLeft />} loading={mutation.isPending} isDisabled={!relationshipId}>Request client consent</Button>
        <Pagination className={styles.formPages} page={page} pageCount={Math.max(1, Math.ceil(Number(privateClients.data.total) / 20))} onPageChange={(next) => { setPage(next); setRelationship(""); }}
          labels={{ previous: "Previous clients", next: "Next clients", status: (p, n) => `Clients page ${p} of ${n}`, navigation: "Private client pages" }} />
      </>}
    </form>}
    {transfers.isError ? <Failure error={transfers.error} retry={() => void transfers.refetch()} /> : !!transfers.data?.length && <section className={styles.stack}><h3 className={styles.sectionTitle}>Transfer status</h3><ul className={styles.requestList}>{transfers.data.map((transfer) => <li key={transfer.id}><span className={styles.grow}>Requested {new Date(transfer.createdAt).toLocaleDateString()} <span className={styles.muted}>· expires {new Date(transfer.expiresAt).toLocaleDateString()}</span></span><Badge size="sm">{transfer.status}</Badge></li>)}</ul></section>}
    {!transfers.isError && (transferPage > 1 || !!transfers.data?.length) && <TeamPageControls label="Transfer status" page={transferPage} count={transfers.data?.length ?? 0} loading={transfers.isFetching || mutation.isPending} onChange={setTransferPage} />}
  </div>;
}

function AssignCoach({ client, members }: { client: TeamClientCase; members: Member[] }) {
  const [coachId, setCoach] = useState("");
  const mutation = useCoachingMutation();
  return <>
    <form className={styles.assignForm} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "POST", path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assign-coach`, json: { coachId, version: client.version } }); }}>
      <Select aria-label={`Assign coach to ${client.clientName}`} placeholder="Select coach" size="sm" selectedKey={coachId || null} onSelectionChange={(key) => setCoach(key ? String(key) : "")} className={styles.roleSelect}>{members.filter((member) => member.userId !== client.clientId && !client.assignedCoachIds.includes(member.userId)).map((member) => <Option key={member.userId} id={member.userId}>{member.displayName || member.username}</Option>)}</Select>
      <Button type="submit" size="sm" iconStart={<UserPlus />} loading={mutation.isPending} isDisabled={!coachId}>Assign</Button>
    </form>
    <MutationError error={mutation.error} />
  </>;
}

/** Coaches on a Team case, each with a remove button when the viewer may change assignments. */
function AssignedCoaches({ client, members }: { client: TeamClientCase; members: Member[] }) {
  const [remove, setRemove] = useState<string | null>(null);
  const mutation = useCoachingMutation();
  const canChange = client.allowedActions.includes("assign-coach");
  if (!client.assignedCoachIds.length) return <span className={styles.muted}>Awaiting assignment</span>;
  const name = (id: string) => members.find((member) => member.userId === id)?.displayName || "Assigned coach";
  return <>
    <ul className={styles.coachChips} aria-label={`Coaches assigned to ${client.clientName}`}>{client.assignedCoachIds.map((id) => <li key={id}>
      <Avatar name={name(id)} size="sm" decorative />
      <span>{name(id)}</span>
      {canChange ? <IconButton label={`Unassign ${name(id)}`} icon={<X />} size="sm" variant="ghost" isDisabled={mutation.isPending} onPress={() => setRemove(id)} /> : null}
    </li>)}</ul>
    <MutationError error={mutation.error} />
    <AlertDialog isOpen={!!remove} onOpenChange={(open) => { if (!open) setRemove(null); }} title="End this coach assignment?" tone="danger" confirmLabel="Unassign coach" cancelLabel="Keep assignment" isConfirming={mutation.isPending} onConfirm={() => { if (remove) mutation.mutate({ method: "DELETE", path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assignments/${remove}`, json: { version: client.version } }, { onSuccess: () => setRemove(null) }); }}><p>The coach will lose access to this Team case. The client remains with the organization. Assign another authorized coach if needed; private data remains unchanged.</p><MutationError error={mutation.error} /></AlertDialog>
  </>;
}
