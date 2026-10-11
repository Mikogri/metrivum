import { UsersRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button, Checkbox, Dialog, SearchInput, toast } from "@trainflow/ui-web";
import { Panel } from "~/shared/ui/Panel";
import { useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, ListPagination, Loading, MutationError } from "../components";
import styles from "./client-details.module.css";

export function ClientGroups({ relationship, manage }: { relationship: Relationship; manage: boolean }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const groups = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { relationshipId: relationship.id, teamId: relationship.teamId ?? undefined, page, pageSize: 20, sort: "name" }, manage);
  if (!manage) return null;
  return (
    <Panel title="Groups" icon={<UsersRound />} tone="violet" actions={<Button size="sm" variant="ghost" onPress={() => setOpen(true)}>Manage</Button>}>
      {groups.isPending ? <Loading /> : groups.isError ? <Failure error={groups.error} retry={() => void groups.refetch()} /> : (
        <>
          {groups.data.items.length ? (
            <div className={styles.groups}>
              {groups.data.items.map((group) => (
                <Link key={group.id} className={styles.group} to={`/app/groups/${group.id}`}>
                  <span className={styles.swatch} style={{ background: group.color }} aria-hidden="true" />
                  {group.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Not in any group yet.</p>
          )}
          {Number(groups.data.total) > Number(groups.data.pageSize) ? <ListPagination data={groups.data} onChange={setPage} /> : null}
        </>
      )}
      {open && <ManageClientGroups relationship={relationship} close={() => setOpen(false)} />}
    </Panel>
  );
}
export function ManageClientGroups({ relationship, close }: { relationship: Relationship; close: () => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const groups = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { page, pageSize: 20, search: search || undefined, teamId: relationship.teamId ?? undefined, sort: "name" });
  const mutation = useCoachingMutation(() => toast({ tone: "success", title: "Groups updated" }));
  return <Dialog isOpen title="Manage client groups" onOpenChange={open => { if (!open && !mutation.isPending) close(); }} isDismissable={!mutation.isPending} isKeyboardDismissDisabled={mutation.isPending}><div className={styles.stack}><SearchInput aria-label="Search client groups" placeholder="Search groups" value={search} onChange={value => { setSearch(value); setPage(1); }} /><MutationError error={mutation.error} />{groups.isPending ? <Loading /> : groups.isError ? <Failure error={groups.error} retry={() => void groups.refetch()} /> : <>{groups.data.items.map(group => <Checkbox key={group.id} isSelected={relationship.groupIds.includes(group.id)} isDisabled={mutation.isPending} onChange={selected => mutation.mutate({ method: selected ? "PUT" : "DELETE", path: `/api/v1/coaching/groups/${group.id}/members/${relationship.id}`, ifMatch: group.version })}>{group.name}</Checkbox>)}{!groups.data.items.length && <p>No groups match</p>}<ListPagination data={groups.data} onChange={setPage} /></>}</div></Dialog>;
}
