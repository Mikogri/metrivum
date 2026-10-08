import { useState } from "react";
import { X } from "lucide-react";
import { Avatar, Checkbox, SearchInput } from "@trainflow/ui-web";
import { useCoachingQuery, type Group, type Page, type Relationship } from "./api";
import { Failure } from "./components";
import styles from "./recipients.module.css";

const toggle = (values: string[], id: string, selected: boolean) => (selected ? [...values, id] : values.filter((v) => v !== id));

/**
 * Picks clients and client groups for check-in schedules and calendar events: one search over both,
 * a checkbox list per kind, and the current selection as removable chips above.
 */
export function RecipientPicker({
  relationships,
  groups,
  onChange,
  disabled,
  hint,
}: {
  relationships: string[];
  groups: string[];
  onChange: (value: { relationships: string[]; groups: string[] }) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [search, setSearch] = useState("");
  const clients = useCoachingQuery<Page<Relationship>>("/api/v1/coaching/clients", { pageSize: 100, status: "Active", search: search || undefined });
  const groupList = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { pageSize: 100, search: search || undefined });
  const clientName = (id: string) => {
    const r = clients.data?.items.find((x) => x.id === id);
    return r ? r.client.displayName || r.client.username || "Client" : "Client";
  };
  const groupOf = (id: string) => groupList.data?.items.find((g) => g.id === id);
  const count = relationships.length + groups.length;
  const tooMany = (clients.data?.total ?? 0) > 100 || (groupList.data?.total ?? 0) > 100;

  return (
    <div className={styles.picker}>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {count > 0 ? (
        <ul className={styles.chips} aria-label="Selected recipients">
          {groups.map((id) => (
            <li key={id} className={styles.chip}>
              <span className={styles.swatch} style={{ background: groupOf(id)?.color }} aria-hidden="true" />
              {groupOf(id)?.name ?? "Group"}
              <button type="button" aria-label={`Remove ${groupOf(id)?.name ?? "group"}`} disabled={disabled} onClick={() => onChange({ relationships, groups: groups.filter((g) => g !== id) })}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
          {relationships.map((id) => (
            <li key={id} className={styles.chip}>
              {clientName(id)}
              <button type="button" aria-label={`Remove ${clientName(id)}`} disabled={disabled} onClick={() => onChange({ relationships: relationships.filter((r) => r !== id), groups })}>
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <SearchInput aria-label="Search clients and groups" placeholder="Search clients and groups" value={search} onChange={setSearch} />
      <div className={styles.list}>
        <p className={styles.section}>Groups</p>
        {groupList.isError ? (
          <Failure error={groupList.error} retry={() => void groupList.refetch()} />
        ) : groupList.data && !groupList.data.items.length ? (
          <p className={styles.none}>No groups found.</p>
        ) : (
          groupList.data?.items.map((g) => (
            <Checkbox key={g.id} className={styles.option} isDisabled={disabled} isSelected={groups.includes(g.id)} onChange={(s) => onChange({ relationships, groups: toggle(groups, g.id, s) })}>
              <span className={styles.optionBody}>
                <span className={styles.swatch} style={{ background: g.color }} aria-hidden="true" />
                <span className={styles.name}>{g.name}</span>
              </span>
            </Checkbox>
          ))
        )}
        <p className={styles.section}>Clients</p>
        {clients.isError ? (
          <Failure error={clients.error} retry={() => void clients.refetch()} />
        ) : clients.data && !clients.data.items.length ? (
          <p className={styles.none}>No active clients found.</p>
        ) : (
          clients.data?.items.map((r) => (
            <Checkbox key={r.id} className={styles.option} isDisabled={disabled} isSelected={relationships.includes(r.id)} onChange={(s) => onChange({ relationships: toggle(relationships, r.id, s), groups })}>
              <span className={styles.optionBody}>
                <Avatar name={r.client.displayName || r.client.username || "?"} size="sm" decorative className={styles.avatar} />
                <span className={styles.name}>{r.client.displayName || r.client.username}</span>
                {r.client.username ? <span className={styles.meta}>@{r.client.username}</span> : null}
              </span>
            </Checkbox>
          ))
        )}
      </div>
      {tooMany ? <p className={styles.hint}>Narrow your search to find more recipients.</p> : null}
    </div>
  );
}
