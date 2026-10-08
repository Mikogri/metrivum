import { HubNavigation } from "~/shared/navigation/HubNavigation";
import { useWorkspace, WorkspaceRouteGuard } from "~/shared/session/WorkspaceScope";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, Checkbox, PageHeader, TextArea } from "@trainflow/ui-web";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { profileKey } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { DraftNavigationGuard, Failure, Loading, MutationError, StatusBadge } from "../components";
import { AnswerReview, FormAnswerFields, type Answers } from "../form-fields";
import { money } from "../pricing";
import styles from "../coaching.module.css";

type Detail = Schema<"ApplicationDetailDto">;
type CoachDetail = Schema<"CoachApplicationDetailDto">;
function initialAnswers(detail: Detail): Answers {
  const prefill: Answers = {};
  for (const q of detail.formVersion.definition.sections.flatMap((s) => s.questions)) {
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
  if (!dirty && (initial.application.version !== current.application.version || initial.profileVersion !== current.profileVersion)) {
    setCurrent(initial); setAnswers(initialAnswers(initial));
  }
  const mutation = useCoachingMutation<Detail>((value) => {
    setCurrent(value); setDirty(false);
    if (value.application.status === "Submitted" && saveProfile) void cache.invalidateQueries({ queryKey: profileKey(account) });
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const mapped = initial.formVersion.definition.sections.flatMap((s) => s.questions).filter((q) => q.systemField && answers[q.key] !== undefined).map((q) => q.systemField!);
  return <form className={styles.stack} onSubmit={(e) => { e.preventDefault(); if (current.offerRevision.teamId && !acceptTeamScope) return; mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${current.application.id}/submit`, ifMatch: current.application.version, json: { answers, saveProfileFields: saveProfile ? mapped : [], profileVersion: saveProfile ? current.profileVersion : null, acceptTeamScope } }); }}>
    <DraftNavigationGuard dirty={dirty} />
    <Alert title="Your draft is private">Your coach receives these answers only when you submit this application.</Alert>
    {dirty && initial.profileVersion !== current.profileVersion && <Alert tone="warning" title="Your personal profile changed" actions={<Button isDisabled={mutation.isPending} onPress={() => setCurrent({ ...current, profileVersion: initial.profileVersion, profilePrefill: initial.profilePrefill })}>Use latest profile version</Button>}>Your application answers have been kept. Review them before saving them over the latest profile values.</Alert>}
    <FormAnswerFields definition={current.formVersion.definition} answers={answers} disabled={mutation.isPending} onChange={(value) => { setAnswers(value); setDirty(true); }} />
    {mapped.length > 0 && <Checkbox isSelected={saveProfile} isDisabled={mutation.isPending} onChange={(value) => { setSaveProfile(value); setDirty(true); }}>Also save the mapped answers to my personal profile</Checkbox>}
    {current.offerRevision.teamId && <Alert title={`Team coaching provider: ${current.offerRevision.teamName ?? "Team"}`}><p>Your new coaching case belongs to this organization. Authorized assigned coaches can access its Team-scoped records. Existing private coaching history is not transferred. Leaving or dissolving the Team does not automatically create a private coaching relationship.</p><Checkbox isRequired isSelected={acceptTeamScope} isDisabled={mutation.isPending} onChange={value => { setAcceptTeamScope(value); setDirty(true); }}>I accept {current.offerRevision.teamName ?? "this Team"} as my organizational coaching provider and consent to the Team-owned case and authorized coach assignments.</Checkbox></Alert>}
    <MutationError error={mutation.error} />
    <div className={styles.actions}><Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={!!current.offerRevision.teamId && !acceptTeamScope}>Submit application</Button><Button isDisabled={mutation.isPending} onPress={() => mutation.mutate({ method: "PUT", path: `/api/v1/coaching/applications/${current.application.id}`, ifMatch: current.application.version, json: { answers } })}>Save draft</Button></div>
  </form>;
}

function ApplicationDetail({ applicationId }: { applicationId: string | undefined }) {
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Detail | CoachDetail>(`/api/v1/coaching/applications/${applicationId}`);
  const [reason, setReason] = useState("");
  const [settlementMode, setSettlement] = useState("Simulated");
  const mutation = useCoachingMutation();
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const response = query.data;
  const coach = "detail" in response;
  if ((mode === "coach") !== coach) return <WorkspaceRouteGuard required={coach ? "coach" : "client"}>{null}</WorkspaceRouteGuard>;
  const d = "detail" in response ? response.detail : response;
  const a = d.application;
  const action = (kind: string, json?: unknown) => mutation.mutate({ method: "POST", path: `/api/v1/coaching/applications/${a.id}/${kind}`, ifMatch: a.version, json });
  return <><PageHeader title={a.offerName} description={coach ? `Application from ${a.applicant.displayName}` : "Your coaching application"} actions={<StatusBadge status={a.status} />} /><HubNavigation />
    <div className={styles.stack}><section className={styles.panel}><div className={styles.row}><h2>{money(a.amount, a.currency)}</h2><span className={styles.muted}>Offer revision {d.offerRevision.number} · {a.source}</span></div>{d.offerRevision.description && <p>{d.offerRevision.description}</p>}{d.offerRevision.teamId && <Alert title={`Team-owned coaching · ${d.offerRevision.teamName ?? "Team"}`}>This application uses organizational coaching terms.</Alert>}</section>
      {!coach && a.status === "InProgress" ? <ApplicationForm key={a.id} initial={d} /> : <section className={styles.panel}><h2>Submitted answers</h2><AnswerReview definition={d.formVersion.definition} answers={d.answers as Answers} /></section>}
      <MutationError error={mutation.error} />
      {coach && a.status === "Submitted" && <section className={styles.panel}><h2>Decision</h2><label className={styles.field}>Settlement<select value={settlementMode} onChange={(e) => setSettlement(e.target.value)}><option value="Simulated">Simulated payment — no real money</option><option value="External">External settlement</option></select></label><TextArea label="Internal rejection reason (optional)" placeholder="Only you see this" value={reason} onChange={setReason} maxLength={1000} /><div className={styles.actions}>{a.allowedActions.includes("accept") && <Button variant="primary" loading={mutation.isPending} onPress={() => action("accept", { settlementMode })}>Accept and start service</Button>}{a.allowedActions.includes("reject") && <Button isDisabled={mutation.isPending} onPress={() => action("reject", { internalReason: reason || null })}>Reject application</Button>}</div></section>}
      {!coach && a.allowedActions.includes("withdraw") && <Button isDisabled={mutation.isPending} onPress={() => action("withdraw")}>Withdraw application</Button>}
      {a.relationshipId && <Link to={`/app/${coach ? "clients" : "my-coaches"}/${a.relationshipId}/services`}>View coaching services</Link>}
      {"detail" in response && <section className={styles.panel}><h2>Current shared profile</h2><p className={styles.muted}>These current values are separate from the submitted answers above.</p><dl className={styles.list}>{Object.entries(response.currentAllowedProfile).map(([name, value]) => <div key={name}><dt className={styles.muted}>{name}</dt><dd>{Array.isArray(value) ? value.join(", ") : String(value ?? "—")}</dd></div>)}</dl></section>}
    </div>
  </>;
}

export default function Application() {
  const { applicationId } = useParams();
  return <ApplicationDetail key={applicationId} applicationId={applicationId} />;
}
