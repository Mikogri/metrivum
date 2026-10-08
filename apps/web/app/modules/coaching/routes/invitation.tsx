import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, PageHeader } from "@trainflow/ui-web";
import { useFeatureAccess, useFeatureReasonText } from "~/shared/access";
import { useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import { StartApplication } from "./offer-public";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function Invitation() {
  const { invitationId } = useParams();
  const profile = useProfile();
  const apply = useFeatureAccess("coaching.applications.submit-own");
  const reason = useFeatureReasonText();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"InvitationDto">>(`/api/v1/coaching/invitations/${invitationId}`);
  const mutation = useCoachingMutation();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const i = query.data;
  const coach = profile.id === i.coachId;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  return <><PageHeader title={i.offerRevision.name} description={coach ? `Invitation for ${i.target.displayName}` : `Invitation from ${i.coach.displayName}`} actions={<StatusBadge status={i.status} />} /><HubNavigation /><div className={styles.stack}>
    <section className={styles.panel}><p>{i.message}</p><p>{i.offerRevision.description}</p>{i.offerRevision.billingOptions.filter((o) => !i.billingOptionId || o.id === i.billingOptionId).map((o) => <p key={o.id}>{o.name}: {priceDescription(o, i.offerRevision.currency)}</p>)}<p className={styles.muted}>These offer terms are reserved in this invitation. Accepting lets you fill out an application.</p></section>
    <MutationError error={mutation.error} /><div className={styles.actions}>{i.allowedActions.filter((a) => ["accept", "decline", "revoke"].includes(a)).map((action) => <Button key={action} variant={action === "accept" ? "primary" : "secondary"} isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/coaching/invitations/${i.id}/${action}`, ifMatch: i.version })}>{action[0]!.toUpperCase() + action.slice(1)} invitation</Button>)}</div>
    {i.applicationId ? <Link to={`/app/applications/${i.applicationId}`}>Open application</Link> : !coach && i.status === "Accepted" && <section className={styles.panel}><h2>Continue your application</h2>{i.allowedActions.includes("apply") && apply.allowed ? <StartApplication offer={i.offerRevision} invitationId={i.id} preselected={i.billingOptionId} /> : <Alert title="Application is currently unavailable">{reason(apply)}</Alert>}</section>}
  </div></>;
}
