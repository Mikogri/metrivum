import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, PageHeader } from "@trainflow/ui-web";
import { profileKey, useProfile } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError } from "../components";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

type OfferRevision = Schema<"OfferRevisionDto">;

export function StartApplication({ offer, invitationId, preselected }: { offer: OfferRevision; invitationId?: string; preselected?: string | null }) {
  const profile = useProfile();
  const account = useAccountKey();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const canApply = useFeatureAccess("coaching.applications.submit-own");
  const [optionId, setOption] = useState(preselected ?? (offer.billingOptions.length === 1 ? offer.billingOptions[0]!.id : ""));
  const [sessions, setSessions] = useState(1);
  const selected = offer.billingOptions.find((o) => o.id === optionId);
  const start = useCoachingMutation<Schema<"ApplicationDetailDto">>((value) => navigate(`/app/applications/${value.application.id}`));
  const enable = useCoachingMutation(async () => { await cache.invalidateQueries({ queryKey: profileKey(account) }); await cache.invalidateQueries({ queryKey: [account, "access"] }); });
  if (profile.id === offer.coachId) return <Alert title="This is your offer">Share this page with a client to receive an application.</Alert>;
  if (!profile.roles.includes("Client")) return <div className={styles.stack}><Alert title="Enable your client profile to apply">You can be both a coach and a client on this account.</Alert><Button loading={enable.isPending} onPress={() => enable.mutate({ method: "POST", path: "/api/v1/me/roles/client" })}>Enable client profile</Button><MutationError error={enable.error} /></div>;
  if (!canApply.allowed) return <Alert title="Applications are unavailable">Your account needs permission to submit coaching applications.</Alert>;
  return <form className={styles.form} onSubmit={(e) => { e.preventDefault(); start.mutate({ method: "POST", path: "/api/v1/coaching/applications", json: { offerId: offer.offerId, billingOptionId: optionId, selectedSessionCount: selected?.model === "CustomPackage" ? Math.max(sessions, selected.minSessions ?? 1) : null, invitationId: invitationId ?? null } }); }}>
    {offer.teamId && <Alert title={`Organizational coaching · ${offer.teamName ?? "Team"}`}>This offer creates a Team-owned coaching case. Authorized assigned coaches may work with you within the organization. You will review and accept this scope before submitting your application.</Alert>}
    <label className={styles.field}>Choose your billing option<select required value={optionId} disabled={Boolean(preselected) || start.isPending} onChange={(e) => { setOption(e.target.value); setSessions(offer.billingOptions.find((o) => o.id === e.target.value)?.minSessions ?? 1); }}><option value="">Choose an option</option>{offer.billingOptions.map((o) => <option key={o.id} value={o.id}>{o.name} — {priceDescription(o, offer.currency)}</option>)}</select></label>
    {selected?.model === "CustomPackage" && <label className={styles.field}>Number of sessions<input type="number" required min={selected.minSessions ?? 1} max={selected.maxSessions ?? undefined} step={1} value={Math.max(sessions, selected.minSessions ?? 1)} onChange={(e) => setSessions(Number(e.target.value))} /></label>}
    <MutationError error={start.error} /><Button type="submit" variant="primary" isDisabled={!selected} loading={start.isPending}>Start application</Button><p className={styles.muted}>You will review the questions and submit your application next.</p>
  </form>;
}

export default function PublicOffer() {
  const { coachId, offerId } = useParams();
  const query = useCoachingQuery<OfferRevision>(`/api/v1/coaches/${coachId}/offers/${offerId}`);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const offer = query.data;
  return <><PageHeader title={offer.name} description={`${offer.coachingMode} · ${offer.category}`} /><div className={styles.grid}><section className={styles.panel}><h2>About this offer</h2><p>{offer.description}</p><div className={styles.actions}>{offer.tags.map((tag) => <span key={tag} className={styles.muted}>#{tag}</span>)}</div>{offer.billingOptions.map((o) => <div key={o.id} className={styles.item}><h3>{o.name}</h3><p>{priceDescription(o, offer.currency)}</p><p className={styles.muted}>Payment: {o.paymentTerms?.rule ?? "Upfront"}</p></div>)}</section><section className={styles.panel}><h2>Apply for coaching</h2><StartApplication offer={offer} /></section></div></>;
}
