import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Client details — Metrivum");

import { ArrowRight, CheckCircle2, Handshake, MoreHorizontal, PauseCircle, PlayCircle, Repeat2, UsersRound } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, AlertDialog, Avatar, Badge, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, PageHeader, Tab, TabList, Tabs, TextArea, toast, useMobileLayout } from "@metrivum/ui-web";
import { BodyMeasurements, RelationshipDocumentation } from "~/modules/client-documentation";
import { AssignedProgramsSummary, AssignmentList, TrainingActivity, TrainingProgress } from "~/modules/training";
import { OpenConversationButton } from "~/modules/messaging";
import { RequireFeature, useFeatureAccess } from "~/shared/access";
import { Facts, Panel, PanelGrid } from "~/shared/ui/Panel";
import { useCoachingMutation, useCoachingQuery, type Relationship } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import { ClientProfile } from "../client-details/profile";
import { CheckInSummary, ClientCheckIns } from "../client-details/check-ins";
import { ClientServices, ClientPaymentSummary, PaymentHistoryDrawer } from "../client-details/services";
import { ClientGroups, ManageClientGroups } from "../client-details/groups";
import { ClientTeamDialog, useClientTeamActions } from "../client-details/team-actions";
import { useClientDetailsUrl } from "../client-details/url";
import styles from "./relationship.module.css";

const ACTION_LABEL: Record<string, string> = { resume: "Resume coaching", suspend: "Suspend coaching", complete: "Complete relationship" };
const ACTION_ICON: Record<string, React.ReactNode> = { resume: <PlayCircle />, suspend: <PauseCircle />, complete: <CheckCircle2 /> };
/** Actions that end or pause the collaboration read as destructive. */
const DANGER = new Set(["suspend", "complete"]);
const TABS = ["overview", "plans", "activity", "progress", "profile", "documentation", "check-ins"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { overview: "Overview", plans: "Plans", activity: "Activity", progress: "Progress", profile: "Profile", documentation: "Documentation", "check-ins": "Check-ins" };

function RelationshipDetail({ relationshipId }: { relationshipId: string }) {
  const mobile = useMobileLayout();
  const { params, update } = useClientDetailsUrl();
  const requestedTab = params.get("tab") === "training" ? "activity" : params.get("tab");
  const tab = TABS.find((value) => value === requestedTab) ?? "overview";
  const detail = useCoachingQuery<Relationship>(`/api/v1/coaching/clients/${relationshipId}`);
  const teamActions = useClientTeamActions(detail.data);
  const [teamOpen, setTeamOpen] = useState(false);
  const canGroups = useFeatureAccess("coaching.groups.manage");
  const canTraining = useFeatureAccess("training.assignments.manage");
  const [action, setAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [groups, setGroups] = useState(false);
  const mutate = useCoachingMutation(() => {
    setAction(null);
    toast({ tone: "success", title: "Collaboration updated" });
  });
  if (detail.isPending) return <Loading />;
  if (detail.isError) return <Failure error={detail.error} retry={() => void detail.refetch()} />;
  const r = detail.data;
  const name = r.client.displayName || r.client.username || "Client";
  const safe = r.allowedActions.filter((a) => !DANGER.has(a));
  const risky = r.allowedActions.filter((a) => DANGER.has(a));
  const hasTeamAction = teamActions.canTransfer || teamActions.canAssign;
  const hasMenu = r.allowedActions.length > 0 || canGroups.allowed || hasTeamAction;
  const onMenu = (key: React.Key) => {
    if (key === "groups") setGroups(true);
    else if (key === "team") setTeamOpen(true);
    else {
      setReason("");
      setAction(String(key));
    }
  };

  return (
    <>
      <PageHeader
        title={
          <span className={styles.title}>
            <Avatar name={name} size="lg" decorative />
            <span className={styles.identity}>
              <span className={styles.nameLine}>
                <span className={styles.name}>{name}</span>
                <Badge size="sm" tone={r.teamId ? "violet" : "neutral"}>{r.teamId ? "Team" : "Private"}</Badge>
              </span>
              {r.client.username ? <small>@{r.client.username}</small> : null}
            </span>
          </span>
        }
        meta={
          r.teamId && (r.teamName || r.assignedCoach) ? (
            <span className={styles.teamMeta}>
              {r.teamName}
              {r.assignedCoach ? <> · Coach {r.assignedCoach.displayName}</> : null}
            </span>
          ) : undefined
        }
        actions={
          <>
            <OpenConversationButton person={r.client} />
            {hasMenu ? (
              <DropdownMenuTrigger>
                <IconButton label="Manage collaboration" icon={<MoreHorizontal />} variant="ghost" />
                <DropdownMenu aria-label="Manage collaboration" onAction={onMenu}>
                  {canGroups.allowed ? <DropdownMenuItem id="groups" icon={<UsersRound />}>Manage groups</DropdownMenuItem> : null}
                  {hasTeamAction ? (
                    <DropdownMenuItem id="team" icon={<Repeat2 />}>{teamActions.canAssign ? "Assign Team coach" : "Request transfer to Team"}</DropdownMenuItem>
                  ) : null}
                  {safe.map((a) => (
                    <DropdownMenuItem key={a} id={a} icon={ACTION_ICON[a]}>{ACTION_LABEL[a] ?? a}</DropdownMenuItem>
                  ))}
                  {risky.length && (canGroups.allowed || hasTeamAction || safe.length) ? <DropdownMenuSeparator /> : null}
                  {risky.map((a) => (
                    <DropdownMenuItem key={a} id={a} tone="danger" icon={ACTION_ICON[a]}>{ACTION_LABEL[a] ?? a}</DropdownMenuItem>
                  ))}
                </DropdownMenu>
              </DropdownMenuTrigger>
            ) : null}
          </>
        }
      />
      {mobile && <div className={styles.mobileStatus}><StatusBadge status={r.status} /><span>Since {new Date(r.startedAt).toLocaleDateString()}</span></div>}
      <Tabs selectedKey={tab} onSelectionChange={(key) => update({ tab: String(key), checkIn: null, application: null, drawer: null })} className={styles.views}>
        <TabList aria-label="Client views">
          {TABS.map((value) => (
            <Tab key={value} id={value}>{TAB_LABEL[value]}</Tab>
          ))}
        </TabList>
      </Tabs>
      {tab === "plans" ? (
        // The client's plans: what runs now (with progress and Assign), then every assignment so far.
        <div className={styles.stack}>
          <AssignedProgramsSummary relationshipId={r.id} teamId={r.teamId} canManage={canTraining.allowed && r.status === "Active"} />
          <AssignmentList relationshipId={r.id} title="Plan history" description="Every program assigned to this client, newest first, with its status." />
        </div>
      ) : tab === "activity" ? (
        <TrainingActivity relationshipId={r.id} />
      ) : tab === "progress" ? (
        <div className={styles.stack}>
          {!mobile && <BodyMeasurements relationshipId={r.id} />}
          <TrainingProgress relationshipId={r.id} coach />
          {mobile && <BodyMeasurements relationshipId={r.id} />}
        </div>
      ) : tab === "documentation" ? (
        <RelationshipDocumentation relationshipId={r.id} />
      ) : tab === "profile" ? (
        <ClientProfile relationship={r} />
      ) : tab === "check-ins" ? (
        <ClientCheckIns relationshipId={r.id} active={r.status === "Active"} />
      ) : (
        <PanelGrid equal={!mobile}>
          {!mobile && <Collaboration relationship={r} />}
          <AssignedProgramsSummary relationshipId={r.id} teamId={r.teamId} canManage={canTraining.allowed && r.status === "Active"} />
          <ClientServices relationshipId={r.id} />
          <CheckInSummary relationshipId={r.id} compact />
          <ClientGroups relationship={r} manage={canGroups.allowed} />
          <ClientPaymentSummary relationshipId={r.id} />
          {mobile && <Collaboration relationship={r} />}
        </PanelGrid>
      )}
      {params.get("drawer") === "payments" && <PaymentHistoryDrawer relationshipId={r.id} />}
      {teamOpen && <ClientTeamDialog relationship={r} teams={teamActions.teams} client={teamActions.canAssign ? teamActions.client : undefined} close={() => setTeamOpen(false)} />}
      {groups && <ManageClientGroups relationship={r} close={() => setGroups(false)} />}
      <AlertDialog
        isOpen={action !== null}
        onOpenChange={(open) => {
          if (!open && !mutate.isPending) setAction(null);
        }}
        title={action === "resume" ? "Resume this relationship?" : action === "suspend" ? "Suspend this relationship?" : "Complete this relationship?"}
        tone={action && DANGER.has(action) ? "danger" : "default"}
        confirmLabel={action ? (ACTION_LABEL[action] ?? "Confirm") : "Confirm"}
        cancelLabel="Keep current status"
        isConfirming={mutate.isPending}
        onConfirm={() => {
          if (action && r.allowedActions.includes(action)) mutate.mutate({ method: "POST", path: `/api/v1/coaching/relationships/${r.id}/${action}`, ifMatch: r.version, json: { internalReason: reason || null } });
        }}
      >
        <TextArea label="Internal reason (visible only to you)" placeholder={action === "suspend" ? "e.g. Client is travelling until March" : action === "complete" ? "e.g. Goal reached, program finished" : "e.g. Client is back from a break"} value={reason} onChange={setReason} maxLength={1000} />
        <MutationError error={mutate.error} />
      </AlertDialog>
    </>
  );
}

function Collaboration({ relationship: r }: { relationship: Relationship }) {
  const training = useFeatureAccess("training.assignments.manage");
  const last = useCoachingQuery<Schema<"LastTrainingActivityDto">>("/api/v1/training/last-activity", { relationshipId: r.id }, training.allowed);
  const history = [...r.statusHistory].reverse();
  return (
    <Panel title="Collaboration" icon={<Handshake />} tone="blue" actions={<StatusBadge status={r.status} />}>
      <Facts
        items={[
          { label: "Type", value: r.teamId ? `Team · ${r.teamName || "Organization"}` : "Private" },
          { label: "Started", value: new Date(r.startedAt).toLocaleDateString() },
          {
            label: "Last training activity",
            value: last.isPending && training.allowed ? "Loading…" : last.data?.performedDate ? new Date(`${last.data.performedDate}T12:00:00`).toLocaleDateString() : "No recorded activity",
          },
          ...(r.teamId && r.assignedCoach ? [{ label: "Assigned coach", value: r.assignedCoach.displayName }] : []),
        ]}
      />
      {last.isError && <Failure error={last.error} retry={() => void last.refetch()} />}
      {r.status !== "Active" && (
        <Alert title={`Collaboration is ${r.status.toLowerCase()}`}>Historical records remain subject to access rules. New assignments require an active collaboration.</Alert>
      )}
      {history.length > 0 && (
        <details className={styles.history}>
          <summary>Status history ({history.length})</summary>
          <ol className={styles.timeline}>
            {history.map((h) => (
              <li key={h.version}>
                <span className={styles.dot} aria-hidden="true" />
                <div className={styles.timelineBody}>
                  <p>
                    <StatusBadge status={h.previousStatus} />
                    <ArrowRight aria-hidden="true" className={styles.arrow} />
                    <StatusBadge status={h.newStatus} />
                  </p>
                  <time className={styles.muted}>{new Date(h.occurredAt).toLocaleString()}</time>
                  {h.internalReason && <p className={styles.reason}>{h.internalReason}</p>}
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  );
}

export default function RelationshipRoute() {
  const { relationshipId } = useParams();
  return (
    <RequireFeature feature="coaching.clients.view">
      <RelationshipDetail key={relationshipId} relationshipId={relationshipId!} />
    </RequireFeature>
  );
}
