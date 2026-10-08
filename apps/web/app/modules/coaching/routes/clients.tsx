import { Plus, UsersRound } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Link } from "react-router";
import { Alert, Button, DataTable, Dialog, DialogFooter, EmptyState, LinkButton, Option, PageHeader, SearchInput, Select, TextArea, TextField, Toolbar } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { privateMeta } from "~/shared/i18n/site";
import { useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { ColorSwatches, GROUP_COLORS } from "../color";
import styles from "../coaching.module.css";

export const meta = () => privateMeta("Clients — TrainFlow");

function Clients() {
  const [state, update] = useUrlState({ q: "", status: "", page: "1", sort: "updated" });
  const list = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { search: state.q || undefined, status: state.status || undefined, page: pageFromParam(state.page), pageSize: 20, sort: state.sort });
  return <><PageHeader title="Clients" description="Your coaching relationships, services and check-ins." actions={<LinkButton href="/app/groups" iconStart={<UsersRound />}>Manage groups</LinkButton>} /><HubNavigation />
    <Toolbar aria-label="Filter clients" className={styles.toolbar}>
      <SearchInput aria-label="Search clients" placeholder="Search by name or username" value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <Select aria-label="Relationship status" selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key) })}><Option id="all">All statuses</Option>{["Active", "Suspended", "Completed"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select>
      <Select aria-label="Sort clients" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}><Option id="updated">Recently updated</Option><Option id="created">Recently started</Option><Option id="status">Status</Option></Select>
    </Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : list.data.items.length === 0 ? <EmptyState icon={<UsersRound />} title={state.q || state.status ? "No matching clients" : "Your first collaboration starts here"} description="Accept a submitted application to start a coaching relationship." actions={<LinkButton href="/app/leads" variant="primary">View leads</LinkButton>} /> : <>
      <DataTable label="Clients" rows={list.data.items} rowKey={(r) => r.id} columns={[
        { id: "name", header: "Client", cell: (r) => <Link data-row-link to={`/app/clients/${r.id}`}>{r.client.displayName || r.client.username}</Link> },
        { id: "username", header: "Username", cell: (r) => r.client.username, muted: true, hideOnMobile: true },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "started", header: "Started", cell: (r) => new Date(r.startedAt).toLocaleDateString(), hideOnMobile: true },
      ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}

export function Groups() {
  const [state, update] = useUrlState({ q: "", page: "1", archived: "false", scope: "personal" });
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const team = state.scope === "team" && context.data?.isActive ? context.data : null;
  const available = state.scope !== "team" || team != null;
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const list = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, archived: state.archived === "true", sort: "name", teamId: team?.teamId }, available);
  const mutation = useCoachingMutation();
  return <><PageHeader title="Groups" description={team ? `${team.name} groups created by you, containing your assigned Team cases.` : "Organize your private clients and assign check-ins to a whole group."} actions={<Button variant="primary" iconStart={<Plus />} isDisabled={!available} onPress={() => setEditing("new")}>New group</Button>} /><HubNavigation />
    <Toolbar aria-label="Filter groups" className={styles.toolbar}><Select aria-label="Group ownership" selectedKey={team ? "team" : "personal"} onSelectionChange={key => update({ scope: String(key) })}><Option id="personal">Personal</Option>{context.data?.isActive && <Option id="team">Team · {context.data.name}</Option>}</Select><SearchInput aria-label="Search groups" placeholder="Search groups" value={state.q} onChange={(q) => update({ q })} className={styles.search} /><Select aria-label="Group visibility" selectedKey={state.archived} onSelectionChange={(key) => update({ archived: String(key) })}><Option id="false">Active groups</Option><Option id="true">Archived groups</Option></Select></Toolbar>
    <MutationError error={mutation.error} />
    {!available && context.isPending ? <Loading /> : !available && context.isError ? <Failure error={context.error} retry={() => void context.refetch()} /> : !available && !context.isPending ? <Alert tone="warning" title="Team groups are unavailable">An active Team membership is required. <Button onPress={() => update({ scope: "personal" })}>Open personal groups</Button></Alert> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<UsersRound />} title={state.q ? "No matching groups" : "No groups yet"} description="Create a group, then add clients from the same ownership scope." actions={!state.q && <Button variant="primary" iconStart={<Plus />} onPress={() => setEditing("new")}>New group</Button>} /> : <><DataTable label="Groups" rows={list.data.items} rowKey={(g) => g.id} columns={[
      { id: "name", header: "Group", cell: (g) => <Link data-row-link to={`/app/groups/${g.id}`} className={styles.named}><span className={styles.swatch} style={{ background: g.color }} aria-hidden="true" />{g.name}</Link> }, { id: "description", header: "Description", cell: (g) => g.description, muted: true },
      { id: "actions", header: "Actions", cell: (g) => <div className={styles.actions}><Button size="sm" variant="ghost" onPress={() => setEditing(g)}>Edit</Button><Button size="sm" variant="ghost" isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/coaching/groups/${g.id}/${g.archived ? "restore" : "archive"}`, ifMatch: g.version })}>{g.archived ? "Restore" : "Archive"}</Button></div> },
    ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {editing && <GroupEditor key={typeof editing === "string" ? editing : editing.id} group={editing === "new" ? undefined : editing} teamId={team?.teamId} close={() => setEditing(null)} />}
  </>;
}

function GroupEditor({ group, teamId, close }: { group?: Group; teamId?: string; close: () => void }) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[3]!.value);
  const mutation = useCoachingMutation(close);
  return <Dialog isOpen onOpenChange={(open) => { if (!open) close(); }} title={group ? "Edit group" : "New client group"} description="Groups let you message, schedule and send check-ins to several clients at once.">
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: group ? "PATCH" : "POST", path: `/api/v1/coaching/groups${group ? `/${group.id}` : ""}`, ifMatch: group?.version, json: { name: name.trim(), description, color, teamId: group ? group.teamId ?? null : teamId ?? null } }); }}>
      <Alert title={(group ? group.teamId : teamId) ? "Team-owned group" : "Personal group"}>Only clients from the same ownership scope can be added. Scope is fixed when this group is created.</Alert>
      <TextField label="Name" placeholder="e.g. Marathon block" value={name} onChange={setName} isRequired maxLength={200} autoFocus />
      <TextArea label="Description" placeholder="Optional, who is in this group and why" value={description} onChange={setDescription} maxLength={4000} />
      <ColorSwatches label="Colour" value={color} onChange={setColor} />
      <MutationError error={mutation.error} />
      <DialogFooter>
        <Button onPress={close}>Cancel</Button>
        <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!name.trim()}>{group ? "Save changes" : "Create group"}</Button>
      </DialogFooter>
    </form>
  </Dialog>;
}

export default function ClientsRoute() { return <RequireFeature feature="coaching.clients.view"><Clients /></RequireFeature>; }
