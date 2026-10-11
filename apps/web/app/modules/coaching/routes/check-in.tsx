import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, PageHeader, TextArea } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { LockedReason, useFeatureAccess } from "~/shared/access";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, Failure, Loading, MutationError, StatusBadge } from "../components";
import { AnswerReview, FormAnswerFields, type Answers } from "../form-fields";
import { Facts, Panel } from "~/shared/ui/Panel";
import styles from "../coaching.module.css";

export function CheckInDetail({ requestId, relationshipId, embedded = false, onDirtyChange }: { requestId: string | undefined; relationshipId?: string; embedded?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const profile = useProfile();
  const respond = useFeatureAccess("checkins.respond-own");
  const review = useFeatureAccess("checkins.review");
  const manage = useFeatureAccess("checkins.schedules.manage");
  const cancelAccess = manage.allowed ? review : manage;
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"CheckInDetailDto">>(relationshipId ? `/api/v1/check-ins/relationships/${relationshipId}/requests/${requestId}` : `/api/v1/check-ins/requests/${requestId}`);
  const [answers, setAnswers] = useState<Answers>({});
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirtyState] = useState(false);
  const setDirty = setDirtyState;
  const editable = !["Reviewed", "Cancelled"].includes(query.data?.request.status ?? "");
  useEffect(() => { onDirtyChange?.(dirty && editable); }, [dirty, editable, onDirtyChange]);
  useUnsavedWorkGuard(useCallback(() => dirty && editable, [dirty, editable]));
  const mutation = useCoachingMutation(() => setDirty(false));
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const r = d.request;
  if (relationshipId && r.relationshipId !== relationshipId) return <Alert tone="danger" title="This check-in belongs to a different collaboration" />;
  const coach = profile.id === d.form.coachId;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  const pending = ["Available", "Overdue"].includes(r.status);
  const when = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const canCancel = coach && ["Scheduled", "Available", "Overdue"].includes(r.status);
  const cancel = canCancel ? <LockedReason access={cancelAccess}><Button variant="danger-ghost" isDisabled={mutation.isPending || !cancelAccess.allowed} onPress={async () => { if (await ask({ title: "Cancel this check-in request?", body: "The client can no longer submit it.", confirmLabel: "Cancel request", cancelLabel: "Keep request" })) mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/cancel`, ifMatch: r.version }); }}>Cancel request</Button></LockedReason> : null;
  const timeline = <Facts items={[
    { label: "Available", value: when(r.availableAtUtc) },
    { label: "Due", value: when(r.dueAtUtc) },
    { label: "Submitted", value: r.submittedAt ? <>{when(r.submittedAt)}{r.wasLate ? <span className={styles.lateNote}> · late</span> : null}</> : "Not yet" },
    ...(r.reviewedAt ? [{ label: "Reviewed", value: when(r.reviewedAt) }] : []),
  ]} />;
  return <><DraftNavigationGuard dirty={dirty && editable} />{confirmDialog}
    {!embedded && <PageHeader title={r.scheduleName} description={`Due ${when(r.dueAtUtc)}`} meta={<StatusBadge status={r.status} />} actions={cancel ?? undefined} />}
    <div className={styles.stack}>
    {embedded ? <Panel title={r.scheduleName} actions={<><StatusBadge status={r.status} />{cancel}</>}>{timeline}</Panel> : <Panel title="Timeline">{timeline}</Panel>}
    {r.status === "Overdue" && <Alert tone="warning" title="This check-in is overdue">{coach ? "The client can still submit a response." : "You can still submit your response."}</Alert>}
    {d.submission ? <Panel title={coach ? "Client response" : "Your response"}><AnswerReview definition={d.form.definition} answers={d.submission.answers as Answers} /></Panel> : !coach && pending ? <Panel title="Your response"><form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (respond.allowed) mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/submit`, ifMatch: r.version, json: { answers } }); }}><FormAnswerFields definition={d.form.definition} answers={answers} disabled={mutation.isPending || !respond.allowed} onChange={(a) => { setAnswers(a); setDirty(true); }} /><MutationError error={mutation.error} /><LockedReason access={respond}><Button type="submit" variant="primary" isDisabled={!respond.allowed} loading={mutation.isPending}>Submit check-in</Button></LockedReason></form></Panel> : <Alert title={r.status === "Cancelled" ? "This check-in was cancelled" : r.status === "Scheduled" ? "This check-in is not available yet" : "Waiting for the client's response"} />}
    {r.clientReply && <Panel title="Coach reply"><p className={styles.prose}>{r.clientReply}</p></Panel>}
    {coach && d.coachPrivateNotes && <Panel title="Private notes" description="Only you see these notes."><p className={styles.prose}>{d.coachPrivateNotes}</p></Panel>}
    {coach && r.status === "Submitted" && <Panel title="Review response" actions={<LockedReason access={review}><Button variant="primary" isDisabled={!review.allowed} loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/review`, ifMatch: r.version, json: { clientReply: reply || null, coachPrivateNotes: notes || null } })}>Mark as reviewed</Button></LockedReason>}><TextArea label="Reply visible to the client" placeholder="Feedback for the client" value={reply} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setReply(value); setDirty(true); }} maxLength={4000} /><TextArea label="Private coach notes" placeholder="Only you see these notes" value={notes} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setNotes(value); setDirty(true); }} maxLength={4000} /></Panel>}
    {(coach || !pending) && <MutationError error={mutation.error} />}
  </div></>;
}

export default function CheckIn() {
  const { requestId } = useParams();
  return <CheckInDetail key={requestId} requestId={requestId} />;
}
