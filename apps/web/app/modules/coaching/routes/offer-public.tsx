import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Coaching offer — Metrivum");

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Alert, Button, NumberInput, Option, PageHeader, Select } from "@metrivum/ui-web";
import { Facts, Panel } from "~/shared/ui/Panel";
import { profileKey, useProfile } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError } from "../components";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

type OfferRevision = Schema<"OfferRevisionDto">;

export function StartApplication({ offer, invitationId, preselected }: { offer: OfferRevision; invitationId?: string; preselected?: string | null }) {
  const uiCopy = useUiCopy();

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
  if (profile.id === offer.coachId) return <Alert title={uiCopy["ui"]["This is your offer"]}>{uiCopy["ui"]["Share this page with a client to receive an application."]}</Alert>;
  if (!profile.roles.includes("Client")) return <div className={styles.stack}><Alert title={uiCopy["ui"]["Enable your client profile to apply"]}>{uiCopy["ui"]["You can be both a coach and a client on this account."]}</Alert><Button loading={enable.isPending} onPress={() => enable.mutate({ method: "POST", path: "/api/v1/me/roles/client" })}>{uiCopy["ui"]["Enable client profile"]}</Button><MutationError error={enable.error} /></div>;
  if (!canApply.allowed) return <Alert title={uiCopy["ui"]["Applications are unavailable"]}>{uiCopy["ui"]["Your account needs permission to submit coaching applications."]}</Alert>;
  return <form className={styles.form} onSubmit={(e) => { e.preventDefault(); start.mutate({ method: "POST", path: "/api/v1/coaching/applications", json: { offerId: offer.offerId, billingOptionId: optionId, selectedSessionCount: selected?.model === "CustomPackage" ? Math.max(sessions, selected.minSessions ?? 1) : null, invitationId: invitationId ?? null } }); }}>
    {offer.teamId && <Alert title={`${offer.purpose === "TrainingPlan" ? "Team offer" : "Organizational coaching"} · ${offer.teamName ?? "Team"}`}>{offer.purpose === "TrainingPlan" ? uiCopy["ui"]["You are buying an independent training plan copy from this Team. No coaching relationship is created."] : uiCopy["ui"]["This offer creates a Team-owned coaching case. Authorized assigned coaches may work with you within the organization. You will review and accept this scope before submitting your application."]}</Alert>}
    <Select label={uiCopy["ui"]["Billing option"]} placeholder={uiCopy["ui"]["Choose an option"]} isRequired isDisabled={Boolean(preselected) || start.isPending} selectedKey={optionId || null} onSelectionChange={(key) => { const id = String(key); setOption(id); setSessions(offer.billingOptions.find((o) => o.id === id)?.minSessions ?? 1); }}>{offer.billingOptions.map((o) => <Option key={o.id} id={o.id} textValue={o.name}>{`${o.name} — ${priceDescription(o, offer.currency)}`}</Option>)}</Select>
    {selected?.model === "CustomPackage" && <NumberInput label={uiCopy["ui"]["Number of sessions"]} placeholder="e.g. 8" isRequired minValue={selected.minSessions ?? 1} maxValue={selected.maxSessions ?? undefined} step={1} value={Math.max(sessions, selected.minSessions ?? 1)} onChange={(value) => setSessions(Number.isFinite(value) ? value : selected.minSessions ?? 1)} />}
    <MutationError error={start.error} /><Button type="submit" variant="primary" isDisabled={!selected} loading={start.isPending}>{invitationId && offer.applicationFormVersionId ? uiCopy["ui"]["Fill out the form"] : uiCopy["ui"]["Start application"]}</Button><p className={styles.note}>{offer.applicationFormVersionId ? uiCopy["ui"]["You will review the questions and submit your application next."] : uiCopy["ui"]["No application form required. Review the terms and submit your application next."]}</p>
  </form>;
}

export default function PublicOffer() {
  const uiCopy = useUiCopy();

  const { coachId, offerId } = useParams();
  const query = useCoachingQuery<OfferRevision>(`/api/v1/coaches/${coachId}/offers/${offerId}`);
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  const offer = query.data;
  return <><PageHeader title={offer.name} description={formatInterfaceText(uiCopy["ui"]["{0} coaching{1}"], [offer.coachingMode === "Offline" ? "In person" : offer.coachingMode,offer.teamName ? ` · ${offer.teamName}` : ""])} meta={offer.tags.length ? <span className={styles.chips}>{offer.tags.map((tag) => <span key={tag} className={styles.chip}>#{tag}</span>)}</span> : undefined} />
    <div className={styles.offerLayout}>
      <div className={styles.stack}>
        {offer.description ? <Panel title={uiCopy["ui"]["About this offer"]}><p className={styles.prose}>{offer.description}</p></Panel> : null}
        <Panel title={uiCopy["ui"]["Pricing"]}><Facts items={offer.billingOptions.map((o) => ({ key: o.id, label: o.name, value: <span className={styles.priceCell}>{priceDescription(o, offer.currency)}<small>{o.price === 0 ? uiCopy["ui"]["No payment required"] : `${o.paymentTerms?.rule ?? "Upfront"} payment`}</small></span> }))} /></Panel>
      </div>
      <Panel title={uiCopy["ui"]["Apply for coaching"]}><StartApplication offer={offer} /></Panel>
    </div></>;
}
