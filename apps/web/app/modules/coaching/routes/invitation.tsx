import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Invitation details — Metrivum");

import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { Link, useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Avatar, Badge, Button, PageHeader, toast } from "@metrivum/ui-web";
import { Facts, Panel } from "~/shared/ui/Panel";
import { useFeatureAccess, useFeatureReasonText } from "~/shared/access";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import { StartApplication } from "./offer-public";
import { invitationNotice } from "../invitation-notice";
import { priceDescription } from "../pricing";
import { OpenConversationButton } from "~/modules/messaging";
import identityStyles from "./relationship.module.css";
import styles from "../coaching.module.css";

export default function Invitation() {
  const { invitationId } = useParams();
  const profile = useProfile();
  const apply = useFeatureAccess("coaching.applications.submit-own");
  const reason = useFeatureReasonText();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"InvitationDto">>(`/api/v1/coaching/invitations/${invitationId}`);
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const i = query.data;
  const coach = profile.id === i.coachId;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  const person = coach ? i.target : i.coach;
  const actions = i.allowedActions.filter((a) => ["accept", "decline", "revoke"].includes(a));
  const options = i.offerRevision.billingOptions.filter((o) => !i.billingOptionId || o.id === i.billingOptionId);
  const act = (action: string) => mutation.mutate({ method: "POST", path: `/api/v1/coaching/invitations/${i.id}/${action}`, ifMatch: i.version }, { onSuccess: () => { const notice = invitationNotice[action]; if (notice) toast({ tone: "success", ...notice }); } });
  return <div className={styles.invitationPage}>
    <PageHeader
      title={<span className={identityStyles.title}><Avatar name={person.displayName} size="lg" decorative /><span className={identityStyles.identity}><span className={identityStyles.nameLine}><span className={identityStyles.name}>{person.displayName}</span><Badge size="sm">{coach ? "Invited client" : "Coach"}</Badge></span>{person.username && <small>@{person.username}</small>}</span></span>}
      meta={<StatusBadge status={i.status} />}
      actions={<>
        <OpenConversationButton person={person} />
        {actions.filter((a) => a !== "accept").map((action) => <Button key={action} variant="danger-ghost" isDisabled={mutation.isPending} onPress={async () => { if (await ask(action === "revoke" ? { title: "Revoke this invitation?", body: "The client can no longer accept it. You can send a new invitation later.", confirmLabel: "Revoke invitation", cancelLabel: "Keep invitation" } : { title: "Decline this invitation?", body: "The coach is told you declined. You can still apply to their offers later.", confirmLabel: "Decline invitation", cancelLabel: "Keep invitation" })) act(action); }}>{action === "revoke" ? "Revoke invitation" : "Decline invitation"}</Button>)}
        {actions.includes("accept") ? <Button variant="success" loading={mutation.isPending} onPress={() => act("accept")}>Accept invitation</Button> : null}
      </>}
    />
    <MutationError error={mutation.error} />
    {confirmDialog}
    <div className={styles.invitationPanels}>
      <Panel title="Invitation">
        <Facts items={[
          { label: coach ? "Sent to" : "From", value: <>{person.displayName}{person.username ? <span className={styles.none}> · @{person.username}</span> : null}</> },
          { label: "Sent", value: new Date(i.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) },
          { label: "Responded", value: i.respondedAt ? new Date(i.respondedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Waiting for a response" },
          { label: "Status", value: <StatusBadge status={i.status} /> },
        ]} />
        {i.message ? <blockquote className={styles.quote}>{i.message}</blockquote> : null}
      </Panel>
      <Panel title={i.offerRevision.name} description={`${i.offerRevision.coachingMode === "Offline" ? "In person" : i.offerRevision.coachingMode} coaching`}>
        {i.offerRevision.description ? <p className={styles.prose}>{i.offerRevision.description}</p> : null}
        <Facts items={options.map((o) => ({ key: o.id, label: o.name, value: priceDescription(o, i.offerRevision.currency) }))} />
        <p className={styles.note}>These offer terms are reserved in this invitation. Accepting lets {coach ? "the client" : "you"} submit an application.</p>
      </Panel>
      {/* The third column is the next step: the application, the form that starts it, or what unlocks it. */}
      {i.applicationId ? (
        <Panel title="Application" description="Started from this invitation">
          <p className={styles.prose}>{coach ? "The client has started an application for this offer." : "Your application for this offer has been started."}</p>
          <Link to={`/app/applications/${i.applicationId}`}>Open application</Link>
        </Panel>
      ) : coach ? null : i.status === "Accepted" ? (
        <Panel className={styles.attention} title={i.offerRevision.applicationFormVersionId ? "Application form" : "Application"} description="The next step after accepting">
          {i.allowedActions.includes("apply") && apply.allowed ? <StartApplication offer={i.offerRevision} invitationId={i.id} preselected={i.billingOptionId} /> : <Alert title="Application is currently unavailable">{reason(apply)}</Alert>}
        </Panel>
      ) : (
        <Panel className={actions.includes("accept") ? styles.attention : undefined} title={i.offerRevision.applicationFormVersionId ? "Application form" : "Application"} description="The next step after accepting">
          <p className={styles.prose}>{actions.includes("accept") ? "Accept the invitation to review and submit an application for this offer." : "You can start an application only while the invitation is accepted."}</p>
        </Panel>
      )}
    </div>
  </div>;
}
