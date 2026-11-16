import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Button, LinkButton } from "@portable-ui/react";
import { Panel } from "~/shared/ui/Panel";
import { useCoachingQuery } from "./api";
import { Failure, Loading, StatusBadge } from "./components";
import { ExternalSettlement } from "./settlements";
import { money } from "./pricing";
export function PlanPurchaseStatus({
  applicationId,
  coach,
}: {
  applicationId: string;
  coach: boolean;
}) {
  const uiCopy = useUiCopy();

  const due = useCoachingQuery<Schema<"PaymentDueDto">>(
    `/api/v1/me/plan-purchases/by-application/${applicationId}/due`,
  );
  const [confirm, setConfirm] = useState(false);
  return (
    <Panel title={uiCopy["ui"]["Plan purchase"]}>
      {due.isPending ? (
        <Loading />
      ) : due.isError ? (
        <Failure error={due.error} />
      ) : (
        <>
          <p>
            {money(due.data.amount, due.data.currency)} ·{" "}
            <StatusBadge status={due.data.status} />
          </p>
          {coach ? (
            due.data.status === "AwaitingPayment" &&
            due.data.settlementMode === "External" ? (
              <Button onPress={() => setConfirm(true)}>
                {uiCopy["ui"]["Confirm external payment"]}
              </Button>
            ) : (
              <p>
                {due.data.status === "AwaitingPayment"
                  ? uiCopy["ui"]["The copy will be delivered after payment."]
                  : uiCopy["ui"]["The independent copy has been delivered."]}
              </p>
            )
          ) : (
            <LinkButton href="/app/training-plans">
              {uiCopy["ui"]["Open training plans"]}
            </LinkButton>
          )}
          {confirm && (
            <ExternalSettlement
              due={due.data}
              close={() => setConfirm(false)}
            />
          )}
        </>
      )}
    </Panel>
  );
}
