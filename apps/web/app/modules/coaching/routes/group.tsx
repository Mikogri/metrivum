import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Group details — Metrivum");

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { AssignmentList, TrainingProgress } from "~/modules/training";
import {
  AlertDialog,
  Avatar,
  Badge,
  Button,
  Alert,
  DataTable,
  Dialog,
  DialogFooter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  LinkButton,
  Option,
  PageHeader,
  Select,
  Tab,
  TabList,
  Tabs,
  toast,
} from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { groupInvalidation, useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { GroupEditor } from "./clients";
import styles from "../coaching.module.css";

const TABS = [["members", "Members"], ["programs", "Programs"], ["progress", "Progress"]] as const;

function GroupDetail() {
  const { groupId } = useParams();
  const [state, update] = useUrlState({ page: "1", tab: "members" });
  const tab = TABS.some(([id]) => id === state.tab) ? state.tab : "members";
  const group = useCoachingQuery<Group>(`/api/v1/coaching/groups/${groupId}`);
  const members = useCoachingQuery<Page<Relationship>>(`/api/v1/coaching/groups/${groupId}/members`, { page: pageFromParam(state.page), pageSize: 20 });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<Relationship | null>(null);
  const mutation = useCoachingMutation(undefined, groupInvalidation);
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const remove = useCoachingMutation(() => {
    setRemoving(null);
    toast({ tone: "success", title: "Client removed from the group" });
  }, groupInvalidation);
  if (group.isPending || members.isPending) return <Loading />;
  if (group.isError || members.isError) return <Failure error={group.error ?? members.error} retry={() => { void group.refetch(); void members.refetch(); }} />;
  const g = group.data;
  const canAdd = g.allowedActions.includes("add-member");
  const total = Number(members.data.total);

  return (
    <>
      <PageHeader
        title={
          <span className={styles.groupTitle}>
            <span className={styles.groupSwatch} style={{ background: g.color }} aria-hidden="true" />
            {g.name}
            <Badge size="sm" tone={g.teamId ? "violet" : "neutral"}>{g.teamId ? "Team" : "Personal"}</Badge>
          </span>
        }
        description={g.description || undefined}
        meta={
          <>
            {g.archived ? <StatusBadge status="Archived" /> : null}
            <span>{total === 1 ? "1 client" : `${total} clients`}</span>
          </>
        }
        actions={
          <>
            {canAdd && !g.archived ? <Button variant="primary" iconStart={<UserPlus />} onPress={() => setAdding(true)}>Add client</Button> : null}
            <DropdownMenuTrigger>
              <IconButton label="Group actions" icon={<MoreHorizontal />} variant="ghost" />
              <DropdownMenu
                aria-label="Group actions"
                onAction={async (key) => {
                  if (key === "edit") return setEditing(true);
                  if (key === "archive" && !(await ask({ title: `Archive ${g.name}?`, body: "Members stay your clients. Archived groups no longer receive group check-ins or assignments; you can restore the group later.", confirmLabel: "Archive group", cancelLabel: "Keep group" }))) return;
                  mutation.mutate({ method: "POST", path: `/api/v1/coaching/groups/${g.id}/${g.archived ? "restore" : "archive"}`, ifMatch: g.version });
                }}
              >
                <DropdownMenuItem id="edit" icon={<Pencil />}>Edit group</DropdownMenuItem>
                <DropdownMenuSeparator />
                {g.archived ? (
                  <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>Restore group</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>Archive group</DropdownMenuItem>
                )}
              </DropdownMenu>
            </DropdownMenuTrigger>
          </>
        }
      />
      <MutationError error={mutation.error} />
      {confirmDialog}
      <Tabs selectedKey={tab} onSelectionChange={(key) => update({ tab: String(key) })} className={styles.detailTabs}>
        <TabList aria-label="Group views">
          {TABS.map(([id, label]) => <Tab key={id} id={id}>{label}</Tab>)}
        </TabList>
      </Tabs>
      {tab === "programs" ? (
        <AssignmentList groupId={groupId} assign={{ groupId, teamId: g.teamId }} />
      ) : tab === "progress" ? (
        <TrainingProgress groupId={groupId} coach />
      ) : !members.data.items.length ? (
        <EmptyState
          icon={<UsersRound />}
          title="This group has no clients"
          description={g.teamId ? "Add one of your assigned Team clients." : "Add a client from your private coaching practice."}
          actions={canAdd && !g.archived ? <Button variant="primary" iconStart={<UserPlus />} onPress={() => setAdding(true)}>Add client</Button> : undefined}
        />
      ) : (
        <>
          <DataTable label="Group members" rows={members.data.items} rowKey={(r) => r.id} columns={[
            {
              id: "name",
              header: "Client",
              width: "40%",
              cell: (r) => {
                const name = r.client.displayName || r.client.username || "Client";
                return (
                  <span className={styles.person}>
                    <Avatar name={name} size="sm" decorative />
                    <span className={styles.personText}>
                      <Link data-row-link to={`/app/clients/${r.id}`}>{name}</Link>
                      {r.client.username ? <small>@{r.client.username}</small> : null}
                    </span>
                  </span>
                );
              },
            },
            { id: "started", header: "Client since", hideOnMobile: true, muted: true, cell: (r) => new Date(r.startedAt).toLocaleDateString() },
            { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            {
              id: "actions",
              header: <span className="tf-visually-hidden">Actions</span>,
              width: "3.5rem",
              align: "end",
              cell: (r) => (
                <DropdownMenuTrigger>
                  <IconButton size="sm" label={`Actions for ${r.client.displayName}`} icon={<MoreHorizontal />} />
                  <DropdownMenu aria-label={`Actions for ${r.client.displayName}`} onAction={() => setRemoving(r)}>
                    <DropdownMenuItem id="remove" tone="danger" icon={<UserMinus />}>Remove from group</DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>
              ),
            },
          ]} />
          <ListPagination data={members.data} onChange={(page) => update({ page: String(page) })} />
        </>
      )}
      {adding ? <AddMemberDialog group={g} close={() => setAdding(false)} /> : null}
      {editing ? <GroupEditor group={g} close={() => setEditing(false)} /> : null}
      <AlertDialog
        isOpen={removing !== null}
        onOpenChange={(open) => { if (!open && !remove.isPending) setRemoving(null); }}
        title="Remove from this group?"
        tone="danger"
        confirmLabel="Remove from group"
        cancelLabel="Keep in group"
        isConfirming={remove.isPending}
        onConfirm={() => { if (removing) remove.mutate({ method: "DELETE", path: `/api/v1/coaching/groups/${g.id}/members/${removing.id}`, ifMatch: g.version }); }}
      >
        {removing?.client.displayName} stays your client. Group check-ins and future group assignments no longer include them.
        <MutationError error={remove.error} />
      </AlertDialog>
    </>
  );
}

function AddMemberDialog({ group, close }: { group: Group; close: () => void }) {
  const [relationshipId, setRelationship] = useState("");
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { teamId: group.teamId ?? undefined, status: "Active", page: 1, pageSize: 100 });
  const mutation = useCoachingMutation(() => {
    toast({ tone: "success", title: "Client added to the group" });
    close();
  }, groupInvalidation);
  const available = clients.data?.items.filter((client) => !client.groupIds.includes(group.id)) ?? [];
  return (
    <Dialog isOpen title="Add a client" description={group.teamId ? "Choose one of your assigned Team coaching cases." : "Choose a client from your private coaching practice."} onOpenChange={(open) => { if (!open && !mutation.isPending) close(); }}>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); mutation.mutate({ method: "PUT", path: `/api/v1/coaching/groups/${group.id}/members/${relationshipId}`, ifMatch: group.version }); }}>
        {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} retry={() => void clients.refetch()} /> : !clients.data.items.length ? (
          <Alert tone="info" title={group.teamId ? "No Team clients assigned to you" : "No active clients yet"} actions={group.teamId ? undefined : <LinkButton href="/app/clients" size="sm">Open clients</LinkButton>}>
            {group.teamId ? "Only Team clients assigned to you can join this group." : "Groups contain your active clients. Invite a client or accept an application first."}
          </Alert>
        ) : !available.length ? (
          <Alert tone="info" title="Everyone is already in this group">All {clients.data.items.length} of your active clients are members. New clients can be added once they join.</Alert>
        ) : (
          <Select label="Client" placeholder="Choose a client" isRequired selectedKey={relationshipId || null} onSelectionChange={(key) => setRelationship(String(key))}>
            {available.map((client) => <Option key={client.id} id={client.id}>{client.client.displayName || client.client.username}</Option>)}
          </Select>
        )}
        <MutationError error={mutation.error} />
        <DialogFooter>
          {clients.data && !available.length ? <Button onPress={close}>Close</Button> : <>
            <Button onPress={close} isDisabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!relationshipId}>Add to group</Button>
          </>}
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export default function GroupRoute() {
  return <RequireFeature feature="coaching.groups.manage"><GroupDetail /></RequireFeature>;
}
