import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { AlertDialog, Button, PageHeader } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import { money, priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function Service() {
  const { serviceId } = useParams();
  const profile = useProfile();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"RelationshipServiceDto">>(`/api/v1/coaching/services/${serviceId}`);
  const [confirm, setConfirm] = useState(false);
  const mutation = useCoachingMutation(() => setConfirm(false));
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const s = query.data;
  const option = s.offerRevision.billingOptions.find((o) => o.id === s.billingOptionId);
  const coach = s.offerRevision.coachId === profile.id;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  return <><PageHeader title={s.offerName} description={`Started ${new Date(s.startedAt).toLocaleDateString()}`} actions={<StatusBadge status={s.status} />} /><HubNavigation /><div className={styles.stack}><section className={styles.panel}><h2>Accepted terms</h2><p>{s.offerRevision.description}</p><p className={styles.summary}>{money(s.amount, s.currency)}</p>{option && <p>{option.name} · {priceDescription(option, s.currency)}</p>}{s.selectedSessionCount != null && <p>{s.selectedSessionCount} sessions</p>}<p className={styles.muted}>Offer revision {s.offerRevision.number}</p>{s.completedAt && <p>Completed {new Date(s.completedAt).toLocaleString()}</p>}</section>
    <Link to={`/app/${coach ? "clients" : "my-coaches"}/${s.relationshipId}/services`}>All services and billing</Link>
    {s.allowedActions.includes("complete") && <Button onPress={() => setConfirm(true)}>Complete service</Button>}<MutationError error={mutation.error} />
    <AlertDialog isOpen={confirm} onOpenChange={setConfirm} title="Complete this service?" confirmLabel="Complete service" cancelLabel="Keep active" isConfirming={mutation.isPending} onConfirm={() => mutation.mutate({ method: "POST", path: `/api/v1/coaching/services/${s.id}/complete`, ifMatch: s.version })}>Future subscription periods will stop. Existing orders and payment history remain available.<MutationError error={mutation.error} /></AlertDialog>
  </div></>;
}
