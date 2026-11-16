import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Check-in details — Metrivum");

import {
  useWorkspace,
  WorkspaceRouteGuard,
} from "~/shared/session/WorkspaceScope";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Button, PageHeader, TextArea, toast } from "@portable-ui/react";
import { QuickMessage, type QuickTemplate } from "~/modules/messaging";
import { useProfile } from "~/modules/accounts";
import { LockedReason, useFeatureAccess } from "~/shared/access";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useCoachingMutation, useCoachingQuery } from "../api";
import {
  DraftNavigationGuard,
  Failure,
  Loading,
  MutationError,
  StatusBadge,
} from "../components";
import {
  AnswerSheet,
  FormAnswerFields,
  answerErrors,
  focusFirstError,
  type AnswerErrors,
  type Answers,
} from "../form-fields";
import { Facts, Panel } from "~/shared/ui/Panel";
import styles from "../coaching.module.css";
import detail from "./check-in.module.css";
import preview from "../form-builder.module.css";

export function CheckInDetail({
  requestId,
  relationshipId,
  embedded = false,
  onDirtyChange,
}: {
  requestId: string | undefined;
  relationshipId?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const uiCopy = useUiCopy();

  const profile = useProfile();
  const respond = useFeatureAccess("checkins.respond-own");
  const review = useFeatureAccess("checkins.review");
  const manage = useFeatureAccess("checkins.schedules.manage");
  const cancelAccess = manage.allowed ? review : manage;
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"CheckInDetailDto">>(
    relationshipId
      ? `/api/v1/check-ins/relationships/${relationshipId}/requests/${requestId}`
      : `/api/v1/check-ins/requests/${requestId}`,
  );
  // The client of this check-in, for the coach's quick message.
  const collaboration = relationshipId ?? query.data?.request.relationshipId;
  const client = useCoachingQuery<Schema<"CoachRelationshipDto">>(
    `/api/v1/coaching/clients/${collaboration}`,
    undefined,
    mode === "coach" && Boolean(collaboration),
  );
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<AnswerErrors>({});
  const [reply, setReply] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirtyState] = useState(false);
  const setDirty = setDirtyState;
  const editable = !["Reviewed", "Cancelled"].includes(
    query.data?.request.status ?? "",
  );
  useEffect(() => {
    onDirtyChange?.(dirty && editable);
  }, [dirty, editable, onDirtyChange]);
  useUnsavedWorkGuard(useCallback(() => dirty && editable, [dirty, editable]));
  const mutation = useCoachingMutation(() => setDirty(false));
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const d = query.data;
  const r = d.request;
  if (relationshipId && r.relationshipId !== relationshipId)
    return (
      <Alert
        tone="danger"
        title={
          uiCopy["ui"]["This check-in belongs to a different collaboration"]
        }
      />
    );
  const coach = profile.id === d.form.coachId;
  if ((mode === "coach") !== coach)
    return (
      <WorkspaceRouteGuard required={coach ? "coach" : "client"}>
        {null}
      </WorkspaceRouteGuard>
    );
  const pending = ["Available", "Overdue"].includes(r.status);
  const when = (value: string) =>
    new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const canCancel =
    coach && ["Scheduled", "Available", "Overdue"].includes(r.status);
  const cancel = canCancel ? (
    <LockedReason access={cancelAccess}>
      <Button
        variant="danger-ghost"
        isDisabled={mutation.isPending || !cancelAccess.allowed}
        onPress={async () => {
          if (
            await ask({
              title: uiCopy["ui"]["Cancel this check-in request?"],
              body: "The client can no longer submit it.",
              confirmLabel: uiCopy["ui"]["Cancel request"],
              cancelLabel: uiCopy["ui"]["Keep request"],
            })
          )
            mutation.mutate({
              method: "POST",
              path: `/api/v1/check-ins/requests/${r.id}/cancel`,
              ifMatch: r.version,
            });
        }}
      >
        {uiCopy["ui"]["Cancel request"]}
      </Button>
    </LockedReason>
  ) : null;
  const timeline = (
    <Facts
      items={[
        {
          label: uiCopy["access"]["reasons"]["available"],
          value: when(r.availableAtUtc),
        },
        { label: uiCopy["ui"]["Due"], value: when(r.dueAtUtc) },
        {
          label: uiCopy["ui"]["Submitted"],
          value: r.submittedAt ? (
            <>
              {when(r.submittedAt)}
              {r.wasLate ? (
                <span className={styles.lateNote}>
                  {" "}
                  {uiCopy["ui"]["· late"]}
                </span>
              ) : null}
            </>
          ) : (
            "Not yet"
          ),
        },
        ...(r.reviewedAt
          ? [{ label: uiCopy["ui"]["Reviewed"], value: when(r.reviewedAt) }]
          : []),
      ]}
    />
  );
  const questions = d.form.definition.sections.flatMap(
    (section) => section.questions,
  );
  const answered = questions.filter((q) => {
    const value = answers[q.key];
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && value !== "";
  }).length;
  const next =
    r.status === "Reviewed"
      ? "Your coach reviewed this check-in. Their reply, if they left one, is below your answers."
      : r.status === "Submitted"
        ? "Your answers are with your coach. You will see their reply here once they review it."
        : r.status === "Cancelled"
          ? "Your coach cancelled this check-in. There is nothing to fill in."
          : r.status === "Scheduled"
            ? "The form opens on the date shown above. You will get a notification then."
            : "Only your coach sees your answers. After you submit, they review them and can reply here.";
  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!respond.allowed) return;
    const found = answerErrors(d.form.definition, answers);
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstError(found);
      return;
    }
    mutation.mutate(
      {
        method: "POST",
        path: `/api/v1/check-ins/requests/${r.id}/submit`,
        ifMatch: r.version,
        json: { answers },
      },
      {
        onSuccess: () =>
          toast({
            tone: "success",
            title: uiCopy["ui"]["Check-in sent"],
            description: uiCopy["ui"]["Your coach can see your answers now."],
          }),
      },
    );
  };
  const fillable = !coach && pending && !d.submission;
  // The form itself: what the client answered, the form to fill in, or (for the coach, before an answer) the empty form.
  const formBody = d.submission ? (
    <AnswerSheet
      definition={d.form.definition}
      answers={d.submission.answers as Answers}
    />
  ) : fillable ? (
    <form className={styles.form} onSubmit={submitForm}>
      <FormAnswerFields
        definition={d.form.definition}
        answers={answers}
        errors={errors}
        disabled={mutation.isPending || !respond.allowed}
        onChange={(a) => {
          setErrors((e) =>
            Object.fromEntries(
              Object.entries(e).filter(([key]) => a[key] === answers[key]),
            ),
          );
          setAnswers(a);
          setDirty(true);
        }}
      />
      <MutationError error={mutation.error} />
      <div className={preview.tryFoot}>
        <LockedReason access={respond}>
          <Button
            type="submit"
            variant="primary"
            isDisabled={!respond.allowed}
            loading={mutation.isPending}
          >
            {uiCopy["ui"]["Submit check-in"]}
          </Button>
        </LockedReason>
      </div>
    </form>
  ) : (
    <>
      <Alert
        title={
          r.status === "Cancelled"
            ? uiCopy["ui"]["This check-in was cancelled"]
            : r.status === "Scheduled"
              ? uiCopy["ui"]["This check-in is not available yet"]
              : coach
                ? uiCopy["ui"]["Waiting for the client's response"]
                : uiCopy["ui"]["Waiting for your response"]
        }
      />
      {r.status !== "Cancelled" ? (
        <AnswerSheet
          definition={d.form.definition}
          answers={{}}
          emptyText="Not answered yet"
        />
      ) : null}
    </>
  );
  const overdue =
    r.status === "Overdue" && !(embedded && coach) ? (
      <Alert tone="warning" title={uiCopy["ui"]["This check-in is overdue"]}>
        {coach
          ? uiCopy["ui"]["The client can still submit a response."]
          : uiCopy["ui"]["You can still submit your response."]}
      </Alert>
    ) : null;
  const coachReply = r.clientReply ? (
    <Panel title={uiCopy["ui"]["Coach reply"]}>
      <p className={styles.prose}>{r.clientReply}</p>
    </Panel>
  ) : null;
  const privateNotes =
    coach && d.coachPrivateNotes ? (
      <Panel
        title={uiCopy["ui"]["Private notes"]}
        description={uiCopy["ui"]["Only you see these notes."]}
      >
        <p className={styles.prose}>{d.coachPrivateNotes}</p>
      </Panel>
    ) : null;
  const reviewPanel =
    coach && r.status === "Submitted" ? (
      <Panel title={uiCopy["ui"]["Review response"]}>
        <div className={styles.stack}>
          <TextArea
            label={uiCopy["ui"]["Reply visible to the client"]}
            placeholder={uiCopy["ui"]["Feedback for the client"]}
            value={reply}
            isDisabled={mutation.isPending || !review.allowed}
            onChange={(value) => {
              setReply(value);
              setDirty(true);
            }}
            maxLength={4000}
          />
          <TextArea
            label={uiCopy["ui"]["Private coach notes"]}
            placeholder={uiCopy["ui"]["Only you see these notes"]}
            value={notes}
            isDisabled={mutation.isPending || !review.allowed}
            onChange={(value) => {
              setNotes(value);
              setDirty(true);
            }}
            maxLength={4000}
          />
          <LockedReason access={review}>
            <Button
              variant="primary"
              isDisabled={!review.allowed}
              loading={mutation.isPending}
              onPress={() =>
                mutation.mutate(
                  {
                    method: "POST",
                    path: `/api/v1/check-ins/requests/${r.id}/review`,
                    ifMatch: r.version,
                    json: {
                      clientReply: reply || null,
                      coachPrivateNotes: notes || null,
                    },
                  },
                  {
                    onSuccess: () =>
                      toast({
                        tone: "success",
                        title: uiCopy["ui"]["Check-in reviewed"],
                      }),
                  },
                )
              }
            >
              {uiCopy["ui"]["Mark as reviewed"]}
            </Button>
          </LockedReason>
        </div>
      </Panel>
    ) : null;
  const otherError = !fillable ? (
    <MutationError error={mutation.error} />
  ) : null;
  const message =
    coach && client.data ? (
      <QuickMessage
        person={client.data.client}
        title={uiCopy["profile"]["message"]}
        templates={messageTemplates(r, client.data.client.displayName, when)}
      />
    ) : null;

  if (embedded)
    return (
      <>
        <DraftNavigationGuard dirty={dirty && editable} />
        {confirmDialog}
        <div className={styles.stack}>
          <section
            className={detail.summary}
            aria-label={uiCopy["ui"]["Check-in summary"]}
          >
            <div className={detail.summaryHead}>
              <div className={detail.summaryTitle}>
                <h3>{r.scheduleName}</h3>
                <span
                  className={detail.due}
                  data-tone={r.status === "Overdue" ? "late" : undefined}
                >
                  {dueText(r)}
                </span>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <Steps request={r} when={when} />
            {cancel ? (
              <div className={detail.summaryActions}>{cancel}</div>
            ) : null}
          </section>
          {message}
          {overdue}
          {formBody}
          {coachReply}
          {privateNotes}
          {reviewPanel}
          {otherError}
        </div>
      </>
    );

  // The full page: the form as the client sees it, in the same frame as the form editor's preview, with the
  // dates, review and next steps beside it.
  const answeredText = d.submission
    ? `${coach ? "Submitted" : "Sent"} ${when(d.submission.submittedAt ?? r.submittedAt ?? r.dueAtUtc)}`
    : `${questions.length} ${questions.length === 1 ? "question" : "questions"}`;
  return (
    <>
      <DraftNavigationGuard dirty={dirty && editable} />
      {confirmDialog}
      <PageHeader
        title={r.scheduleName}
        description={formatInterfaceText(uiCopy["ui"]["Due {0}"], [
          when(r.dueAtUtc),
        ])}
        meta={<StatusBadge status={r.status} />}
        actions={cancel ?? undefined}
      />
      <div className={detail.previewLayout}>
        <div className={detail.previewMain}>
          {overdue}
          <div className={preview.workspace}>
            <div className={preview.frameBar}>
              <span className={preview.dots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className={preview.frameTitle}>
                {coach
                  ? uiCopy["ui"]["Client's check-in"]
                  : uiCopy["ui"]["Your check-in"]}
                <small>
                  {coach ? uiCopy["ui"]["Client view"] : uiCopy["ui"]["Form"]} ·{" "}
                  {answeredText}
                </small>
              </span>
            </div>
            <div className={preview.canvas}>
              <div className={preview.screen} data-device="desktop">
                <header className={preview.tryHead}>
                  <h2>{d.form.name || r.scheduleName}</h2>
                  {d.form.description ? <p>{d.form.description}</p> : null}
                </header>
                {formBody}
              </div>
            </div>
          </div>
        </div>
        <aside className={styles.fillAside}>
          {reviewPanel}
          {coachReply}
          {privateNotes}
          {otherError}
          <Panel title={uiCopy["ui"]["Timeline"]}>{timeline}</Panel>
          {fillable && questions.length ? (
            <Panel title={uiCopy["editor"]["sheet"]["progression"]["kind"]}>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label={uiCopy["ui"]["Answered questions"]}
                aria-valuemin={0}
                aria-valuemax={questions.length}
                aria-valuenow={answered}
              >
                <span
                  style={{ width: `${(answered / questions.length) * 100}%` }}
                />
              </div>
              <p className={styles.progressNote}>
                {answered} of {questions.length}{" "}
                {questions.length === 1
                  ? uiCopy["ui"]["question"]
                  : uiCopy["ui"]["questions"]}{" "}
                {uiCopy["ui"]["answered"]}
              </p>
            </Panel>
          ) : null}
          {message}
          {!coach ? (
            <Panel title={uiCopy["ui"]["What happens next"]}>
              <p className={styles.prose}>{next}</p>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
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
  if (r.status === "Scheduled")
    return `Opens ${new Date(r.availableAtUtc).toLocaleDateString([], { dateStyle: "medium" })}`;
  if (days < 0) return `${-days} ${-days === 1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  return `Due in ${days} ${days === 1 ? "day" : "days"}`;
}

/** Opened, due, submitted and reviewed as four steps; the current one is marked, a missed due date in amber. */
function Steps({
  request: r,
  when,
}: {
  request: Request;
  when: (value: string) => string;
}) {
  const uiCopy = useUiCopy();

  const now = Date.now();
  const steps = [
    {
      label: uiCopy["ui"]["Opened"],
      value: r.availableAtUtc,
      done: new Date(r.availableAtUtc).getTime() <= now,
    },
    {
      label: uiCopy["ui"]["Due"],
      value: r.dueAtUtc,
      done: Boolean(r.submittedAt) || new Date(r.dueAtUtc).getTime() <= now,
      late: !r.submittedAt && r.status === "Overdue",
    },
    {
      label: uiCopy["ui"]["Submitted"],
      value: r.submittedAt,
      done: Boolean(r.submittedAt),
      late: r.wasLate,
    },
    {
      label: uiCopy["ui"]["Reviewed"],
      value: r.reviewedAt,
      done: Boolean(r.reviewedAt),
    },
  ];
  const current =
    r.status === "Cancelled" ? -1 : steps.findIndex((step) => !step.done);
  return (
    <ol className={detail.steps}>
      {steps.map((step, index) => (
        <li
          key={step.label}
          data-state={
            step.done ? "done" : index === current ? "current" : undefined
          }
          data-late={step.late || undefined}
        >
          <span className={detail.dot} aria-hidden="true" />
          <span className={detail.stepLabel}>{step.label}</span>
          <span className={detail.stepValue}>
            {step.value ? when(step.value) : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Prepared texts for the coach, the most fitting first for the check-in's state. */
function messageTemplates(
  r: Request,
  name: string,
  when: (value: string) => string,
): QuickTemplate[] {
  const first = name.split(/\s+/)[0] || name;
  const reminder: QuickTemplate =
    r.status === "Overdue"
      ? {
          id: "reminder",
          label: "Late reminder",
          text: `Hi ${first}, a quick reminder: your check-in "${r.scheduleName}" was due ${when(r.dueAtUtc)}. Could you fill it in when you get a moment? Thanks!`,
        }
      : r.status === "Scheduled"
        ? {
            id: "reminder",
            label: "Heads-up",
            text: `Hi ${first}, heads-up: your check-in "${r.scheduleName}" opens ${when(r.availableAtUtc)}.`,
          }
        : {
            id: "reminder",
            label: "Reminder",
            text: `Hi ${first}, your check-in "${r.scheduleName}" is open. Please fill it in by ${when(r.dueAtUtc)}. Thanks!`,
          };
  const thanks: QuickTemplate = {
    id: "thanks",
    label: "Thanks",
    text: `Thanks for your check-in, ${first}! I'll go through it and get back to you.`,
  };
  const question: QuickTemplate = {
    id: "question",
    label: "Question",
    text: `Hi ${first}, a quick question about your check-in "${r.scheduleName}": `,
  };
  return r.submittedAt
    ? [thanks, question, reminder]
    : [reminder, question, thanks];
}
