import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Application details — Metrivum");

import { PlanPurchaseStatus } from "../PlanPurchaseStatus";
import { PlanDeliverySelector } from "../PlanDeliverySelector";
import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, AlertDialog, Avatar, Badge, Button, Checkbox, LinkButton, PageHeader, TextArea, toast } from "@metrivum/ui-web";
import { Facts, Panel, PanelGrid } from "~/shared/ui/Panel";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { profileKey } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, Failure, Loading, MutationError, StatusBadge } from "../components";
import { AnswerReview, FormAnswerFields, answerErrors, focusFirstError, type AnswerErrors, type Answers } from "../form-fields";
import { money, validityDescription } from "../pricing";
import { OpenConversationButton } from "~/modules/messaging";
import styles from "../coaching.module.css";
import identity from "./relationship.module.css";

type Detail = Schema<"ApplicationDetailDto">;
type CoachDetail = Schema<"CoachApplicationDetailDto">;
function initialAnswers(detail: Detail): Answers {
  const prefill: Answers = {};
  for (const q of (detail.formVersion?.definition.sections.flatMap((s) => s.questions) ?? [])) {
    const value = q.systemField ? detail.profilePrefill?.[q.systemField] : undefined;
    if (value === undefined || value === null) continue;
    if (q.type === "MultiChoice" && Array.isArray(value)) prefill[q.key] = value.map(String).filter((v) => q.choices?.some((c) => c.key === v));
    else if (q.type !== "SingleChoice" || q.choices?.some((c) => c.key === value)) prefill[q.key] = value as Answers[string];
  }
  return { ...prefill, ...detail.answers as Answers };
}
function ApplicationForm({ initial }: { initial: Detail }) {
  const account = useAccountKey();
  const cache = useQueryClient();
  const [current, setCurrent] = useState(initial);
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(initial));
  const [dirty, setDirty] = useState(false);
  const [saveProfile, setSaveProfile] = useState(false);
  const [acceptTeamScope, setAcceptTeamScope] = useState(false);
  const [errors, setErrors] = useState<AnswerErrors>({});
  if (!dirty && (initial.application.version !== current.application.version || initial.profileVersion !== current.profileVersion)) {
    setCurrent(initial); setAnswers(initialAnswers(initial));
  }
  const mutation = useCoachingMutation<Detail>((value) => {
    setCurrent(value); setDirty(false);
    // Sending the application always says so; saving a draft stays quiet.
    if (value.application.status === "Submitted") toast({ tone: "success", title: "Application sent", description: "Your coach has your answers and will reply here." });
    if (value.application.status === "Submitted" && saveProfile) void cache.invalidateQueries({ queryKey: profileKey(account) });
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const mapped = (initial.formVersion?.definition.sections.flatMap((s) => s.questions) ?? []).filter((q) => q.systemField && answers[q.key] !== undefined).map((q) => q.systemField!);
  return <form className={styles.stack} onSubmit={(e) => { e.preventDefault(); if (current.offerRevision.teamId && !acceptTeamScope) return;
    // Problems show under their fields before anything is sent.
    const found = current.formVersion ? answerErrors(current.formVersion.definition, answers) : {};
    setErrors(found);
    if (Object.keys(found).length) { focusFirstError(found); return; }
    mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${current.application.id}/submit`, ifMatch: current.application.version, json: { answers, saveProfileFields: saveProfile ? mapped : [], profileVersion: saveProfile ? current.profileVersion : null, acceptTeamScope } }); }}>
    <DraftNavigationGuard dirty={dirty} />
    <Alert title={current.formVersion ? "Your draft is private" : "No application form required"}>{current.formVersion ? "Your coach receives these answers only when you submit this application." : "Review the offer terms, then submit your application for the coach to accept or decline."}</Alert>
    {dirty && initial.profileVersion !== current.profileVersion && <Alert tone="warning" title="Your personal profile changed" actions={<Button isDisabled={mutation.isPending} onPress={() => setCurrent({ ...current, profileVersion: initial.profileVersion, profilePrefill: initial.profilePrefill })}>Use latest profile version</Button>}>Your application answers have been kept. Review them before saving them over the latest profile values.</Alert>}
    {current.formVersion && <FormAnswerFields definition={current.formVersion.definition} answers={answers} errors={errors} disabled={mutation.isPending} onChange={(value) => { setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => value[key] === answers[key]))); setAnswers(value); setDirty(true); }} />}
    {mapped.length > 0 && <Checkbox isSelected={saveProfile} isDisabled={mutation.isPending} onChange={(value) => { setSaveProfile(value); setDirty(true); }}>Also save the mapped answers to my personal profile</Checkbox>}
    {current.offerRevision.teamId && <Alert title={`Team provider: ${current.offerRevision.teamName ?? "Team"}`}><p>{current.offerRevision.purpose === "TrainingPlan" ? "This organization handles your application and sells you an independent plan copy. This purchase does not start a coaching relationship." : "Your new coaching case belongs to this organization. Authorized assigned coaches can access its Team-scoped records. Existing private coaching history is not transferred. Leaving or dissolving the Team does not automatically create a private coaching relationship."}</p><Checkbox isRequired isSelected={acceptTeamScope} isDisabled={mutation.isPending} onChange={value => { setAcceptTeamScope(value); setDirty(true); }}>{current.offerRevision.purpose === "TrainingPlan" ? `I accept ${current.offerRevision.teamName ?? "this Team"} as the provider of this plan purchase and application.` : `I accept ${current.offerRevision.teamName ?? "this Team"} as my organizational coaching provider and consent to the Team-owned case and authorized coach assignments.`}</Checkbox></Alert>}
    <MutationError error={mutation.error} />
    <div className={styles.actions}><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!!current.offerRevision.teamId && !acceptTeamScope}>Submit application</Button>{current.formVersion && <Button isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "PUT", path: `/api/v1/coaching/applications/${current.application.id}`, ifMatch: current.application.version, json: { answers } })}>Save draft</Button>}</div>
  </form>;
}

function ApplicationDetail({ applicationId }: { applicationId: string | undefined }) {
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Detail | CoachDetail>(`/api/v1/coaching/applications/${applicationId}`);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [trainingPlanRevisionId, setTrainingPlanRevisionId] = useState<string | null>(null);
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const response = query.data;
  const coach = "detail" in response;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  const d = "detail" in response ? response.detail : response;
  const a = d.application;
  const confirmThen = async (kind: string, json: unknown, title: string, body: string, confirmLabel: string) => { if (await ask({ title, body, confirmLabel, cancelLabel: "Go back" })) action(kind, json); };
  const action = (kind: string, json?: unknown) => mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${a.id}/${kind}`, ifMatch: a.version, json }, { onSuccess: () => {
    if (kind === "withdraw") toast({ tone: "success", title: "Application withdrawn", description: "The coach no longer reviews it." });
  } });
  const profileEntries = "detail" in response ? Object.entries(response.currentAllowedProfile) : [];
  const filling = !coach && a.status === "InProgress";
  const selectedOption = d.offerRevision.billingOptions.find(option => option.id === a.billingOptionId);
  const plan = d.offerRevision.purpose === "TrainingPlan";
  const clientStatus: { tone: "info" | "success" | "warning"; title: string; body: string } | null =
    a.status === "Submitted" ? { tone: "info", title: "Waiting for the coach's decision", body: "The coach reviews your application and accepts or declines it. You can withdraw it until then." }
    : a.status === "Accepted" ? { tone: "success", title: "Application accepted", body: plan ? "Check the delivery status above for your copy of the plan." : "Your coaching service has started. Open your services to see the terms and what comes next." }
    : a.status === "Rejected" ? { tone: "warning", title: "Application not accepted", body: "The coach did not accept this application. You can apply to another offer at any time." }
    : a.status === "Withdrawn" ? { tone: "warning", title: "You withdrew this application", body: "The coach no longer reviews it. You can apply again later." }
    : null;
  const termsPanel = <Panel title="Offer terms" description={`Revision ${d.offerRevision.number} · ${a.source}`}>
    <Facts items={[
      { label: "Offer", value: a.offerName },
      { label: "Price", value: <strong>{(a.amount === 0 ? "Free" : money(a.amount, a.currency))}</strong> },
      ...(a.selectedSessionCount != null ? [{ label: "Sessions", value: a.selectedSessionCount }] : []),
      ...(selectedOption && validityDescription(selectedOption) ? [{ label: "Session validity", value: validityDescription(selectedOption) }] : []),
      { label: "Submitted", value: a.submittedAt ? new Date(a.submittedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not yet" },
    ]} />
    {d.offerRevision.teamId && <Alert title={`Team provider · ${d.offerRevision.teamName ?? "Team"}`}>{d.offerRevision.purpose === "TrainingPlan" ? "This application is for an independent plan purchase from the Team." : "This application uses organizational coaching terms."}</Alert>}
  </Panel>;
  return <><PageHeader
      title={coach ? <span className={identity.title}><Avatar name={a.applicant.displayName} size="lg" decorative /><span className={identity.identity}><span className={identity.nameLine}><span className={identity.name}>{a.applicant.displayName}</span><Badge size="sm">Applicant</Badge><StatusBadge status={a.status} /></span>{a.applicant.username ? <small>@{a.applicant.username}</small> : null}</span></span> : a.offerName}
      description={coach ? undefined : "Your coaching application"}
      // For the coach the status sits beside the name; the side of the header is for actions only.
      meta={coach ? undefined : <StatusBadge status={a.status === "InProgress" ? "NotSubmitted" : a.status} />}
      actions={!coach && !a.relationshipId && !a.allowedActions.includes("withdraw") ? undefined : <>
        {coach && <OpenConversationButton person={a.applicant} />}
        {a.relationshipId && <LinkButton href={`/app/${coach ? "clients" : "my-coaches"}/${a.relationshipId}${coach ? "" : "/services"}`}>{coach ? "Open client" : "View services"}</LinkButton>}
        {!coach && a.allowedActions.includes("withdraw") && <Button variant="danger-ghost" isDisabled={mutation.isPending} onPress={() => void confirmThen("withdraw", undefined, "Withdraw this application?", "The coach will no longer review it. You can apply again later.", "Withdraw application")}>Withdraw application</Button>}
      </>}
    />
    <div className={styles.stack}>
      {confirmDialog}
      <AlertDialog
        isOpen={accepting}
        onOpenChange={(open) => { if (!open && !mutation.isPending) setAccepting(false); }}
        title="Accept this application?"
        tone="success"
        confirmLabel="Accept"
        cancelLabel="Go back"
        isConfirming={mutation.isPending}
        onConfirm={() => mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${a.id}/accept`, ifMatch: a.version, json: { settlementMode: "Simulated", trainingPlanRevisionId } }, { onSuccess: () => {
          setAccepting(false);
          toast({ tone: "success", title: `${a.applicant.displayName} accepted`, description: plan ? (a.amount === 0 ? "The plan is on its way to your new client." : "Your client is asked to pay; the plan is delivered after payment.") : "The coaching service has started. Your client is told right away." });
        } })}
      >
        <p className={styles.prose}>{a.amount === 0 ? (plan ? `Accept this free application and deliver the selected plan to ${a.applicant.displayName}. No payment is required.` : `Start the free coaching service with ${a.applicant.displayName}. No payment is required.`) : d.offerRevision.purpose === "TrainingPlan" ? `${a.applicant.displayName} is asked to pay ${(a.amount === 0 ? "Free" : money(a.amount, a.currency))} through Metrivum. The plan is delivered after payment.` : `This starts the coaching service with ${a.applicant.displayName} on these terms, ${(a.amount === 0 ? "Free" : money(a.amount, a.currency))} paid through Metrivum.`}</p>
        <MutationError error={mutation.error} />
      </AlertDialog>
      <AlertDialog
        isOpen={rejecting}
        onOpenChange={(open) => { if (!open && !mutation.isPending) setRejecting(false); }}
        title="Reject this application?"
        tone="danger"
        confirmLabel="Reject application"
        cancelLabel="Go back"
        isConfirming={mutation.isPending}
        onConfirm={() => mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${a.id}/reject`, ifMatch: a.version, json: { internalReason: reason || null } }, { onSuccess: () => {
          setRejecting(false);
          toast({ tone: "success", title: "Application rejected", description: `${a.applicant.displayName} is told it was not accepted.` });
        } })}
      >
        <p className={styles.prose}>The applicant is told the application was not accepted.</p>
        <TextArea label="Internal reason (visible only to you)" placeholder="e.g. No capacity this quarter" value={reason} onChange={setReason} maxLength={1000} />
      </AlertDialog>
      <MutationError error={mutation.error} />
      {coach && a.status === "Submitted" && <Panel title="Decision" description={d.offerRevision.purpose === "TrainingPlan" ? (a.amount === 0 ? "Accept the application and deliver the selected plan for free." : "Accept the application and prepare the selected plan for delivery after payment.") : "Accepting starts the coaching service with these terms."} actions={<>{a.allowedActions.includes("reject") && <Button variant="danger-ghost" isDisabled={mutation.isPending} onPress={() => { setReason(""); setRejecting(true); }}>Reject application</Button>}{a.allowedActions.includes("accept") && <Button variant="success" isDisabled={mutation.isPending || (d.offerRevision.purpose === "TrainingPlan" && !trainingPlanRevisionId)} onPress={() => setAccepting(true)}>{d.offerRevision.purpose === "TrainingPlan" ? (a.amount === 0 ? "Accept and deliver plan" : "Accept and request payment") : "Accept and start service"}</Button>}</>}>
        {/* Payment always goes through the platform; only a plan purchase needs a choice here. */}
        {d.offerRevision.purpose === "TrainingPlan" ? <PlanDeliverySelector value={trainingPlanRevisionId} onChange={setTrainingPlanRevisionId} /> : null}
      </Panel>}
      {a.status === "Accepted" && d.offerRevision.purpose === "TrainingPlan" && <PlanPurchaseStatus applicationId={a.id} coach={coach} />}
      {filling ? <div className={styles.fillLayout}>
        <Panel title={d.formVersion ? "Application form" : "Submit application"} description={d.formVersion ? "Answer the questions below, then submit when you are ready." : "No questions to answer. Review the terms before submitting."}><ApplicationForm key={a.id} initial={d} /></Panel>
        <aside className={styles.fillAside} aria-label="Offer details">
          {termsPanel}
          {d.offerRevision.description ? <Panel title="About this offer"><p className={styles.prose}>{d.offerRevision.description}</p></Panel> : null}
        </aside>
      </div> : !coach ? <div className={styles.fillLayout}>
        {/* The client's view after sending: what happens next, then their answers, with the offer beside them. */}
        <div className={styles.stack}>
          {clientStatus ? <Alert tone={clientStatus.tone} title={clientStatus.title}>{clientStatus.body}</Alert> : null}
          <Panel title="Your answers" description={a.submittedAt ? `Sent ${new Date(a.submittedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : undefined}>{d.formVersion ? <AnswerReview definition={d.formVersion.definition} answers={d.answers as Answers} /> : <p className={styles.note}>No application form was required.</p>}</Panel>
        </div>
        <aside className={styles.fillAside} aria-label="Offer details">
          {termsPanel}
          {d.offerRevision.description ? <Panel title="About this offer"><p className={styles.prose}>{d.offerRevision.description}</p></Panel> : null}
        </aside>
      </div> : <>
      <PanelGrid>
        {termsPanel}
        {coach ? <Panel title="Current shared profile" description="Current values, separate from the submitted answers.">
          {profileEntries.length ? <Facts items={profileEntries.map(([name, value]) => ({ key: name, label: name.replace(/([a-z])([A-Z])/g, "$1 $2"), value: Array.isArray(value) ? value.join(", ") : value == null || value === "" ? null : String(value) }))} /> : <p className={styles.note}>The applicant shares no profile details.</p>}
        </Panel> : d.offerRevision.description ? <Panel title="About this offer"><p className={styles.prose}>{d.offerRevision.description}</p></Panel> : null}
      </PanelGrid>
      <Panel title="Submitted answers">{d.formVersion ? <AnswerReview definition={d.formVersion.definition} answers={d.answers as Answers} /> : <p className={styles.note}>No application form was required.</p>}</Panel>
      </>}
    </div>
  </>;
}

export default function Application() {
  const { applicationId } = useParams();
  return <ApplicationDetail key={applicationId} applicationId={applicationId} />;
}
