import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useCallback, useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, PageHeader, TextArea } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { LockedReason, useFeatureAccess } from "~/shared/access";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, Failure, Loading, MutationError, StatusBadge } from "../components";
import { AnswerReview, FormAnswerFields, type Answers } from "../form-fields";
import styles from "../coaching.module.css";

function CheckInDetail({ requestId }: { requestId: string | undefined }) {
  const profile = useProfile();
  const respond = useFeatureAccess("checkins.respond-own");
  const review = useFeatureAccess("checkins.review");
  const manage = useFeatureAccess("checkins.schedules.manage");
  const cancelAccess = manage.allowed ? review : manage;
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"CheckInDetailDto">>(`/api/v1/check-ins/requests/${requestId}`);
  const [answers, setAnswers] = useState<Answers>({});
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const mutation = useCoachingMutation(() => setDirty(false));
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const r = d.request;
  const coach = profile.id === d.form.coachId;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  const pending = ["Available", "Overdue"].includes(r.status);
  return <><DraftNavigationGuard dirty={dirty} /><PageHeader title={r.scheduleName} description={`Due ${new Date(r.dueAtUtc).toLocaleString()}`} actions={<StatusBadge status={r.status} />} /><HubNavigation /><div className={styles.stack}>
    {r.status === "Overdue" && <Alert tone="warning" title="This check-in is overdue">You can still submit your response.</Alert>}
    {r.wasLate && <Alert title="Submitted after the due date" />}
    {d.submission ? <section className={styles.panel}><h2>Your response</h2><AnswerReview definition={d.form.definition} answers={d.submission.answers as Answers} /></section> : !coach && pending ? <form className={styles.stack} onSubmit={(e) => { e.preventDefault(); if (respond.allowed) mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/submit`, ifMatch: r.version, json: { answers } }); }}><FormAnswerFields definition={d.form.definition} answers={answers} disabled={mutation.isPending || !respond.allowed} onChange={(a) => { setAnswers(a); setDirty(true); }} /><MutationError error={mutation.error} /><LockedReason access={respond}><Button type="submit" variant="primary" isDisabled={!respond.allowed} loading={mutation.isPending}>Submit check-in</Button></LockedReason></form> : <Alert title={r.status === "Cancelled" ? "This check-in was cancelled" : r.status === "Scheduled" ? "This check-in is not available yet" : "Waiting for the client's response"} />}
    {r.clientReply && <section className={styles.panel}><h2>Coach reply</h2><p>{r.clientReply}</p></section>}
    {coach && d.coachPrivateNotes && <section className={styles.panel}><h2>Private notes</h2><p>{d.coachPrivateNotes}</p></section>}
    {coach && r.status === "Submitted" && <section className={styles.panel}><h2>Review response</h2><TextArea label="Reply visible to the client" placeholder="Feedback for the client" value={reply} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setReply(value); setDirty(true); }} maxLength={4000} /><TextArea label="Private coach notes" placeholder="Only you see these notes" value={notes} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setNotes(value); setDirty(true); }} maxLength={4000} /><LockedReason access={review}><Button variant="primary" isDisabled={!review.allowed} loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/review`, ifMatch: r.version, json: { clientReply: reply || null, coachPrivateNotes: notes || null } })}>Mark as reviewed</Button></LockedReason></section>}
    {coach && ["Scheduled", "Available", "Overdue"].includes(r.status) && <LockedReason access={cancelAccess}><Button isDisabled={mutation.isPending || !cancelAccess.allowed} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/cancel`, ifMatch: r.version })}>Cancel request</Button></LockedReason>}
    {(coach || !pending) && <MutationError error={mutation.error} />}
  </div></>;
}

export default function CheckIn() {
  const { requestId } = useParams();
  return <CheckInDetail key={requestId} requestId={requestId} />;
}
