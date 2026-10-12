import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, UsersRound } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Link } from "react-router";
import { Alert, Avatar, Button, DataTable, Dialog, DialogFooter, DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, EmptyState, IconButton, LinkButton, Option, PageHeader, SearchInput, Select, TextArea, TextField, Toolbar } from "@trainflow/ui-web";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { ClientHubActions } from "../hub-actions";
import { RequireFeature } from "~/shared/access";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { privateMeta } from "~/shared/i18n/site";
import { useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { ColorSwatches, GROUP_COLORS } from "../color";
import { DataView } from "~/shared/library/DataView";
import { ResponsiveFilters } from "~/shared/library/ResponsiveFilters";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export const meta = () => privateMeta("Clients — TrainFlow");

type CurrentService = Pick<Schema<"RelationshipServiceDto">, "relationshipId" | "offerName" | "currentBilling">;
type AssignmentRow = { id: string; relationshipId: string; programName: string; status: string };

function OfferCell({ service }: { service?: CurrentService }) {
  return service ? <span className={styles.clip}>{service.offerName}</span> : <span className={styles.none}>—</span>;
}

function PaymentCell({ service, pending }: { service?: CurrentService; pending: boolean }) {
  const billing = service?.currentBilling;
  if (pending) return <span className={styles.none}>…</span>;
  return billing ? <StatusBadge status={billing.status} /> : <span className={styles.none}>—</span>;
}

function ClientName({ relationship: r, link = true }: { relationship: Relationship; link?: boolean }) {
  const name = r.client.displayName || r.client.username || "Client";
  return (
    <span className={styles.person}>
      <Avatar name={name} size="sm" decorative />
      <span className={styles.personText}>
        {link ? <Link data-row-link to={`/app/clients/${r.id}`}>{name}</Link> : <span>{name}</span>}
        {r.client.username ? <small>@{r.client.username}</small> : null}
      </span>
    </span>
  );
}

function Clients() {
  const [state, update] = useUrlState({ view: "list", q: "", status: "", page: "1", sort: "updated" });
  const list = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { search: state.q || undefined, status: state.status || undefined, page: pageFromParam(state.page), pageSize: 20, sort: state.sort });
  const relationshipIds = (list.data?.items ?? []).map(client => client.id).sort();
  const services = useCoachingQuery<CurrentService[]>("/api/v1/coaching/services/current", { relationshipIds }, relationshipIds.length > 0);
  const serviceByRelationship = new Map((services.data ?? []).map(service => [service.relationshipId, service]));
  const groups = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page: 1, pageSize: 100, sort: "name" });
  const assignments = useCoachingQuery<Page<AssignmentRow>>("/api/v1/training/assignments", { page: 1, pageSize: 100, view: "coach" });
  const groupById = new Map((groups.data?.items ?? []).map((g) => [g.id, g]));
  const planFor = (id: string) => {
    const mine = (assignments.data?.items ?? []).filter((a) => a.relationshipId === id);
    return mine.find((a) => a.status === "Active") ?? mine[0];
  };
  const groupChips = (r: Relationship) => {
    const items = r.groupIds.map((id) => groupById.get(id)).filter((g): g is Group => Boolean(g));
    if (!items.length) return <span className={styles.none}>—</span>;
    return (
      <span className={styles.chips}>
        {items.slice(0, 2).map((g) => (
          <span key={g.id} className={styles.chip}><span className={styles.swatch} style={{ background: g.color }} aria-hidden="true" />{g.name}</span>
        ))}
        {items.length > 2 ? <span className={styles.none}>+{items.length - 2}</span> : null}
      </span>
    );
  };
  return <><PageHeader title="Clients" description="Your coaching relationships, services and check-ins." actions={<ClientHubActions />} /><HubNavigation />
    <Toolbar aria-label="Filter clients" className={styles.toolbar}>
      <SearchInput aria-label="Search clients" placeholder="Search by name or username" value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <ResponsiveFilters active={Boolean(state.status)}><Select aria-label="Relationship status" selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key) })}><Option id="all">All statuses</Option>{["Active", "Suspended", "Completed"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select>
      <Select aria-label="Sort clients" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}><Option id="updated">Recently updated</Option><Option id="created">Recently started</Option><Option id="status">Status</Option></Select></ResponsiveFilters>
    <LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : list.data.items.length === 0 ? <EmptyState icon={<UsersRound />} title={state.q || state.status ? "No matching clients" : "Your first collaboration starts here"} description="Accept a submitted application to start a coaching relationship." actions={<LinkButton href="/app/leads" variant="primary">View leads</LinkButton>} /> : <>
      <DataView view={state.view === "cards" ? "cards" : "list"} card={(r) => ({
        href: `/app/clients/${r.id}`,
        title: r.client.displayName || r.client.username,
        icon: <Avatar name={r.client.displayName || r.client.username || "Client"} size="lg" decorative />,
        tone: "neutral",
        badge: <StatusBadge status={r.status} />,
        subtitle: r.client.username ? `@${r.client.username}` : undefined,
        facts: [
          { label: "Plan", value: planFor(r.id)?.programName ?? "—" },
          { label: "Group", value: r.groupIds.map((id) => groupById.get(id)?.name).filter(Boolean).join(", ") || "—" },
          { label: "Offer", value: <OfferCell service={serviceByRelationship.get(r.id)} /> },
        ],
        meta: [`Client since ${new Date(r.startedAt).toLocaleDateString()}`],
      })} label="Clients" rows={list.data.items} rowKey={(r) => r.id} columns={[
        { id: "name", header: "Client", width: "22%", cell: (r) => <ClientName relationship={r} /> },
        { id: "plan", header: "Plan", hideOnMobile: true, cell: (r) => { const plan = planFor(r.id); return plan ? <span className={styles.clip}>{plan.programName}</span> : <span className={styles.none}>—</span>; } },
        { id: "group", header: "Group", hideOnMobile: true, cell: groupChips },
        { id: "offer", header: "Offer", hideOnMobile: true, cell: (r) => <OfferCell service={serviceByRelationship.get(r.id)} /> },
        { id: "payment", header: "Payment", hideOnMobile: true, cell: (r) => <PaymentCell service={serviceByRelationship.get(r.id)} pending={services.isPending} /> },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "started", header: "Started", hideOnMobile: true, muted: true, cell: (r) => new Date(r.startedAt).toLocaleDateString() },
      ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}

/** Up to four member avatars and the member count, from the first page of the group's members. */
function GroupMembers({ groupId }: { groupId: string }) {
  const members = useCoachingQuery<Page<Relationship>>(`/api/v1/coaching/groups/${groupId}/members`, { page: 1, pageSize: 4 });
  const total = Number(members.data?.total ?? 0);
  if (members.isPending) return <span className={styles.none}>…</span>;
  return (
    <span className={styles.memberStack}>
      {total ? (
        <span className={styles.avatars} aria-hidden="true">
          {members.data!.items.map((r) => <Avatar key={r.id} name={r.client.displayName || r.client.username || "Client"} size="sm" decorative />)}
        </span>
      ) : null}
      <span>{total === 0 ? "No clients yet" : total === 1 ? "1 client" : `${total} clients`}</span>
    </span>
  );
}

function GroupCard({ group: g, onEdit, onArchive, busy }: { group: Group; onEdit: () => void; onArchive: () => void; busy: boolean }) {
  return (
    <li className={styles.groupItem}>
      <article className={styles.groupCard} style={{ "--group": g.color } as React.CSSProperties}>
        <header className={styles.groupCardHead}>
          <span className={styles.groupMark} aria-hidden="true"><UsersRound /></span>
          <div className={styles.groupCardTitles}>
            <h3><Link to={`/app/groups/${g.id}`} className={styles.stretched}>{g.name}</Link></h3>
            <span className={styles.groupScope}>{g.teamId ? "Team group" : "Personal group"}{g.archived ? " · Archived" : ""}</span>
          </div>
          <DropdownMenuTrigger>
            <IconButton size="sm" label={`Actions for ${g.name}`} icon={<MoreHorizontal />} isDisabled={busy} className={styles.raised} />
            <DropdownMenu aria-label={`Actions for ${g.name}`} onAction={(key) => (key === "edit" ? onEdit() : onArchive())}>
              <DropdownMenuItem id="edit" icon={<Pencil />}>Edit group</DropdownMenuItem>
              {g.archived ? <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>Restore group</DropdownMenuItem> : <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>Archive group</DropdownMenuItem>}
            </DropdownMenu>
          </DropdownMenuTrigger>
        </header>
        <p className={styles.groupDescription}>{g.description || "No description."}</p>
        <footer className={styles.groupCardFoot}>
          <GroupMembers groupId={g.id} />
          <span className={styles.none}>Updated {new Date(g.updatedAt).toLocaleDateString()}</span>
        </footer>
      </article>
    </li>
  );
}

export function Groups() {
  const [state, update] = useUrlState({ view: "list", q: "", page: "1", archived: "false", scope: "personal" });
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const team = state.scope === "team" && context.data?.isActive ? context.data : null;
  const available = state.scope !== "team" || team != null;
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const list = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, archived: state.archived === "true", sort: "name", teamId: team?.teamId }, available);
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const toggleArchive = async (g: Group) => {
    if (!g.archived && !(await ask({ title: `Archive ${g.name}?`, body: "Members stay your clients. Archived groups no longer receive group check-ins or assignments; you can restore the group later.", confirmLabel: "Archive group", cancelLabel: "Keep group" }))) return;
    mutation.mutate({ method: "POST", path: `/api/v1/coaching/groups/${g.id}/${g.archived ? "restore" : "archive"}`, ifMatch: g.version });
  };
  const view = state.view === "cards" ? "cards" : "list";
  return <><PageHeader title="Groups" description={team ? `${team.name} groups created by you, containing your assigned Team cases.` : "Organize your private clients and assign check-ins to a whole group."} actions={<ClientHubActions />} /><HubNavigation />
    <Toolbar aria-label="Filter groups" className={styles.toolbar}>
      <Select aria-label="Group ownership" selectedKey={team ? "team" : "personal"} onSelectionChange={key => update({ scope: String(key) })}><Option id="personal">Personal</Option>{context.data?.isActive && <Option id="team">Team · {context.data.name}</Option>}</Select>
      <SearchInput aria-label="Search groups" placeholder="Search groups" value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <Select aria-label="Group visibility" selectedKey={state.archived} onSelectionChange={(key) => update({ archived: String(key) })}><Option id="false">Active groups</Option><Option id="true">Archived groups</Option></Select>
      <span className={styles.spacer} />
      <LibraryViewToggle value={view} onChange={(next) => update({ view: next })} />
      <Button variant="primary" iconStart={<Plus />} isDisabled={!available} onPress={() => setEditing("new")}>New group</Button>
    </Toolbar>
    <MutationError error={mutation.error} />
    {confirmDialog}
    {!available && context.isPending ? <Loading /> : !available && context.isError ? <Failure error={context.error} retry={() => void context.refetch()} /> : !available && !context.isPending ? <Alert tone="warning" title="Team groups are unavailable">An active Team membership is required. <Button onPress={() => update({ scope: "personal" })}>Open personal groups</Button></Alert> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<UsersRound />} title={state.q ? "No matching groups" : "No groups yet"} description="Create a group, then add clients from the same ownership scope." actions={!state.q && <Button variant="primary" iconStart={<Plus />} onPress={() => setEditing("new")}>New group</Button>} /> : <>
      {view === "cards" ? (
        <ul className={styles.groupGrid} aria-label="Groups">
          {list.data.items.map((g) => <GroupCard key={g.id} group={g} busy={mutation.isPending} onEdit={() => setEditing(g)} onArchive={() => void toggleArchive(g)} />)}
        </ul>
      ) : (
        <DataTable label="Groups" rows={list.data.items} rowKey={(g) => g.id} columns={[
          { id: "name", header: "Group", width: "28%", cell: (g) => <Link data-row-link to={`/app/groups/${g.id}`} className={styles.named}><span className={styles.colorBar} style={{ background: g.color }} aria-hidden="true" />{g.name}</Link> },
          { id: "members", header: "Clients", hideOnMobile: true, cell: (g) => <GroupMembers groupId={g.id} /> },
          { id: "description", header: "Description", cell: (g) => g.description || "—", muted: true, hideOnMobile: true },
          {
            id: "actions",
            header: <span className="tf-visually-hidden">Actions</span>,
            width: "3.5rem",
            align: "end",
            cell: (g) => (
              <DropdownMenuTrigger>
                <IconButton size="sm" label={`Actions for ${g.name}`} icon={<MoreHorizontal />} isDisabled={mutation.isPending} />
                <DropdownMenu aria-label={`Actions for ${g.name}`} onAction={(key) => (key === "edit" ? setEditing(g) : void toggleArchive(g))}>
                  <DropdownMenuItem id="edit" icon={<Pencil />}>Edit group</DropdownMenuItem>
                  {g.archived ? <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>Restore group</DropdownMenuItem> : <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>Archive group</DropdownMenuItem>}
                </DropdownMenu>
              </DropdownMenuTrigger>
            ),
          },
        ]} />
      )}
      <ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {editing && <GroupEditor key={typeof editing === "string" ? editing : editing.id} group={editing === "new" ? undefined : editing} teamId={team?.teamId} close={() => setEditing(null)} />}
  </>;
}

export function GroupEditor({ group, teamId, close }: { group?: Group; teamId?: string; close: () => void }) {
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
