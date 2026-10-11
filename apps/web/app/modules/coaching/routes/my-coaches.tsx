import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, Button, EmptyState, LinkButton, Option, PageHeader, SearchInput, Select, Toolbar } from "@trainflow/ui-web";
import { useProfile, profileKey } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingMutation, useCoachingQuery, type ClientRelationship, type Page } from "../api";
import { Failure, ListPagination, Loading, MutationError, StatusBadge } from "../components";
import { DataView } from "~/shared/library/DataView";
import { LibraryViewToggle } from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

export default function MyCoaches() {
  const profile = useProfile();
  const account = useAccountKey();
  const cache = useQueryClient();
  const client = profile.roles.includes("Client");
  const [state, update] = useUrlState({ view: "list", q: "", status: "", sort: "updated", page: "1" });
  const filtered = Boolean(state.q || state.status);
  const list = useCoachingQuery<Page<ClientRelationship>>("/api/v1/coaching/my-coaches", { search: state.q || undefined, status: state.status || undefined, sort: state.sort, page: pageFromParam(state.page), pageSize: 20 }, client);
  const activate = useCoachingMutation(async () => { await cache.invalidateQueries({ queryKey: profileKey(account) }); await cache.invalidateQueries({ queryKey: [account, "access"] }); });
  return <><PageHeader title="My coaches" description="Your collaborations and services, all in one place." actions={<LinkButton href="/app/my-invitations">Invitations</LinkButton>} />{client && <Toolbar aria-label="Filter coaches" className={styles.toolbar}>
      <SearchInput aria-label="Search coaches" placeholder="Search by name or username" value={state.q} onChange={(q) => update({ q, page: "1" })} className={styles.search} />
      <Select aria-label="Relationship status" selectedKey={state.status || "all"} onSelectionChange={(key) => update({ status: key === "all" ? "" : String(key), page: "1" })}><Option id="all">All statuses</Option>{["Active", "Suspended", "Completed"].map((s) => <Option key={s} id={s}>{s}</Option>)}</Select>
      <Select aria-label="Sort coaches" selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key), page: "1" })}><Option id="updated">Recently updated</Option><Option id="created">Recently started</Option><Option id="status">Status</Option></Select>
      <span className={styles.spacer} /><LibraryViewToggle value={state.view === "cards" ? "cards" : "list"} onChange={(view) => update({ view })} /></Toolbar>}
    {!client ? <><EmptyState title="Get started as a client" description="Enable your client profile to apply for coaching and receive invitations. Your coach tools stay available." actions={<Button variant="primary" loading={activate.isPending} onPress={() => activate.mutate({ method: "POST", path: "/api/v1/me/roles/client" })}>Enable client profile</Button>} /><MutationError error={activate.error} /></> : list.isPending ? <Loading /> : list.isError ? <Failure error={list.error} retry={() => void list.refetch()} /> : !list.data.items.length ? filtered ? <EmptyState title="No coaches match" description="Try a different name or status." actions={<Button onPress={() => update({ q: "", status: "", page: "1" })}>Clear filters</Button>} /> : <EmptyState title="No coaching relationships yet" description="Apply using a coach's offer link or accept an invitation to begin." actions={<LinkButton href="/app/my-invitations" variant="primary">View invitations</LinkButton>} /> : <>
      <DataView view={state.view === "cards" ? "cards" : "list"} card={(r) => ({ href: `/app/my-coaches/${r.id}/services`, title: r.coach.displayName || r.coach.username, subtitle: r.coach.username ? `@${r.coach.username}` : undefined, icon: <Avatar name={r.coach.displayName || r.coach.username || "Coach"} size="lg" decorative />, tone: "neutral", badge: <StatusBadge status={r.status} />, description: "Services, shared documents and your training with this coach.", actions: <><LinkButton size="sm" variant="ghost" href={`/app/my-coaches/${r.id}/documents`}>Documents</LinkButton><LinkButton size="sm" variant="ghost" href={`/app/my-training?relationshipId=${r.id}`}>Training</LinkButton></> })} label="My coaches" rows={list.data.items} rowKey={(r) => r.id} columns={[
        { id: "coach", header: "Coach", width: "30%", cell: (r) => { const name = r.coach.displayName || r.coach.username || "Coach"; return <span className={styles.person}><Avatar name={name} size="sm" decorative /><span className={styles.personText}><Link data-row-link to={`/app/my-coaches/${r.id}/services`}>{name}</Link>{r.coach.username ? <small>@{r.coach.username}</small> : null}</span></span>; } },
        { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { id: "links", header: <span className="tf-visually-hidden">Shortcuts</span>, align: "end", cell: (r) => <span className={styles.actions}><LinkButton size="sm" variant="ghost" href={`/app/my-coaches/${r.id}/documents`}>Documents</LinkButton><LinkButton size="sm" variant="ghost" href={`/app/my-training?relationshipId=${r.id}`}>Training</LinkButton><LinkButton size="sm" variant="ghost" href={`/app/coaches/${r.coach.id}/offers`}>Offers</LinkButton></span> },
      ]} /><ListPagination data={list.data} onChange={(page) => update({ page: String(page) })} /></>}
  </>;
}
