import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, UserCog, UsersRound } from "lucide-react";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Link } from "react-router";
import { Alert, Avatar, Button, Checkbox, DataTable, Dialog, DialogFooter, DropdownMenu, DropdownMenuItem, DropdownMenuTrigger, EmptyState, IconButton, LinkButton, Option, PageHeader, SearchInput, Select, TextArea, TextField, Toolbar, toast } from "@metrivum/ui-web";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { ClientHubActions } from "../hub-actions";
import { RequireFeature } from "~/shared/access";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { privateMeta } from "~/shared/i18n/site";
import { groupInvalidation, useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { ColorSwatches, GROUP_COLORS } from "../color";
import { CategoryTag, categoryName } from "../offer-category";
import { PlanState, clientNote } from "../client-card";
import { DataView } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import { ResponsiveFilters } from "~/shared/library/ResponsiveFilters";
import styles from "../coaching.module.css";

export const meta = () => privateMeta("Clients — Metrivum");

type CurrentService = Schema<"CurrentRelationshipServiceDto">;
const modeName = (mode?: string | null) => (mode === "Offline" ? "In person" : mode ?? null);
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
  const uiCopy = useUiCopy();

  const [state, update] = useUrlState({ view: "list", q: "", status: "", type: "", offer: "", page: "1", sort: "updated" });
  const list = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { search: state.q || undefined, status: state.status || undefined, offerCategory: state.type || undefined, offerId: state.offer || undefined, page: pageFromParam(state.page), pageSize: 20, sort: state.sort });
  const categories = useCoachingQuery<Schema<"OfferCategoryDto">[]>("/api/v1/offers/categories");
  const offers = useCoachingQuery<Page<Schema<"OfferDto">>>("/api/v1/offers", { page: 1, pageSize: 100, sort: "name" });
  const filtered = Boolean(state.q || state.status || state.type || state.offer);
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
  return <><PageHeader title={uiCopy["dashboard"]["coach"]["clients"]} description={uiCopy["ui"]["Your coaching relationships, services and check-ins."]} actions={<ClientHubActions />} /><HubNavigation />
    <Toolbar aria-label={uiCopy["ui"]["Filter clients"]} className={styles.toolbar}>
      <SearchInput aria-label={uiCopy["ui"]["Search clients"]} placeholder={uiCopy["ui"]["Search by name or username"]} value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <ResponsiveFilters active={Boolean(state.status || state.type || state.offer)}>
      <Select aria-label={uiCopy["ui"]["Relationship status"]} selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key) })}><Option id="all">{uiCopy["ui"]["All statuses"]}</Option>{["Active", "Suspended", "Completed"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select>
      <Select aria-label={uiCopy["ui"]["Plan type"]} selectedKey={state.type || "all"} onSelectionChange={(key) => update({ type: key === "all" ? "" : String(key) })}><Option id="all">{uiCopy["ui"]["All plan types"]}</Option>{(categories.data ?? []).filter((c) => c.active || c.key === state.type).map((c) => <Option key={c.key} id={c.key} textValue={categoryName(c.key)}><CategoryTag category={c.key} /></Option>)}</Select>
      <Select aria-label={uiCopy["ui"]["Offer"]} selectedKey={state.offer || "all"} onSelectionChange={(key) => update({ offer: key === "all" ? "" : String(key) })}><Option id="all">{uiCopy["ui"]["All offers"]}</Option>{(offers.data?.items ?? []).map((o) => <Option key={o.id} id={o.id}>{o.name}</Option>)}</Select>
      <Select aria-label={uiCopy["ui"]["Sort clients"]} selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })}><Option id="updated">{uiCopy["training"]["library"]["sort"]["updated"]}</Option><Option id="created">{uiCopy["ui"]["Recently started"]}</Option><Option id="status">{uiCopy["usage"]["colState"]}</Option></Select>
      </ResponsiveFilters>
    <LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>
    {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : list.data.items.length === 0 ? <EmptyState icon={<UsersRound />} title={filtered ? uiCopy["ui"]["No matching clients"] : uiCopy["ui"]["Your first collaboration starts here"]} description={filtered ? uiCopy["ui"]["Clear the search or choose other filters."] : uiCopy["ui"]["Accept a submitted application to start a coaching relationship."]} actions={filtered ? undefined : <LinkButton href="/app/leads" variant="primary">{uiCopy["ui"]["View leads"]}</LinkButton>} /> : <>
      <DataView view={state.view === "cards" ? "cards" : "list"} card={(r) => ({
        href: `/app/clients/${r.id}`,
        title: r.client.displayName || r.client.username,
        icon: <Avatar name={r.client.displayName || r.client.username || "Client"} size="md" decorative />,
        tone: "neutral",
        badge: <StatusBadge status={r.status} />,
        // Groups show as their colours only, on the card's edge; the names are in the tooltip.
        marks: r.groupIds.map((id) => groupById.get(id)).filter((g): g is Group => Boolean(g)).map((g) => ({ color: g.color, label: g.name })),
        subtitle: r.client.username ? `@${r.client.username}` : undefined,
        description: clientNote(r.status, Boolean(planFor(r.id))),
        // When the collaboration started, how it is run, and where the assigned training plan stands.
        facts: [
          { label: uiCopy["ui"]["Since"], value: new Date(r.startedAt).toLocaleDateString([], { dateStyle: "medium" }) },
          ...(modeName(serviceByRelationship.get(r.id)?.coachingMode) ? [{ label: "", value: modeName(serviceByRelationship.get(r.id)?.coachingMode) }] : []),
          { label: uiCopy["ui"]["Plan"], value: planFor(r.id) ? <PlanState status={planFor(r.id)!.status} /> : "none" },
        ],
      })} label={uiCopy["dashboard"]["coach"]["clients"]} rows={list.data.items} rowKey={(r) => r.id} columns={[
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
 const uiCopy = useUiCopy();

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
      <span>{total === 0 ? uiCopy["ui"]["No clients yet"] : total === 1 ? uiCopy["ui"]["1 client"] : `${total} clients`}</span>
    </span>
  );
}

function GroupCard({ group: g, onEdit, onArchive, onMembers, busy }: { group: Group; onEdit: () => void; onArchive: () => void; onMembers: () => void; busy: boolean }) {
  const uiCopy = useUiCopy();

  return (
    <li className={styles.groupItem}>
      <article className={styles.groupCard} style={{ "--group": g.color } as React.CSSProperties}>
        <header className={styles.groupCardHead}>
          <span className={styles.groupMark} aria-hidden="true"><UsersRound /></span>
          <div className={styles.groupCardTitles}>
            <h3><Link to={`/app/groups/${g.id}`} className={styles.stretched}>{g.name}</Link></h3>
            <span className={styles.groupScope}>{g.teamId ? uiCopy["ui"]["Team group"] : uiCopy["ui"]["Personal group"]}{g.archived ? uiCopy["ui"][" · Archived"] : ""}</span>
          </div>
          <DropdownMenuTrigger>
            <IconButton size="sm" label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [g.name])} icon={<MoreHorizontal />} isDisabled={busy} className={styles.raised} />
            <DropdownMenu aria-label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [g.name])} onAction={(key) => (key === "members" ? onMembers() : key === "edit" ? onEdit() : onArchive())}>
              {!g.archived ? <DropdownMenuItem id="members" icon={<UserCog />}>{uiCopy["access"]["features"]["coaching.clients.manage"]}</DropdownMenuItem> : null}
              <DropdownMenuItem id="edit" icon={<Pencil />}>{uiCopy["ui"]["Edit group"]}</DropdownMenuItem>
              {g.archived ? <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>{uiCopy["ui"]["Restore group"]}</DropdownMenuItem> : <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>{uiCopy["ui"]["Archive group"]}</DropdownMenuItem>}
            </DropdownMenu>
          </DropdownMenuTrigger>
        </header>
        <p className={styles.groupDescription}>{g.description || uiCopy["training"]["detail"]["emptyDescription"]}</p>
        <footer className={styles.groupCardFoot}>
          {g.archived ? <GroupMembers groupId={g.id} /> : <button type="button" className={styles.membersButton} onClick={onMembers} aria-label={formatInterfaceText(uiCopy["ui"]["Manage clients in {0}"], [g.name])}><GroupMembers groupId={g.id} /></button>}
          <span className={styles.none}>{uiCopy["training"]["library"]["columns"]["updated"]} {new Date(g.updatedAt).toLocaleDateString()}</span>
        </footer>
      </article>
    </li>
  );
}

export function Groups() {
  const uiCopy = useUiCopy();

  const [state, update] = useUrlState({ view: "list", q: "", page: "1", archived: "false", scope: "personal" });
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const team = state.scope === "team" && context.data?.isActive ? context.data : null;
  const available = state.scope !== "team" || team != null;
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const [managing, setManaging] = useState<Group | null>(null);
  const list = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined, archived: state.archived === "true", sort: "name", teamId: team?.teamId }, available);
  const mutation = useCoachingMutation(undefined, groupInvalidation);
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const toggleArchive = async (g: Group) => {
    if (!g.archived && !(await ask({ title: `Archive ${g.name}?`, body: "Members stay your clients. Archived groups no longer receive group check-ins or assignments; you can restore the group later.", confirmLabel: uiCopy["ui"]["Archive group"], cancelLabel: uiCopy["ui"]["Keep group"] }))) return;
    mutation.mutate({ method: "POST", path: `/api/v1/coaching/groups/${g.id}/${g.archived ? "restore" : "archive"}`, ifMatch: g.version });
  };
  const view = state.view === "cards" ? "cards" : "list";
  return <><PageHeader title={uiCopy["ui"]["Groups"]} description={team ? `${team.name} groups created by you, containing your assigned Team cases.` : uiCopy["ui"]["Organize your private clients and assign check-ins to a whole group."]} actions={<ClientHubActions />} /><HubNavigation />
    <Toolbar aria-label={uiCopy["ui"]["Filter groups"]} className={styles.toolbar}>
      <Select aria-label={uiCopy["ui"]["Group ownership"]} selectedKey={team ? "team" : "personal"} onSelectionChange={key => update({ scope: String(key) })}><Option id="personal">{uiCopy["ui"]["Personal"]}</Option>{context.data?.isActive && <Option id="team">{uiCopy["ui"]["Team ·"]} {context.data.name}</Option>}</Select>
      <SearchInput aria-label={uiCopy["ui"]["Search groups"]} placeholder={uiCopy["ui"]["Search groups"]} value={state.q} onChange={(q) => update({ q })} className={styles.search} />
      <Select aria-label={uiCopy["ui"]["Group visibility"]} selectedKey={state.archived} onSelectionChange={(key) => update({ archived: String(key) })}><Option id="false">{uiCopy["ui"]["Active groups"]}</Option><Option id="true">{uiCopy["ui"]["Archived groups"]}</Option></Select>
      <span className={styles.spacer} />
      <LibraryViewToggle value={view} onChange={(next) => update({ view: next })} />
      <Button variant="primary" iconStart={<Plus />} isDisabled={!available} onPress={() => setEditing("new")}>{uiCopy["ui"]["New group"]}</Button>
    </Toolbar>
    <MutationError error={mutation.error} />
    {confirmDialog}
    {!available && context.isPending ? <Loading /> : !available && context.isError ? <Failure error={context.error} retry={() => void context.refetch()} /> : !available && !context.isPending ? <Alert tone="warning" title={uiCopy["ui"]["Team groups are unavailable"]}>{uiCopy["ui"]["An active Team membership is required."]} <Button onPress={() => update({ scope: "personal" })}>{uiCopy["ui"]["Open personal groups"]}</Button></Alert> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? <EmptyState icon={<UsersRound />} title={state.q ? uiCopy["ui"]["No matching groups"] : uiCopy["ui"]["No groups yet"]} description={uiCopy["ui"]["Create a group, then add clients from the same ownership scope."]} actions={!state.q && <Button variant="primary" iconStart={<Plus />} onPress={() => setEditing("new")}>{uiCopy["ui"]["New group"]}</Button>} /> : <>
      {view === "cards" ? (
        <ul className={styles.groupGrid} aria-label={uiCopy["ui"]["Groups"]}>
          {list.data.items.map((g) => <GroupCard key={g.id} group={g} busy={mutation.isPending} onEdit={() => setEditing(g)} onArchive={() => void toggleArchive(g)} onMembers={() => setManaging(g)} />)}
        </ul>
      ) : (
        <DataTable label={uiCopy["ui"]["Groups"]} rows={list.data.items} rowKey={(g) => g.id} columns={[
          { id: "name", header: "Group", width: "28%", cell: (g) => <Link data-row-link to={`/app/groups/${g.id}`} className={styles.named}><span className={styles.colorBar} style={{ background: g.color }} aria-hidden="true" />{g.name}</Link> },
          { id: "members", header: "Clients", hideOnMobile: true, cell: (g) => g.archived ? <GroupMembers groupId={g.id} /> : <button type="button" className={styles.membersButton} onClick={() => setManaging(g)} aria-label={formatInterfaceText(uiCopy["ui"]["Manage clients in {0}"], [g.name])}><GroupMembers groupId={g.id} /></button> },
          { id: "description", header: "Description", cell: (g) => g.description || "—", muted: true, hideOnMobile: true },
          {
            id: "actions",
            header: <span className="tf-visually-hidden">{uiCopy["editor"]["sheet"]["contextLabel"]}</span>,
            width: "3.5rem",
            align: "end",
            cell: (g) => (
              <DropdownMenuTrigger>
                <IconButton size="sm" label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [g.name])} icon={<MoreHorizontal />} isDisabled={mutation.isPending} />
                <DropdownMenu aria-label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [g.name])} onAction={(key) => (key === "members" ? setManaging(g) : key === "edit" ? setEditing(g) : void toggleArchive(g))}>
                  {!g.archived ? <DropdownMenuItem id="members" icon={<UserCog />}>{uiCopy["access"]["features"]["coaching.clients.manage"]}</DropdownMenuItem> : null}
                  <DropdownMenuItem id="edit" icon={<Pencil />}>{uiCopy["ui"]["Edit group"]}</DropdownMenuItem>
                  {g.archived ? <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>{uiCopy["ui"]["Restore group"]}</DropdownMenuItem> : <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>{uiCopy["ui"]["Archive group"]}</DropdownMenuItem>}
                </DropdownMenu>
              </DropdownMenuTrigger>
            ),
          },
        ]} />
      )}
      <ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
    {editing && <GroupEditor key={typeof editing === "string" ? editing : editing.id} group={editing === "new" ? undefined : editing} teamId={team?.teamId} close={() => setEditing(null)} />}
    {managing && <GroupMembersDialog key={managing.id} groupId={managing.id} close={() => setManaging(null)} />}
  </>;
}

/**
 * Who is in a group: add and remove clients from the group's scope (personal or Team), then Save.
 * Nothing changes until Save; Cancel drops the edits. Each change is sent in turn with the group's latest version.
 */
function GroupMembersDialog({ groupId, close }: { groupId: string; close: () => void }) {
  const uiCopy = useUiCopy();

  const [search, setSearch] = useState("");
  const group = useCoachingQuery<Group>(`/api/v1/coaching/groups/${groupId}`);
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { teamId: group.data?.teamId ?? undefined, status: "Active", page: 1, pageSize: 100 }, Boolean(group.data));
  const mutation = useCoachingMutation<Group>(undefined, groupInvalidation);
  const [saving, setSaving] = useState(false);
  const g = group.data;
  const all = clients.data?.items ?? [];
  const saved = new Set(g ? all.filter((r) => r.groupIds.includes(g.id)).map((r) => r.id) : []);
  // The edited membership; null until the first change, so it starts from what is saved.
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const members = draft ?? saved;
  const added = [...members].filter((id) => !saved.has(id));
  const removed = [...saved].filter((id) => !members.has(id));
  const dirty = added.length + removed.length > 0;
  const set = (id: string, on: boolean) => setDraft(() => { const next = new Set(members); if (on) next.add(id); else next.delete(id); return next; });
  const term = search.trim().toLowerCase();
  const matches = (r: Relationship) => !term || `${r.client.displayName} ${r.client.username}`.toLowerCase().includes(term);
  const name = (r: Relationship) => r.client.displayName || r.client.username || "Client";
  // Members first, then everyone else, each alphabetically.
  const shown = all.filter(matches).sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)) || name(a).localeCompare(name(b)));
  // Names and colours of the coach's other groups, to show where each client already is.
  const groups = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page: 1, pageSize: 100, archived: false, teamId: g?.teamId ?? undefined }, Boolean(g));
  const groupById = new Map((groups.data?.items ?? []).map((item) => [item.id, item]));
  const save = async () => {
    if (!g) return;
    setSaving(true);
    try {
      let version = g.version;
      for (const id of added) version = (await mutation.mutateAsync({ method: "PUT", path: `/api/v1/coaching/groups/${g.id}/members/${id}`, ifMatch: version })).version;
      for (const id of removed) version = (await mutation.mutateAsync({ method: "DELETE", path: `/api/v1/coaching/groups/${g.id}/members/${id}`, ifMatch: version })).version;
      toast({ tone: "success", title: uiCopy["ui"]["Group saved"], description: `${added.length ? `${added.length} added` : ""}${added.length && removed.length ? " · " : ""}${removed.length ? `${removed.length} removed` : ""}` });
      close();
    } catch {
      // The error is shown in the dialog; what was already saved stays saved.
    } finally {
      setSaving(false);
    }
  };
  const row = (r: Relationship) => {
    const member = members.has(r.id);
    const elsewhere = r.groupIds.filter((id) => id !== g?.id).map((id) => groupById.get(id)).filter((item): item is Group => Boolean(item));
    return <li key={r.id} data-member={member || undefined} data-changed={member !== saved.has(r.id) || undefined}>
      <Checkbox isSelected={member} isDisabled={saving} onChange={(on) => set(r.id, on)} aria-label={`${name(r)} in ${g?.name ?? "the group"}`}>
        <span className={styles.membersRow}>
          <Avatar name={name(r)} size="sm" decorative />
          <span className={styles.membersName}><strong>{name(r)}</strong>{r.client.username ? <small>@{r.client.username}</small> : null}</span>
          {elsewhere.length ? <span className={styles.membersGroups} title={formatInterfaceText(uiCopy["ui"]["Also in {0}"], [elsewhere.map((item) => item.name).join(", ")])}>
            {elsewhere.slice(0, 3).map((item) => <span key={item.id} style={{ "--group": item.color } as React.CSSProperties}>{item.name}</span>)}
            {elsewhere.length > 3 ? <small>+{elsewhere.length - 3}</small> : null}
          </span> : null}
        </span>
      </Checkbox>
    </li>;
  };
  return <Dialog isOpen size="md" title={g ? `Clients in ${g.name}` : uiCopy["ui"]["Clients in group"]}
    description={g ? `${members.size} of ${all.length} ${g.teamId ? "assigned Team clients" : "active clients"}${dirty ? ` · ${added.length} to add, ${removed.length} to remove` : ""}` : undefined}
    isDismissable={!dirty && !saving} onOpenChange={(open) => { if (!open && !saving) close(); }}>
    <div className={styles.membersDialog}>
      <SearchInput aria-label={uiCopy["ui"]["Search clients"]} placeholder={uiCopy["ui"]["Search clients"]} value={search} onChange={setSearch} />
      <MutationError error={mutation.error} />
      {group.isPending || (g && clients.isPending) ? <Loading /> : group.isError ? <Failure error={group.error} retry={() => void group.refetch()} /> : clients.isError ? <Failure error={clients.error} retry={() => void clients.refetch()} /> : !all.length ? (
        <EmptyState size="sm" icon={<UsersRound />} title={g?.teamId ? uiCopy["ui"]["No Team clients assigned to you"] : uiCopy["ui"]["No active clients yet"]} description={g?.teamId ? uiCopy["ui"]["Only Team clients assigned to you can join this group."] : uiCopy["ui"]["Invite a client or accept an application first."]} />
      ) : !shown.length ? <p className={styles.none}>{uiCopy["ui"]["No clients match “"]}{search}”.</p> : <ul className={styles.membersList}>{shown.map(row)}</ul>}
      <DialogFooter>
        <Button isDisabled={saving} onPress={close}>{uiCopy["common"]["cancel"]}</Button>
        <Button variant="primary" loading={saving} isDisabled={!dirty} onPress={() => void save()}>{uiCopy["common"]["save"]}</Button>
      </DialogFooter>
    </div>
  </Dialog>;
}

export function GroupEditor({ group, teamId, close }: { group?: Group; teamId?: string; close: () => void }) {
  const uiCopy = useUiCopy();

  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [color, setColor] = useState(group?.color ?? GROUP_COLORS[3]!.value);
  const mutation = useCoachingMutation(close, groupInvalidation);
  return <Dialog isOpen onOpenChange={(open) => { if (!open) close(); }} title={group ? uiCopy["ui"]["Edit group"] : uiCopy["ui"]["New client group"]} description={uiCopy["ui"]["Groups let you message, schedule and send check-ins to several clients at once."]}>
    <form className={styles.form} onSubmit={(e) => { e.preventDefault(); mutation.mutate({ method: group ? "PATCH" : "POST", path: `/api/v1/coaching/groups${group ? `/${group.id}` : ""}`, ifMatch: group?.version, json: { name: name.trim(), description, color, teamId: group ? group.teamId ?? null : teamId ?? null } }); }}>
      <Alert title={(group ? group.teamId : teamId) ? uiCopy["ui"]["Team-owned group"] : uiCopy["ui"]["Personal group"]}>{uiCopy["ui"]["Only clients from the same ownership scope can be added. Scope is fixed when this group is created."]}</Alert>
      <TextField label={uiCopy["video"]["list"]["sort"]["name"]} placeholder={uiCopy["ui"]["e.g. Marathon block"]} value={name} onChange={setName} isRequired maxLength={200} autoFocus />
      <TextArea label={uiCopy["training"]["library"]["createDialog"]["description"]} placeholder={uiCopy["ui"]["Optional, who is in this group and why"]} value={description} onChange={setDescription} maxLength={4000} />
      <ColorSwatches label={uiCopy["ui"]["Colour"]} value={color} onChange={setColor} />
      <MutationError error={mutation.error} />
      <DialogFooter>
        <Button onPress={close}>{uiCopy["common"]["cancel"]}</Button>
        <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!name.trim()}>{group ? uiCopy["common"]["saveChanges"] : uiCopy["ui"]["Create group"]}</Button>
      </DialogFooter>
    </form>
  </Dialog>;
}

export default function ClientsRoute() { return <RequireFeature feature="coaching.clients.view"><Clients /></RequireFeature>; }
