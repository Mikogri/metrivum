import type { ReactNode } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Avatar, Button, Dialog, LinkButton, toast } from "@trainflow/ui-web";
import { Facts } from "~/shared/ui/Panel";
import { useFeatureAccess, useFeatureReasonText } from "~/shared/access";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery } from "./api";
import { Failure, Loading, MutationError, StatusBadge } from "./components";
import { StartApplication } from "./routes/offer-public";
import { priceDescription } from "./pricing";
import { invitationNotice } from "./invitation-notice";
import styles from "./chat-previews.module.css";

type OfferRevision = Schema<"OfferRevisionDto">;

const modeLabel = (mode: string) => `${mode === "Offline" ? "In person" : mode} coaching`;
const when = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section}><h3 className={styles.sectionTitle}>{title}</h3>{children}</section>;
}

function OfferSummary({ offer, billingOptionId }: { offer: OfferRevision; billingOptionId?: string | null }) {
  const options = offer.billingOptions.filter((o) => !billingOptionId || o.id === billingOptionId);
  return <>
    <div className={styles.offerHead}>
      <strong className={styles.offerName}>{offer.name}</strong>
      <span className={styles.muted}>{modeLabel(offer.coachingMode)}{offer.teamName ? ` · ${offer.teamName}` : ""}</span>
      {offer.tags.length ? <span className={styles.tags}>{offer.tags.map((tag) => <span key={tag} className={styles.tag}>#{tag}</span>)}</span> : null}
    </div>
    {offer.description ? <p className={styles.prose}>{offer.description}</p> : null}
    <Section title="Pricing">
      <ul className={styles.options}>
        {options.map((o) => {
          const [price, ...rest] = priceDescription(o, offer.currency).split(" / ");
          return <li key={o.id} className={styles.option}>
            <span className={styles.optionText}><strong>{o.name}</strong><small>{o.price === 0 ? "No payment required" : ({ Upfront: "Paid upfront", OnStart: "Paid when coaching starts" } as Record<string, string>)[o.paymentTerms?.rule ?? "Upfront"] ?? `${o.paymentTerms?.rule} payment`}</small></span>
            <span className={styles.optionPrice}><strong>{price}</strong>{rest.length ? <small>/ {rest.join(" / ")}</small> : null}</span>
          </li>;
        })}
      </ul>
    </Section>
  </>;
}

/** An invitation opened from the chat: its terms and the reply actions, without leaving the conversation. */
export function InvitationDialog({ invitationId, close }: { invitationId: string; close: () => void }) {
  const profile = useProfile();
  const apply = useFeatureAccess("coaching.applications.submit-own");
  const reason = useFeatureReasonText();
  const query = useCoachingQuery<Schema<"InvitationDto">>(`/api/v1/coaching/invitations/${invitationId}`);
  const mutation = useCoachingMutation();
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const i = query.data;
  const coach = i ? profile.id === i.coachId : false;
  const person = i ? (coach ? i.target : i.coach) : null;
  const actions = i?.allowedActions.filter((a) => ["accept", "decline", "revoke"].includes(a)) ?? [];
  const act = (action: string) => i && mutation.mutate({ method: "POST", path: `/api/v1/coaching/invitations/${i.id}/${action}`, ifMatch: i.version }, { onSuccess: () => { const notice = invitationNotice[action]; if (notice) toast({ tone: "success", ...notice }); } });
  const canStart = Boolean(i && !i.applicationId && !coach && i.status === "Accepted");
  return <>
    <Dialog
      isOpen
      size="md"
      title="Coaching invitation"
      description={i ? i.offerRevision.name : undefined}
      isDismissable={!mutation.isPending}
      onOpenChange={(open) => { if (!open) close(); }}
      footer={i && (actions.length || i.applicationId) ? () => <>
        {actions.filter((a) => a !== "accept").map((action) => <Button key={action} variant="danger-ghost" isDisabled={mutation.isPending} onPress={async () => { if (await ask(action === "revoke" ? { title: "Revoke this invitation?", body: "The client can no longer accept it. You can send a new invitation later.", confirmLabel: "Revoke invitation", cancelLabel: "Keep invitation" } : { title: "Decline this invitation?", body: "The coach is told you declined. You can still apply to their offers later.", confirmLabel: "Decline invitation", cancelLabel: "Keep invitation" })) act(action); }}>{action === "revoke" ? "Revoke invitation" : "Decline"}</Button>)}
        {i.applicationId ? <LinkButton href={`/app/applications/${i.applicationId}`}>Open application</LinkButton> : null}
        {actions.includes("accept") ? <Button variant="success" loading={mutation.isPending} onPress={() => act("accept")}>Accept invitation</Button> : null}
      </> : undefined}
    >
      {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : i && person ? <div className={styles.stack}>
        <div className={styles.person}>
          <Avatar name={person.displayName} size="lg" decorative />
          <span className={styles.personText}>
            <strong>{person.displayName}</strong>
            <small>{coach ? "Invited client" : "Coach"}{person.username ? ` · @${person.username}` : ""}</small>
          </span>
          <StatusBadge status={i.status} />
        </div>
        {i.message ? <blockquote className={styles.quote}>{i.message}</blockquote> : null}
        <Facts items={[
          { label: "Sent", value: when(i.createdAt) },
          { label: "Responded", value: i.respondedAt ? when(i.respondedAt) : "Waiting for a response" },
        ]} />
        <Section title="Offer"><OfferSummary offer={i.offerRevision} billingOptionId={i.billingOptionId} /></Section>
        {canStart ? <Section title={i.offerRevision.applicationFormVersionId ? "Application form" : "Application"}>{i.allowedActions.includes("apply") && apply.allowed ? <StartApplication offer={i.offerRevision} invitationId={i.id} preselected={i.billingOptionId} /> : <Alert title="Application is currently unavailable">{reason(apply)}</Alert>}</Section> : <p className={styles.note}>These offer terms are reserved in this invitation. Accepting lets {coach ? "the client" : "you"} submit an application.</p>}
        <MutationError error={mutation.error} />
      </div> : null}
    </Dialog>
    {confirmDialog}
  </>;
}

/** An application form shared in the chat: the offer and the start of the application, in place. */
export function OfferDialog({ coachId, offerId, close }: { coachId: string; offerId: string; close: () => void }) {
  const query = useCoachingQuery<OfferRevision>(`/api/v1/coaches/${coachId}/offers/${offerId}`);
  return <Dialog isOpen size="md" title={query.data?.applicationFormVersionId ? "Application form" : "Application"} onOpenChange={(open) => { if (!open) close(); }}>
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : <div className={styles.stack}>
      <OfferSummary offer={query.data} />
      <Section title="Apply for coaching"><StartApplication offer={query.data} /></Section>
    </div>}
  </Dialog>;
}
