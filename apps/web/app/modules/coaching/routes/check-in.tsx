import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Check-in details — Metrivum");

import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, PageHeader, TextArea } from "@trainflow/ui-web";
import { QuickMessage, type QuickTemplate } from "~/modules/messaging";
import { useProfile } from "~/modules/accounts";
import { LockedReason, useFeatureAccess } from "~/shared/access";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, Failure, Loading, MutationError, StatusBadge } from "../components";
import { AnswerReview, FormAnswerFields, type Answers } from "../form-fields";
import { Facts, Panel } from "~/shared/ui/Panel";
import styles from "../coaching.module.css";
import detail from "./check-in.module.css";

export function CheckInDetail({ requestId, relationshipId, embedded = false, onDirtyChange }: { requestId: string | undefined; relationshipId?: string; embedded?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const profile = useProfile();
  const respond = useFeatureAccess("checkins.respond-own");
  const review = useFeatureAccess("checkins.review");
  const manage = useFeatureAccess("checkins.schedules.manage");
  const cancelAccess = manage.allowed ? review : manage;
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"CheckInDetailDto">>(relationshipId ? `/api/v1/check-ins/relationships/${relationshipId}/requests/${requestId}` : `/api/v1/check-ins/requests/${requestId}`);
  // The client of this check-in, for the coach's quick message.
  const collaboration = relationshipId ?? query.data?.request.relationshipId;
  const client = useCoachingQuery<Schema<"CoachRelationshipDto">>(`/api/v1/coaching/clients/${collaboration}`, undefined, mode === "coach" && Boolean(collaboration));
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
  // The client's own page: the form in a narrow column, with the dates, progress and what happens next beside it.
  const side = !coach && !embedded;
  const questions = d.form.definition.sections.flatMap((section) => section.questions);
  const answered = questions.filter((q) => { const value = answers[q.key]; return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ""; }).length;
  const next = r.status === "Reviewed" ? "Your coach reviewed this check-in. Their reply, if they left one, is below your answers."
    : r.status === "Submitted" ? "Your answers are with your coach. You will see their reply here once they review it."
    : r.status === "Cancelled" ? "Your coach cancelled this check-in. There is nothing to fill in."
    : r.status === "Scheduled" ? "The form opens on the date shown above. You will get a notification then."
    : "Only your coach sees your answers. After you submit, they review them and can reply here.";
  const content = <>
    {r.status === "Overdue" && !(embedded && coach) && <Alert tone="warning" title="This check-in is overdue">{coach ? "The client can still submit a response." : "You can still submit your response."}</Alert>}
    {d.submission ? <Panel title={coach ? "Client response" : "Your response"}><AnswerReview definition={d.form.definition} answers={d.submission.answers as Answers} /></Panel> : !coach && pending ? <Panel title="Your response"><form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (respond.allowed) mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/submit`, ifMatch: r.version, json: { answers } }); }}><FormAnswerFields definition={d.form.definition} answers={answers} disabled={mutation.isPending || !respond.allowed} onChange={(a) => { setAnswers(a); setDirty(true); }} /><MutationError error={mutation.error} /><LockedReason access={respond}><Button type="submit" variant="primary" isDisabled={!respond.allowed} loading={mutation.isPending}>Submit check-in</Button></LockedReason></form></Panel> : <Alert title={r.status === "Cancelled" ? "This check-in was cancelled" : r.status === "Scheduled" ? "This check-in is not available yet" : "Waiting for the client's response"} />}
    {r.clientReply && <Panel title="Coach reply"><p className={styles.prose}>{r.clientReply}</p></Panel>}
    {coach && d.coachPrivateNotes && <Panel title="Private notes" description="Only you see these notes."><p className={styles.prose}>{d.coachPrivateNotes}</p></Panel>}
    {coach && r.status === "Submitted" && <Panel title="Review response" actions={<LockedReason access={review}><Button variant="primary" isDisabled={!review.allowed} loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/check-ins/requests/${r.id}/review`, ifMatch: r.version, json: { clientReply: reply || null, coachPrivateNotes: notes || null } })}>Mark as reviewed</Button></LockedReason>}><TextArea label="Reply visible to the client" placeholder="Feedback for the client" value={reply} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setReply(value); setDirty(true); }} maxLength={4000} /><TextArea label="Private coach notes" placeholder="Only you see these notes" value={notes} isDisabled={mutation.isPending || !review.allowed} onChange={(value) => { setNotes(value); setDirty(true); }} maxLength={4000} /></Panel>}
    {(coach || !pending) && <MutationError error={mutation.error} />}
  </>;
  return <><DraftNavigationGuard dirty={dirty && editable} />{confirmDialog}
    {!embedded && <PageHeader title={r.scheduleName} description={`Due ${when(r.dueAtUtc)}`} meta={<StatusBadge status={r.status} />} actions={cancel ?? undefined} />}
    {side ? (
      <div className={styles.checkinLayout}>
        <div className={styles.stack}>{content}</div>
        <aside className={styles.fillAside}>
          <Panel title="Timeline">{timeline}</Panel>
          {pending && !d.submission && questions.length ? (
            <Panel title="Progress">
              <div className={styles.progress} role="progressbar" aria-label="Answered questions" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answered}><span style={{ width: `${(answered / questions.length) * 100}%` }} /></div>
              <p className={styles.progressNote}>{answered} of {questions.length} {questions.length === 1 ? "question" : "questions"} answered</p>
            </Panel>
          ) : null}
          <Panel title="What happens next"><p className={styles.prose}>{next}</p></Panel>
        </aside>
      </div>
    ) : (
      <div className={styles.stack}>
        {embedded ? (
          <section className={detail.summary} aria-label="Check-in summary">
            <div className={detail.summaryHead}>
              <div className={detail.summaryTitle}>
                <h3>{r.scheduleName}</h3>
                <span className={detail.due} data-tone={r.status === "Overdue" ? "late" : undefined}>{dueText(r)}</span>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <Steps request={r} when={when} />
            {cancel ? <div className={detail.summaryActions}>{cancel}</div> : null}
          </section>
        ) : <Panel title="Timeline">{timeline}</Panel>}
        {coach && client.data ? <QuickMessage person={client.data.client} title="Message" templates={messageTemplates(r, client.data.client.displayName, when)} /> : null}
        {content}
      </div>
    )}
  </>;
}

export default function CheckIn() {
  const { requestId } = useParams();
  return <CheckInDetail key={requestId} requestId={requestId} />;
}

type Request = Schema<"CheckInDetailDto">["request"];

/** "Due in 3 days", "Due today", "2 days overdue", "Submitted 1 day late" — the one fact a coach scans for. */
function dueText(r: Request) {
  const day = 86_400_000;
  const days = Math.round((new Date(r.dueAtUtc).getTime() - Date.now()) / day);
  if (r.status === "Reviewed") return "Reviewed";
  if (r.status === "Cancelled") return "Cancelled";
  if (r.submittedAt) return r.wasLate ? "Submitted late" : "Submitted on time";
  if (r.status === "Scheduled") return `Opens ${new Date(r.availableAtUtc).toLocaleDateString([], { dateStyle: "medium" })}`;
  if (days < 0) return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Opened, due, submitted and reviewed as four steps; the current one is marked, a missed due date in amber. */
function Steps({ request: r, when }: { request: Request; when: (value: string) => string }) {
  const now = Date.now();
  const steps = [
    { label: "Opened", value: r.availableAtUtc, done: new Date(r.availableAtUtc).getTime() <= now },
    { label: "Due", value: r.dueAtUtc, done: Boolean(r.submittedAt) || new Date(r.dueAtUtc).getTime() <= now, late: !r.submittedAt && r.status === "Overdue" },
    { label: "Submitted", value: r.submittedAt, done: Boolean(r.submittedAt), late: r.wasLate },
    { label: "Reviewed", value: r.reviewedAt, done: Boolean(r.reviewedAt) },
  ];
  const current = r.status === "Cancelled" ? -1 : steps.findIndex((step) => !step.done);
  return (
    <ol className={detail.steps}>
      {steps.map((step, index) => (
        <li key={step.label} data-state={step.done ? "done" : index === current ? "current" : undefined} data-late={step.late || undefined}>
          <span className={detail.dot} aria-hidden="true" />
          <span className={detail.stepLabel}>{step.label}</span>
          <span className={detail.stepValue}>{step.value ? when(step.value) : "—"}</span>
        </li>
      ))}
    </ol>
  );
}

/** Prepared texts for the coach, the most fitting first for the check-in's state. */
function messageTemplates(r: Request, name: string, when: (value: string) => string): QuickTemplate[] {
  const first = name.split(/\s+/)[0] || name;
  const reminder: QuickTemplate = r.status === "Overdue"
    ? { id: "reminder", label: "Late reminder", text: `Hi ${first}, a quick reminder: your check-in "${r.scheduleName}" was due ${when(r.dueAtUtc)}. Could you fill it in when you get a moment? Thanks!` }
    : r.status === "Scheduled"
      ? { id: "reminder", label: "Heads-up", text: `Hi ${first}, heads-up: your check-in "${r.scheduleName}" opens ${when(r.availableAtUtc)}.` }
      : { id: "reminder", label: "Reminder", text: `Hi ${first}, your check-in "${r.scheduleName}" is open. Please fill it in by ${when(r.dueAtUtc)}. Thanks!` };
  const thanks: QuickTemplate = { id: "thanks", label: "Thanks", text: `Thanks for your check-in, ${first}! I'll go through it and get back to you.` };
  const question: QuickTemplate = { id: "question", label: "Question", text: `Hi ${first}, a quick question about your check-in "${r.scheduleName}": ` };
  return r.submittedAt ? [thanks, question, reminder] : [reminder, question, thanks];
}
