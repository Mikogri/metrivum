import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import { useState } from "react";
import { Dumbbell, MoreHorizontal, Plus, UserPlus } from "lucide-react";
import { Alert, Avatar, Button, Checkbox, DataTable, Dialog, DialogFooter, DialogTrigger, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, IconButton, LinkButton, Option, SearchInput, Select, TextField, toast, useMobileLayout } from "@trainflow/ui-web";
import { Panel } from "~/shared/ui/Panel";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useCoachingMutation, useCoachingQuery, type Page, type Relationship, type Group } from "~/modules/coaching";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "~/modules/coaching";
import styles from "./delivery.module.css";

export interface Assignment {
  id: string; relationshipId: string; programId: string; programName: string; status: string;
  startDate: string; timeZone: string; version: number; effectiveRevisionId: string;
  allowedActions: string[]; groupAssignmentId?: string | null;
  clientId?: string | null; clientDisplayName?: string | null; clientUsername?: string | null;
}
interface Revision { id: string; number: number }

function AssignForm({ programId, groupId, relationshipId, teamId, onAssigned }: { programId: string; groupId?: string; relationshipId?: string; teamId?: string | null; onAssigned: () => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [relationships, setRelationships] = useState<string[]>(relationshipId ? [relationshipId] : []);
  const [groups, setGroups] = useState<string[]>(groupId ? [groupId] : []);
  const [startDate, setStartDate] = useState(localDate());
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [revision, setRevision] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { teamId: teamId ?? undefined, status: "Active", search, page, pageSize: 20 });
  const groupList = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { teamId: teamId ?? undefined, pageSize: 100 });
  const revisions = useCoachingQuery<Page<Revision>>(`/api/v1/training/programs/${programId}/revisions`, { pageSize: 100 });
  const preview = useCoachingMutation<Array<{ id: string; clientId: string; displayName: string; username: string | null }>>(undefined, { invalidate: false });
  const save = useCoachingMutation(() => {
    // Assigning always confirms itself.
    toast({ tone: "success", title: "Program assigned", description: preview.data?.length ? `${preview.data.length} ${preview.data.length === 1 ? "client gets" : "clients get"} it from ${startDate}.` : undefined });
    onAssigned();
  });
  const plan = useCoachingQuery<{ version: number }>(`/api/v1/training/programs/${programId}`);
  const apply = useCoachingMutation();
  const body = { relationshipIds: relationships, groupIds: groups, startDate, timeZone, revisionId: revision || revisions.data?.items[0]?.id };
  const previewed = preview.isSuccess && JSON.stringify(preview.variables?.json) === JSON.stringify(body);
  const changed = () => setKey(crypto.randomUUID());
  const toggle = (items: string[], id: string, selected: boolean) => selected ? [...items, id] : items.filter(value => value !== id);
  const noRecipients = !search && clients.data?.items.length === 0 && groupList.data && !groupList.data.items.some(group => !group.archived);
  const nothingChosen = !relationships.length && !groups.length;
  return <div className={styles.stack}>
    {noRecipients ? <Alert tone="info" title={teamId ? "No Team clients to assign to" : "No clients to assign to yet"} actions={teamId ? undefined : <LinkButton href="/app/clients" size="sm">Open clients</LinkButton>}>{teamId ? "Programs go to the Team clients assigned to you. Ask the Team owner to assign clients to you." : "Programs go to active clients. Invite a client or accept an application, then assign the program."}</Alert> : null}
    <p className={styles.hint}>{teamId ? "Recipients are your assigned Team clients and Team groups. The program stays in your personal library." : "Recipients are your private clients and personal groups."} New group members are not included automatically.</p>
    {revisions.isError && <Failure error={revisions.error} />}
    {revisions.data && !revisions.data.items.length ? <div className={styles.applyFirst}><EmptyState title="Apply changes before assigning" description="Create the first applied version, then choose clients." /><Button loading={apply.isPending} isDisabled={!plan.data} onPress={() => apply.mutate({ method: "POST", path: `/api/v1/training/programs/${programId}/apply`, ifMatch: plan.data!.version, idempotencyKey: key })}>Apply changes</Button><MutationError error={apply.error} /></div> : <div className={styles.formRow}>
      <Select label="Applied version" selectedKey={revision || revisions.data?.items[0]?.id || null} onSelectionChange={key => { setRevision(String(key)); changed(); }}>
        {(revisions.data?.items.slice(0, 1) ?? []).map(item => <Option key={item.id} id={item.id}>{`Revision ${item.number}`}</Option>)}
      </Select>
      <TextField label="Start date" type="date" value={startDate} onChange={value => { setStartDate(value); changed(); }} />
      <TextField label="Schedule time zone" placeholder="e.g. Europe/Warsaw" value={timeZone} onChange={value => { setTimeZone(value); changed(); }} />
    </div>}
    <section className={styles.pickSection} aria-label="Clients">
      <header><h3>Clients</h3><span className={styles.pickCount} data-active={relationships.length > 0 || undefined}>{relationships.length ? `${relationships.length} selected` : "None selected"}</span></header>
      <SearchInput aria-label="Search clients" placeholder="Search by name or username" value={search} onChange={value => { setSearch(value); setPage(1); }} />
      {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} /> : !clients.data.items.length ? (
        <p className={styles.pickEmpty}>{search ? `No active clients match “${search}”.` : teamId ? "No assigned Team clients yet." : "No active clients yet. Invite a client or accept an application first."}</p>
      ) : <>
        <div className={styles.pickList}>{clients.data.items.map(client => {
          const name = client.client.displayName || client.client.username || "Client";
          return <Checkbox key={client.id} className={styles.pickRow} isSelected={relationships.includes(client.id)} onChange={selected => { setRelationships(toggle(relationships, client.id, selected)); changed(); }}>
            <span className={styles.pickPerson}><Avatar name={name} size="md" decorative /><span className={styles.pickText}><strong>{name}</strong>{client.client.username ? <small>@{client.client.username}</small> : null}</span></span>
          </Checkbox>;
        })}</div>
        {Number(clients.data.total) > Number(clients.data.pageSize) ? <ListPagination data={clients.data} onChange={setPage} /> : null}
      </>}
    </section>
    <section className={styles.pickSection} aria-label="Groups">
      <header><h3>Groups</h3><span className={styles.pickCount} data-active={groups.length > 0 || undefined}>{groups.length ? `${groups.length} selected` : "None selected"}</span></header>
      {groupList.isPending ? <Loading /> : (() => {
        const active = groupList.data?.items.filter(group => !group.archived) ?? [];
        return !active.length ? <p className={styles.pickEmpty}>No groups yet. Groups let you assign one program to several clients at once.</p> : <div className={styles.pickList}>{active.map(group => <Checkbox key={group.id} className={styles.pickRow} isSelected={groups.includes(group.id)} onChange={selected => { setGroups(toggle(groups, group.id, selected)); changed(); }}>
          <span className={styles.pickPerson}><span className={styles.pickSwatch} style={{ background: group.color ?? "var(--tf-color-border-strong)" }} aria-hidden="true" /><span className={styles.pickText}><strong>{group.name}</strong>{group.description ? <small>{group.description}</small> : null}</span></span>
        </Checkbox>)}</div>;
      })()}
    </section>
    <MutationError error={preview.error ?? save.error} />
    {previewed && (preview.data?.length ? <Alert tone="info" title={`${preview.data.length} ${preview.data.length === 1 ? "client" : "unique active clients"} will receive this program, starting ${startDate} (${timeZone}).`}>{preview.data.map(person => person.displayName || person.username || "Client").join(", ")}</Alert> : <Alert tone="warning" title="Nobody would receive this program">The selected groups have no active clients. Choose clients directly or add members to the group.</Alert>)}
    {!previewed && nothingChosen && !noRecipients ? <p className={styles.hint}>Choose at least one client or group, then continue to see who receives the program.</p> : null}
    {/* One action: Continue shows who receives the program; once that's shown, the same button assigns it. */}
    <DialogFooter>{previewed
      ? <Button variant="primary" isDisabled={!preview.data?.length} loading={save.isPending} onPress={() => save.mutate({ method: "POST", path: `/api/v1/training/programs/${programId}/assignments`, json: body, idempotencyKey: key })}>Assign program</Button>
      : <Button variant="primary" isDisabled={!body.revisionId || !startDate || !relationships.length && !groups.length || save.isPending} loading={preview.isPending} onPress={() => preview.mutate({ method: "POST", path: `/api/v1/training/programs/${programId}/assignments/preview`, json: body })}>Continue</Button>}
    </DialogFooter>
  </div>;
}

export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
/** `assigned`: how many clients have the program, shown in brackets after the label when known. */
export function AssignProgramButton({ programId, groupId, relationshipId, teamId, size, assigned }: { programId: string; groupId?: string; relationshipId?: string; teamId?: string | null; size?: "sm" | "md"; assigned?: number }) {
  const [open, setOpen] = useState(false);
  return <DialogTrigger isOpen={open} onOpenChange={setOpen}><Button size={size} iconStart={<UserPlus />}>{assigned === undefined ? "Assign program" : `Assign program (${assigned})`}</Button><Dialog title="Assign program" size="lg"><AssignForm programId={programId} groupId={groupId} relationshipId={relationshipId} teamId={teamId} onAssigned={() => setOpen(false)} /></Dialog></DialogTrigger>;
}

export function AssignmentList({ programId, relationshipId, groupId, coach = true, assign, title = "Assigned programs", description }: { programId?: string; relationshipId?: string; groupId?: string; coach?: boolean; assign?: { relationshipId?: string; groupId?: string; teamId?: string | null }; title?: string; description?: string }) {
  const mobile = useMobileLayout();
  const [page, setPage] = useState(1);
  const { mode } = useWorkspace();
  const list = useCoachingQuery<Page<Assignment>>("/api/v1/training/assignments", { programId, relationshipId, groupId, page, pageSize: 20, view: mode });
  const mutate = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const onAction = async (item: Assignment, key: React.Key) => {
    if ((key === "Cancelled" || key === "Completed") && !(await ask(key === "Cancelled" ? { title: `Cancel ${item.programName}?`, body: "Upcoming workouts are removed for this client. Logged training stays in the history.", confirmLabel: "Cancel assignment", cancelLabel: "Keep assignment" } : { title: `Complete ${item.programName}?`, body: "Future workouts from this assignment stop. Logged training stays in the history.", confirmLabel: "Complete assignment", cancelLabel: "Keep assignment" }))) return;
    mutate.mutate({ method: "PUT", path: `/api/v1/training/assignments/${item.id}/status`, ifMatch: item.version, json: { status: String(key) } });
  };
  const STATUS_LABEL: Record<string, string> = { Active: "Resume", Paused: "Pause", Completed: "Complete", Cancelled: "Cancel / exclude" };
  return (
    <Panel title={title} description={description} flush actions={assign ? <AssignProgramPicker {...assign} /> : undefined}>
      <MutationError error={mutate.error} />
      {confirmDialog}
      {list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? (
        <p className={styles.panelEmpty}>{coach ? "No assigned programs yet." : "Your coach has not assigned a program yet."}</p>
      ) : (
        <>
          {mobile && !coach ? <ul className={styles.rows}>{list.data.items.map(item => <li key={item.id}><Link className={styles.workoutRow} to={`/app/my-training?tab=history&relationshipId=${item.relationshipId}&programId=${item.programId}`}><span className={styles.itemMain}><strong>{item.programName}</strong><span className={styles.itemMeta}>Starts {item.startDate} · {item.timeZone}</span></span><StatusBadge status={item.status} /></Link></li>)}</ul> : <DataTable label="Assigned programs" rows={list.data.items} rowKey={(item) => item.id} columns={[
            { id: "program", header: "Program", width: "34%", cell: (item) => coach ? <Link data-row-link to={`/app/programs/${item.programId}`}>{item.programName}</Link> : <Link data-row-link to={`/app/my-training?relationshipId=${item.relationshipId}`}>{item.programName}</Link> },
            { id: "start", header: "Starts", cell: (item) => item.startDate },
            { id: "source", header: "Source", hideOnMobile: true, muted: true, cell: (item) => (item.groupAssignmentId ? "Group assignment" : "Direct") },
            ...(coach && !relationshipId ? [{ id: "client", header: "Client", hideOnMobile: true, cell: (item: Assignment) => <Link to={`/app/clients/${item.relationshipId}?tab=activity`}>Training log</Link> }] : []),
            { id: "status", header: "Status", cell: (item) => <StatusBadge status={item.status} /> },
            {
              id: "actions",
              header: <span className="tf-visually-hidden">Actions</span>,
              width: "3.5rem",
              align: "end",
              cell: (item) => {
                if (!coach || !item.allowedActions.includes("status")) return null;
                const next = ["Active", "Paused", "Completed"].filter((status) => status !== item.status);
                return (
                  <DropdownMenuTrigger>
                    <IconButton size="sm" label={`Manage ${item.programName}`} icon={<MoreHorizontal />} isDisabled={mutate.isPending} />
                    <DropdownMenu aria-label={`Manage ${item.programName}`} onAction={(key) => void onAction(item, key)}>
                      {next.map((status) => <DropdownMenuItem key={status} id={status}>{STATUS_LABEL[status]}</DropdownMenuItem>)}
                      {item.status !== "Cancelled" ? <DropdownMenuSeparator /> : null}
                      {item.status !== "Cancelled" ? <DropdownMenuItem id="Cancelled" tone="danger">{STATUS_LABEL.Cancelled}</DropdownMenuItem> : null}
                    </DropdownMenu>
                  </DropdownMenuTrigger>
                );
              },
            },
          ]} />}
          {Number(list.data.total) > Number(list.data.pageSize) ? <ListPagination data={list.data} onChange={setPage} /> : null}
        </>
      )}
    </Panel>
  );
}

export function AssignedProgramsSummary({ relationshipId, teamId, canManage = false }: { relationshipId: string; teamId?: string | null; canManage?: boolean }) {
  const query = useCoachingQuery<Array<{ assignment: Assignment; endDate: string | null; scheduled: number; completed: number }>>("/api/v1/training/assignment-summary", { relationshipId });
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  return (
    <Panel title="Assigned programs" icon={<Dumbbell />} tone="green" flush actions={canManage ? <AssignProgramPicker relationshipId={relationshipId} teamId={teamId} /> : undefined}>
      <MutationError error={mutation.error} />
      {confirmDialog}
      {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.length ? (
        <p className={styles.panelEmpty}>No assigned programs. Assign a applied program to plan this client’s workouts.</p>
      ) : (
        <ul className={styles.rows}>
          {query.data.map(({ assignment: a, endDate, scheduled, completed }) => (
            <li key={a.id} className={styles.itemRow}>
              <div className={styles.itemMain}>
                <Link to={`/app/programs/${a.programId}`} className={styles.itemTitle}>{a.programName}</Link>
                <span className={styles.itemMeta}>{a.startDate} – {endDate || "open end"}{a.groupAssignmentId ? " · Group assignment" : ""}</span>
                <span className={styles.itemProgress}>
                  <span className={styles.bar} role="meter" aria-valuemin={0} aria-valuemax={Math.max(1, scheduled)} aria-valuenow={completed} aria-label={`${completed} of ${scheduled} workouts completed`}><span style={{ width: `${Math.min(100, (completed / Math.max(1, scheduled)) * 100)}%` }} /></span>
                  {completed}/{scheduled}
                </span>
              </div>
              <div className={styles.itemSide}>
                <StatusBadge status={a.status} />
                {canManage && a.allowedActions.includes("status") && a.status !== "Completed" ? (
                  <Button size="sm" variant="danger-ghost" isDisabled={mutation.isPending} onPress={async () => { if (await ask({ title: `End ${a.programName}?`, body: "Future workouts from this assignment stop. Logged training stays in the history.", confirmLabel: "End assignment", cancelLabel: "Keep assignment" })) mutation.mutate({ method: "PUT", path: `/api/v1/training/assignments/${a.id}/status`, ifMatch: a.version, json: { status: "Completed" } }); }}>End</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** "Assign" in a panel header: pick a program, then the regular assignment form. */
export function AssignProgramPicker({ relationshipId, groupId, teamId }: { relationshipId?: string; groupId?: string; teamId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const programs = useCoachingQuery<Page<{ id: string; name: string }>>("/api/v1/training/programs", { kind: "Program", page: 1, pageSize: 100, archived: false }, open);
  return (
    <DialogTrigger isOpen={open} onOpenChange={(next) => { setOpen(next); if (!next) setSelected(""); }}>
      <Button size="sm" variant="ghost" iconStart={<Plus />}>Assign</Button>
      <Dialog title="Assign program" size="lg">
        <div className={styles.stack}>
          {programs.isPending ? <Loading /> : programs.isError ? <Failure error={programs.error} retry={() => void programs.refetch()} /> : !programs.data.items.length ? (
            <Alert tone="info" title="You have no programs yet" actions={<LinkButton href="/app/programs" size="sm">Open programs</LinkButton>}>Create a program and apply its changes once, then assign it here.</Alert>
          ) : (
            <Select label="Program" placeholder="Select a program" selectedKey={selected || null} onSelectionChange={(key) => setSelected(String(key))}>
              {programs.data.items.map((program) => <Option key={program.id} id={program.id}>{program.name}</Option>)}
            </Select>
          )}
          {selected ? <AssignForm key={selected} programId={selected} relationshipId={relationshipId} groupId={groupId} teamId={teamId} onAssigned={() => setOpen(false)} /> : null}
        </div>
      </Dialog>
    </DialogTrigger>
  );
}
