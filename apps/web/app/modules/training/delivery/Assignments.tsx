import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Link } from "react-router";
import { useState } from "react";
import { Button, Checkbox, Dialog, DialogTrigger, EmptyState, SearchInput, TextField } from "@trainflow/ui-web";
import { useCoachingMutation, useCoachingQuery, type Page, type Relationship, type Group } from "~/modules/coaching";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "~/modules/coaching";
import styles from "./delivery.module.css";

export interface Assignment {
  id: string; relationshipId: string; programId: string; programName: string; status: string;
  startDate: string; timeZone: string; version: number; effectiveRevisionId: string;
  allowedActions: string[]; groupAssignmentId?: string | null;
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
  const save = useCoachingMutation(onAssigned);
  const body = { relationshipIds: relationships, groupIds: groups, startDate, timeZone, revisionId: revision || revisions.data?.items[0]?.id };
  const previewed = preview.isSuccess && JSON.stringify(preview.variables?.json) === JSON.stringify(body);
  const changed = () => setKey(crypto.randomUUID());
  const toggle = (items: string[], id: string, selected: boolean) => selected ? [...items, id] : items.filter(value => value !== id);
  return <div className={styles.stack}>
    <p>Assign a published revision. People selected directly and through groups receive one assignment per request. New group members are not included automatically.</p>
    <p>{teamId ? "Recipients are your assigned Team clients and Team groups. The program remains in your personal library." : "Recipients are your private clients and personal groups."}</p>
    <label className={styles.field}>Published revision<select value={revision || revisions.data?.items[0]?.id || ""} onChange={event => { setRevision(event.target.value); changed(); }}>
      {revisions.data?.items.map(item => <option value={item.id} key={item.id}>Revision {item.number}</option>)}
    </select></label>
    {revisions.isError && <Failure error={revisions.error} />}
    {revisions.data && !revisions.data.items.length && <EmptyState title="Publish this program first" description="Assignments require an immutable published revision." />}
    <div className={styles.toolbar}><label className={styles.field}>Start date<input type="date" value={startDate} onChange={event => { setStartDate(event.target.value); changed(); }} /></label>
      <TextField label="Schedule time zone" value={timeZone} onChange={value => { setTimeZone(value); changed(); }} /></div>
    <SearchInput aria-label="Search clients" value={search} onChange={value => { setSearch(value); setPage(1); }} />
    {clients.isPending ? <Loading /> : clients.isError ? <Failure error={clients.error} /> : <><div className={styles.choices}>{clients.data.items.map(client => <Checkbox key={client.id} isSelected={relationships.includes(client.id)} onChange={selected => { setRelationships(toggle(relationships, client.id, selected)); changed(); }}>{client.client.displayName || client.client.username}</Checkbox>)}</div><ListPagination data={clients.data} onChange={setPage} /></>}
    <h3>Groups</h3><div className={styles.choices}>{groupList.data?.items.filter(group => !group.archived).map(group => <Checkbox key={group.id} isSelected={groups.includes(group.id)} onChange={selected => { setGroups(toggle(groups, group.id, selected)); changed(); }}>{group.name}</Checkbox>)}</div>
    <MutationError error={preview.error ?? save.error} />
    {previewed && <><p role="status">{preview.data?.length ?? 0} unique active clients will receive this program, starting {startDate} ({timeZone}).</p><ul>{preview.data?.map(person => <li key={person.id}>{person.displayName || person.username || "Client"}{person.username ? ` (@${person.username})` : ""}</li>)}</ul></>}
    <div className={styles.toolbar}><Button isDisabled={!body.revisionId || !startDate || !relationships.length && !groups.length || save.isPending} loading={preview.isPending} onPress={() => preview.mutate({ method: "POST", path: `/api/v1/training/programs/${programId}/assignments/preview`, json: body })}>Preview recipients</Button>
      <Button variant="primary" isDisabled={!previewed} loading={save.isPending} onPress={() => save.mutate({ method: "POST", path: `/api/v1/training/programs/${programId}/assignments`, json: body, idempotencyKey: key })}>Assign program</Button></div>
  </div>;
}

export function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function AssignProgramButton({ programId, groupId, relationshipId, teamId }: { programId: string; groupId?: string; relationshipId?: string; teamId?: string | null }) {
  const [open, setOpen] = useState(false);
  return <DialogTrigger isOpen={open} onOpenChange={setOpen}><Button>Assign program</Button><Dialog title="Assign program" size="lg"><AssignForm programId={programId} groupId={groupId} relationshipId={relationshipId} teamId={teamId} onAssigned={() => setOpen(false)} /></Dialog></DialogTrigger>;
}

export function AssignmentList({ programId, relationshipId, groupId, coach = true }: { programId?: string; relationshipId?: string; groupId?: string; coach?: boolean }) {
  const [page, setPage] = useState(1);
  const { mode } = useWorkspace();
  const list = useCoachingQuery<Page<Assignment>>("/api/v1/training/assignments", { programId, relationshipId, groupId, page, pageSize: 20, view: mode });
  const mutate = useCoachingMutation();
  const revisions = useCoachingQuery<Page<Revision>>(`/api/v1/training/programs/${programId}/revisions`, { pageSize: 1 }, coach && !!programId);
  if (list.isPending) return <Loading />;
  if (list.isError) return <Failure error={list.error} retry={() => void list.refetch()} />;
  return <section className={styles.stack}><h2>Assigned programs</h2><MutationError error={mutate.error} />
    {!list.data.items.length ? <EmptyState title="No assigned programs" description="A coach can assign a published program from its details page." /> : list.data.items.map(item => <article className={styles.card} key={item.id}>
      <div className={styles.row}><h3>{coach ? <Link to={`/app/programs/${item.programId}`}>{item.programName}</Link> : item.programName}</h3>{coach && <Link to={`/app/clients/${item.relationshipId}?tab=training`}>Client training</Link>}<StatusBadge status={item.status} /></div><p className={styles.muted}>Starts {item.startDate} · {item.timeZone}{item.groupAssignmentId ? " · Group assignment" : ""}</p>
      {coach && item.allowedActions.includes("status") && <div className={styles.toolbar}>{["Active", "Paused", "Completed", "Cancelled"].filter(status => status !== item.status).map(status => <Button key={status} size="sm" isDisabled={mutate.isPending} onPress={() => mutate.mutate({ method: "PUT", path: `/api/v1/training/assignments/${item.id}/status`, ifMatch: item.version, json: { status } })}>{status === "Active" ? "Resume" : status === "Paused" ? "Pause" : status === "Completed" ? "Complete" : "Cancel / exclude"}</Button>)}
        {item.allowedActions.includes("refresh") && revisions.data?.items[0] && revisions.data.items[0].id !== item.effectiveRevisionId && <Button size="sm" isDisabled={mutate.isPending} onPress={() => mutate.mutate({ method: "POST", path: `/api/v1/training/assignments/${item.id}/refresh`, ifMatch: item.version, json: { revisionId: revisions.data!.items[0]!.id } })}>Use latest revision for future sessions</Button>}</div>}
    </article>)}<ListPagination data={list.data} onChange={setPage} /></section>;
}

export function AssignmentLauncher({ relationshipId, groupId, teamId }: { relationshipId?: string; groupId?: string; teamId?: string | null }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(1);
  const programs = useCoachingQuery<Page<{ id: string; name: string }>>("/api/v1/training/programs", { kind: "Program", search, page, pageSize: 20, archived: false });
  return <section className={styles.card}><h2>Assign a program</h2><SearchInput aria-label="Find a program to assign" value={search} onChange={value => { setSearch(value); setPage(1); }} />
    {programs.isPending ? <Loading /> : programs.isError ? <Failure error={programs.error} /> : <>
      <label className={styles.field}>Program<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select a program</option>{programs.data.items.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
      <ListPagination data={programs.data} onChange={setPage} />
      {selected && <AssignProgramButton key={selected} programId={selected} relationshipId={relationshipId} groupId={groupId} teamId={teamId} />}
    </>}
  </section>;
}
