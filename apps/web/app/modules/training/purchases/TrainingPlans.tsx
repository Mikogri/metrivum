import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { usePaymentActionId } from "~/shared/session/payment-action";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Training plans — Metrivum");

import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Navigate } from "react-router";
import { ShoppingBag } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogFooter,
  LinkButton,
  Segment,
  SegmentedControl,
  toast,
  useMobileLayout,
} from "@metrivum/ui-web";
import { Panel } from "~/shared/ui/Panel";
import {
  useCoachingMutation,
  useCoachingQuery,
  type Page,
  Failure,
  ListPagination,
  Loading,
  money,
} from "~/modules/coaching";
import { AssignmentList } from "../delivery/Assignments";
import styles from "../delivery/delivery.module.css";

type Purchase = Schema<"PurchasedPlanDto">;
function PurchasePayment({
  purchase,
  close,
}: {
  purchase: Purchase;
  close: () => void;
}) {
  const uiCopy = useUiCopy();

  const query = useCoachingQuery<Schema<"PaymentDueDto">>(
    `/api/v1/me/plan-purchases/${purchase.orderId}/due`,
  );
  const [key] = usePaymentActionId(`purchase:${purchase.orderId}`);
  const pay = useCoachingMutation<Schema<"PaymentResultDto">>((result) => {
    if (result.due.status === "AwaitingPayment") {
      toast({
        tone: "danger",
        title: uiCopy["ui"]["Payment failed. Your plan remains locked."],
      });
      return;
    }
    toast({
      tone: "success",
      title: uiCopy["ui"]["Your plan is now available"],
    });
    close();
  });
  return (
    <Dialog
      isOpen
      title={uiCopy["ui"]["Purchase training plan"]}
      onOpenChange={(open) => {
        if (!open && !pay.isPending) close();
      }}
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} />
      ) : (
        <>
          <p>
            {purchase.name} · {money(query.data.amount, query.data.currency)}
          </p>
          <p>
            {
              uiCopy["ui"][
                "You receive an independent copy after payment. Future changes by the coach do not update your copy."
              ]
            }
          </p>
          {query.data.status !== "AwaitingPayment" ? (
            <Alert tone="success" title={uiCopy["ui"]["Nothing to pay"]}>
              {
                uiCopy["ui"][
                  "This plan is already paid or no longer awaiting payment."
                ]
              }
            </Alert>
          ) : query.data.settlementMode === "External" ? (
            <Alert tone="info" title={uiCopy["ui"]["Paid outside Metrivum"]}>
              {
                uiCopy["ui"][
                  "Pay your coach as agreed. The plan unlocks when your coach confirms the payment."
                ]
              }
            </Alert>
          ) : (
            <p className={styles.hint}>
              {uiCopy["ui"]["Test payment — no real money is charged."]}
            </p>
          )}
          {pay.error && (
            <Alert
              tone="danger"
              live="assertive"
              title={uiCopy["ui"]["Payment did not go through"]}
            >
              {pay.error instanceof Error
                ? pay.error.message
                : uiCopy["ui"]["Try again in a moment."]}
            </Alert>
          )}
          <DialogFooter>
            <Button isDisabled={pay.isPending} onPress={close}>
              {uiCopy["common"]["cancel"]}
            </Button>
            <Button
              variant="primary"
              loading={pay.isPending}
              isDisabled={
                query.data.settlementMode === "External" ||
                query.data.status !== "AwaitingPayment"
              }
              onPress={() =>
                pay.mutate({
                  method: "POST",
                  path: `/api/v1/me/payment-dues/${query.data.id}/pay`,
                  json: { paymentMethodId: null, idempotencyKey: key },
                })
              }
            >
              {uiCopy["ui"]["Pay"]}{" "}
              {money(query.data.amount, query.data.currency)}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
function PurchasedPlans() {
  const uiCopy = useUiCopy();

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Purchase | null>(null);
  const query = useCoachingQuery<Page<Purchase>>("/api/v1/training/purchases", {
    page,
    pageSize: 20,
  });
  return (
    <Panel
      title={uiCopy["ui"]["Purchased plans"]}
      description={
        uiCopy["ui"][
          "Independent copies you own. Coach changes never update them."
        ]
      }
      icon={<ShoppingBag />}
      tone="violet"
      flush
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <p className={styles.panelEmpty}>
          {
            uiCopy["ui"][
              "No purchased plans yet. Plans accepted by your coach appear here; pay to unlock your copy."
            ]
          }
        </p>
      ) : (
        <>
          <ul className={styles.rows}>
            {query.data.items.map((purchase) => (
              <li key={purchase.orderId} className={styles.itemRow}>
                <div className={styles.itemMain}>
                  <span className={styles.itemTitle}>{purchase.name}</span>
                  <span className={styles.itemMeta}>
                    {purchase.planId
                      ? uiCopy["ui"]["Owned copy · not updated by the seller"]
                      : uiCopy["ui"][
                          "Content stays locked until the payment is complete"
                        ]}
                  </span>
                </div>
                <div className={styles.itemSide}>
                  <Badge
                    size="sm"
                    dot
                    tone={purchase.planId ? "success" : "warning"}
                  >
                    {purchase.planId
                      ? uiCopy["ui"]["Owned"]
                      : uiCopy["ui"]["Awaiting payment"]}
                  </Badge>
                  {purchase.planId ? (
                    <LinkButton
                      size="sm"
                      href={`/app/training-plans/${purchase.planId}`}
                    >
                      {uiCopy["ui"]["Open plan"]}
                    </LinkButton>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onPress={() => setSelected(purchase)}
                    >
                      {uiCopy["ui"]["Pay to unlock"]}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {Number(query.data.total) > Number(query.data.pageSize) && (
            <ListPagination data={query.data} onChange={setPage} />
          )}
        </>
      )}
      {selected && (
        <PurchasePayment purchase={selected} close={() => setSelected(null)} />
      )}
    </Panel>
  );
}

/** The "Training plans" tab of Training: plans assigned by a coach and purchased copies, together or one kind at a time. */
export function TrainingPlansTab({
  relationshipId,
}: {
  relationshipId?: string;
}) {
  const uiCopy = useUiCopy();

  const mobile = useMobileLayout();
  const [filter, setFilter] = useState("all");
  return (
    <div className={styles.stack}>
      {!mobile && (
        <SegmentedControl
          size="sm"
          className={styles.planFilter}
          aria-label={uiCopy["ui"]["Plan type"]}
          selectedKeys={[filter]}
          onSelectionChange={(keys) => {
            const key = [...keys][0];
            if (key) setFilter(String(key));
          }}
        >
          <Segment id="all">{uiCopy["ui"]["All plans"]}</Segment>
          <Segment id="assigned">{uiCopy["ui"]["Assigned by coach"]}</Segment>
          <Segment id="purchased">{uiCopy["ui"]["Purchased"]}</Segment>
        </SegmentedControl>
      )}
      {(mobile || filter !== "purchased") && (
        <AssignmentList relationshipId={relationshipId} coach={false} />
      )}
      {(mobile || filter !== "assigned") && <PurchasedPlans />}
    </div>
  );
}

/** Old address of the plans list: it now lives as a tab of Training. */
export default function TrainingPlans() {
  return <Navigate to="/app/my-training?tab=plans" replace />;
}
