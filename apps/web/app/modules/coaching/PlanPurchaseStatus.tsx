import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Button, LinkButton } from "@metrivum/ui-web";
import { Panel } from "~/shared/ui/Panel";
import { useCoachingQuery } from "./api";
import { Failure, Loading, StatusBadge } from "./components";
import { ExternalSettlement } from "./settlements";
import { money } from "./pricing";
export function PlanPurchaseStatus({ applicationId, coach }: { applicationId: string; coach: boolean }) {
  const due = useCoachingQuery<Schema<"PaymentDueDto">>(`/api/v1/me/plan-purchases/by-application/${applicationId}/due`);
  const [confirm, setConfirm] = useState(false);
  return <Panel title="Plan purchase">{due.isPending ? <Loading /> : due.isError ? <Failure error={due.error} /> : <>
    <p>{money(due.data.amount, due.data.currency)} · <StatusBadge status={due.data.status} /></p>
    {coach ? due.data.status === "AwaitingPayment" && due.data.settlementMode === "External" ? <Button onPress={() => setConfirm(true)}>Confirm external payment</Button> : <p>{due.data.status === "AwaitingPayment" ? "The copy will be delivered after payment." : "The independent copy has been delivered."}</p> : <LinkButton href="/app/training-plans">Open training plans</LinkButton>}
    {confirm && <ExternalSettlement due={due.data} close={() => setConfirm(false)} />}
  </>}</Panel>;
}
