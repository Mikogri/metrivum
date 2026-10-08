import { ArrowRight, CalendarDays, ClipboardCheck, CreditCard, Phone, Tags, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { AlertDialog, Button, Card, Checkbox, PageHeader, SearchInput, Segment, SegmentedControl, TextArea } from "@trainflow/ui-web";
import { RelationshipDocumentation } from "~/modules/client-documentation";
import { RelationshipTraining, TrainingProgress } from "~/modules/training";
import { RequireFeature, useFeatureAccess } from "~/shared/access";
import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useCoachingMutation, useCoachingQuery, type Group, type Page, type Relationship } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import styles from "./relationship.module.css";

const ACTION_LABEL: Record<string, string> = { resume: "Resume coaching", suspend: "Suspend coaching", complete: "Complete relationship" };

function RelationshipDetail() {
  const { relationshipId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const detail = useCoachingQuery<Relationship>(`/api/v1/coaching/clients/${relationshipId}`);
  const canGroups = useFeatureAccess("coaching.groups.manage");
  const [search, setSearch] = useState("");
  const groups = useCoachingQuery<Page<Group>>("/api/v1/coaching/groups", { pageSize: 100, sort: "name", search: search || undefined, teamId: detail.data?.teamId ?? undefined }, canGroups.allowed && detail.isSuccess);
  const mutate = useCoachingMutation(() => setAction(null));
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (detail.isPending) return <Loading />;
  if (detail.isError) return <Failure error={detail.error} retry={() => void detail.refetch()} />;
  const r = detail.data;
  const name = r.client.displayName || r.client.username || "Client";
  const started = new Date(r.startedAt);
  const days = Math.max(0, Math.floor((Date.now() - started.getTime()) / 86_400_000));
  return <>
    <PageHeader
      title={<span className={styles.title}><span className={styles.avatar} aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>{name}</span>}
      description={r.client.username ? `@${r.client.username}` : undefined}
      meta={<StatusBadge status={r.status} />}
      actions={r.allowedActions.map((a) => <Button key={a} variant={a === "resume" ? "primary" : "secondary"} onPress={() => { setReason(""); setAction(a); }}>{ACTION_LABEL[a] ?? a}</Button>)}
    />
    <HubNavigation />
    <dl className={styles.facts}>
      <div><dt><CalendarDays aria-hidden="true" />Coaching since</dt><dd>{started.toLocaleDateString()}<small>{days} days</small></dd></div>
      <div><dt><UsersRound aria-hidden="true" />Groups</dt><dd>{r.groupIds.length}<small>{r.teamId ? "Team case" : "Private client"}</small></dd></div>
      <div><dt><Phone aria-hidden="true" />Phone</dt><dd>{r.clientPhone ? <a href={`tel:${r.clientPhone}`}>{r.clientPhone}</a> : <span className={styles.muted}>Not shared</span>}</dd></div>
      <div><dt><Tags aria-hidden="true" />Status changes</dt><dd>{r.statusHistory.length}<small>{r.statusHistory[0] ? `last ${new Date(r.statusHistory[r.statusHistory.length - 1]!.occurredAt).toLocaleDateString()}` : "none yet"}</small></dd></div>
    </dl>
    <SegmentedControl aria-label="Client views" selectedKeys={[tab]} onSelectionChange={(keys) => setParams({ tab: String([...keys][0] || "overview") })} className={styles.views}><Segment id="overview">Overview</Segment><Segment id="training">Training</Segment><Segment id="progress">Progress</Segment><Segment id="documentation">Documentation</Segment></SegmentedControl>
    {tab === "training" ? <RelationshipTraining relationshipId={r.id} teamId={r.teamId} /> : tab === "progress" ? <TrainingProgress relationshipId={r.id} coach /> : tab === "documentation" ? <RelationshipDocumentation relationshipId={r.id} /> : <div className={styles.overview}>
      <MutationError error={mutate.error} />
      <div className={styles.main}>
        <ul className={styles.links}>
          <li><Link to={`/app/clients/${r.id}/services`} className={styles.link}><span className={styles.linkIcon} data-tone="green" aria-hidden="true"><CreditCard /></span><span className={styles.linkText}><strong>Services and billing</strong><span>What this client buys and what is due</span></span><ArrowRight aria-hidden="true" /></Link></li>
          <li><Link to={`/app/check-ins?relationshipId=${r.id}`} className={styles.link}><span className={styles.linkIcon} data-tone="violet" aria-hidden="true"><ClipboardCheck /></span><span className={styles.linkText}><strong>Client check-ins</strong><span>Requests, answers and your reviews</span></span><ArrowRight aria-hidden="true" /></Link></li>
        </ul>
        <Card as="section" padding="none" aria-labelledby="history-title">
          <header className={styles.cardHead}><h2 id="history-title">Status history</h2></header>
          {r.statusHistory.length ? <ol className={styles.timeline}>{[...r.statusHistory].reverse().map((h) => <li key={h.version}>
            <span className={styles.dot} aria-hidden="true" />
            <div className={styles.timelineBody}>
              <p><StatusBadge status={h.previousStatus} /> <ArrowRight aria-hidden="true" className={styles.arrow} /> <StatusBadge status={h.newStatus} /></p>
              <time className={styles.muted}>{new Date(h.occurredAt).toLocaleString()}</time>
              {h.internalReason && <p className={styles.reason}>{h.internalReason}</p>}
            </div>
          </li>)}</ol> : <p className={styles.empty}>No status changes yet.</p>}
        </Card>
      </div>
      {canGroups.allowed && <Card as="section" padding="none" aria-labelledby="groups-title" className={styles.side}>
        <header className={styles.cardHead}><div><h2 id="groups-title">Groups</h2><p className={styles.muted}>A client can belong to more than one group.</p></div></header>
        <div className={styles.cardBody}>
          <SearchInput aria-label="Search client groups" placeholder="Search groups" value={search} onChange={setSearch} />
          {groups.isError ? <Failure error={groups.error} retry={() => void groups.refetch()} /> : groups.isPending ? <Loading /> : groups.data.items.length ? <div className={styles.groupList}>{groups.data.items.map((g) => <Checkbox key={g.id} isSelected={r.groupIds.includes(g.id)} isDisabled={mutate.isPending} onChange={(selected) => mutate.mutate({ method: selected ? "PUT" : "DELETE", path: `/api/v1/coaching/groups/${g.id}/members/${r.id}`, ifMatch: g.version })}>{g.name}</Checkbox>)}</div> : <p className={styles.muted}>No groups match.</p>}
          <Link to={r.teamId ? "/app/groups?scope=team" : "/app/groups"} className={styles.more}>Manage groups in this scope <ArrowRight aria-hidden="true" /></Link>
        </div>
      </Card>}
    </div>}
    <AlertDialog isOpen={action !== null} onOpenChange={(open) => { if (!open) setAction(null); }} title={action === "resume" ? "Resume this relationship?" : action === "suspend" ? "Suspend this relationship?" : "Complete this relationship?"} confirmLabel="Confirm" cancelLabel="Keep current status" isConfirming={mutate.isPending}
      onConfirm={() => mutate.mutate({ method: "POST", path: `/api/v1/coaching/relationships/${r.id}/${action}`, ifMatch: r.version, json: { internalReason: reason || null } })}>
      <TextArea label="Internal reason (visible only to you)" placeholder="Optional, why the status changes" value={reason} onChange={setReason} maxLength={1000} /><MutationError error={mutate.error} />
    </AlertDialog>
  </>;
}
export default function RelationshipRoute() { return <RequireFeature feature="coaching.clients.view"><RelationshipDetail /></RequireFeature>; }
