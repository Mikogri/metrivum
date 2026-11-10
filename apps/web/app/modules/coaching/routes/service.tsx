import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Service details — Metrivum");

import {
  useWorkspace,
  WorkspaceRouteGuard,
} from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { AlertDialog, Button, LinkButton, PageHeader } from "@metrivum/ui-web";
import { Facts, Panel, PanelGrid } from "~/shared/ui/Panel";
import { useProfile } from "~/modules/accounts";
import { useCoachingMutation, useCoachingQuery } from "../api";
import { Failure, Loading, MutationError, StatusBadge } from "../components";
import { money, priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function Service() {
  const uiCopy = useUiCopy();

  const { serviceId } = useParams();
  const profile = useProfile();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Schema<"RelationshipServiceDto">>(
    `/api/v1/coaching/services/${serviceId}`,
  );
  const [confirm, setConfirm] = useState(false);
  const mutation = useCoachingMutation(() => setConfirm(false));
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const s = query.data;
  const option = s.offerRevision.billingOptions.find(
    (o) => o.id === s.billingOptionId,
  );
  const coach = s.offerRevision.coachId === profile.id;
  if ((mode === "coach") !== coach)
    return (
      <WorkspaceRouteGuard required={coach ? "coach" : "client"}>
        {null}
      </WorkspaceRouteGuard>
    );
  const back = `/app/${coach ? "clients" : "my-coaches"}/${s.relationshipId}${coach ? "?tab=overview" : "/services"}`;
  return (
    <>
      <PageHeader
        title={s.offerName}
        description={formatInterfaceText(uiCopy["ui"]["Started {0}"], [
          new Date(s.startedAt).toLocaleDateString(),
        ])}
        meta={<StatusBadge status={s.status} />}
        actions={
          <>
            <LinkButton href={back}>
              {coach
                ? uiCopy["ui"]["Open client"]
                : uiCopy["ui"]["All services"]}
            </LinkButton>
            {s.allowedActions.includes("complete") && (
              <Button variant="danger-ghost" onPress={() => setConfirm(true)}>
                {uiCopy["ui"]["Complete service"]}
              </Button>
            )}
          </>
        }
      />
      <MutationError error={mutation.error} />
      <PanelGrid>
        <Panel
          title={uiCopy["ui"]["Accepted terms"]}
          description={formatInterfaceText(uiCopy["ui"]["Offer revision {0}"], [
            s.offerRevision.number,
          ])}
        >
          <Facts
            items={[
              {
                label: uiCopy["ui"]["Price"],
                value: <strong>{money(s.amount, s.currency)}</strong>,
              },
              ...(option
                ? [
                    {
                      label: option.name,
                      value: priceDescription(option, s.currency),
                    },
                  ]
                : []),
              ...(s.selectedSessionCount != null
                ? [
                    {
                      label: uiCopy["ui"]["Sessions"],
                      value: s.selectedSessionCount,
                    },
                  ]
                : []),
              {
                label: uiCopy["ui"]["Mode"],
                value:
                  s.offerRevision.coachingMode === "Offline"
                    ? "In person"
                    : s.offerRevision.coachingMode,
              },
              {
                label: uiCopy["ui"]["Started"],
                value: new Date(s.startedAt).toLocaleDateString(),
              },
              ...(s.completedAt
                ? [
                    {
                      label: uiCopy["video"]["detail"]["completed"],
                      value: new Date(s.completedAt).toLocaleDateString(),
                    },
                  ]
                : []),
            ]}
          />
        </Panel>
        <Panel title={uiCopy["ui"]["Billing"]}>
          <Facts
            items={
              s.currentBilling
                ? [
                    {
                      label: uiCopy["usage"]["colState"],
                      value: <StatusBadge status={s.currentBilling.status} />,
                    },
                    ...(s.currentBilling.validUntil
                      ? [
                          {
                            label: s.currentBilling.isExpired
                              ? "Sessions expired"
                              : "Use sessions before",
                            value: new Date(
                              s.currentBilling.validUntil,
                            ).toLocaleString(),
                          },
                        ]
                      : []),
                    {
                      label: uiCopy["ui"]["Current period"],
                      value: s.currentBilling.periodStart
                        ? `${new Date(s.currentBilling.periodStart).toLocaleDateString()}${s.currentBilling.periodEnd ? ` – ${new Date(s.currentBilling.periodEnd).toLocaleDateString()}` : ""}`
                        : "—",
                    },
                    {
                      label: uiCopy["ui"]["Next due"],
                      value:
                        s.currentBilling.nextDueAt &&
                        s.currentBilling.nextDueAmount != null &&
                        s.currentBilling.currency
                          ? `${money(s.currentBilling.nextDueAmount, s.currentBilling.currency)} · ${new Date(s.currentBilling.nextDueAt).toLocaleDateString()}`
                          : "—",
                    },
                    ...(s.currentBilling.remainingSessions != null
                      ? [
                          {
                            label: uiCopy["ui"]["Sessions left"],
                            value: s.currentBilling.remainingSessions,
                          },
                        ]
                      : []),
                  ]
                : [
                    {
                      label: uiCopy["usage"]["colState"],
                      value: "No payment due recorded",
                    },
                  ]
            }
          />
        </Panel>
      </PanelGrid>
      {s.offerRevision.description ? (
        <Panel title={uiCopy["ui"]["About this offer"]}>
          <p className={styles.prose}>{s.offerRevision.description}</p>
        </Panel>
      ) : null}
      <AlertDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={uiCopy["ui"]["Complete this service?"]}
        tone="danger"
        confirmLabel={uiCopy["ui"]["Complete service"]}
        cancelLabel={uiCopy["ui"]["Keep active"]}
        isConfirming={mutation.isPending}
        onConfirm={() =>
          mutation.mutate({
            method: "POST",
            path: `/api/v1/coaching/services/${s.id}/complete`,
            ifMatch: s.version,
          })
        }
      >
        {
          uiCopy["ui"][
            "Future subscription periods will stop. Existing orders and payment history remain available."
          ]
        }
        <MutationError error={mutation.error} />
      </AlertDialog>
    </>
  );
}
