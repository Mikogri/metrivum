import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import {
  usePaymentActionId,
  usePaymentQuote,
} from "~/shared/session/payment-action";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DataTable, LinkButton } from "@metrivum/ui-web";
import {
  Failure,
  Loading,
  MutationError,
  money,
  useCoachingMutation,
  useCoachingQuery,
} from "~/modules/coaching";
import { useAccountKey } from "~/shared/session/AccountScope";
import styles from "./routes/subscription.module.css";
import { catalogLimit, type CatalogPlan } from "./catalog";
import { useSubscriptionMessages } from "./messages";

export type TeamQuote = Schema<"TeamBillingQuoteDto">;
export type TeamBillingData = Schema<"TeamBillingDto">;
type Method = Schema<"PaymentMethodDto">;

function useBillingMutation<T>(onSuccess?: (value: T) => void) {
  const account = useAccountKey();
  const cache = useQueryClient();
  return useCoachingMutation<T>((result) => {
    void cache.invalidateQueries({ queryKey: [account, "access"] });
    void cache.invalidateQueries({ queryKey: [account, "usage"] });
    void cache.invalidateQueries({ queryKey: [account, "me"] });
    onSuccess?.(result);
  });
}

function QuoteSummary({ quote }: { quote: TeamQuote }) {
  const m = useSubscriptionMessages();
  return (
    <div className={styles.stack}>
      <h3>{m.quote}</h3>
      <p>
        {m.seats}: {quote.purchasedSeats}
      </p>
      <p>
        {money(quote.unitPrice, quote.currency)} {m.workspaceMonth}
      </p>
      <p>
        <strong>
          {m.amount}: {money(quote.amountDue, quote.currency)}
        </strong>
      </p>
      <p>{m.policy}</p>
      <Alert title={m.simulated}>{m.test}</Alert>
    </div>
  );
}

export function TeamCheckout({
  plan,
  onComplete,
  onCancel,
}: {
  plan: CatalogPlan;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const m = useSubscriptionMessages();
  const [name, setName] = useState("");
  const seats = catalogLimit(plan, "organization.coach_seats");
  const [quote, setQuote] = usePaymentQuote<TeamQuote>(
    `team-checkout:${plan.id}`,
  );
  const [key, setKey] = usePaymentActionId(`team-checkout:${plan.id}`);
  const [failed, setFailed] = useState(false);
  const quoting = useCoachingMutation<TeamQuote>(
    (value) => {
      setQuote(value);
      setKey(crypto.randomUUID());
      setFailed(false);
    },
    { invalidate: false },
  );
  const payment = useBillingMutation<TeamBillingData>((value) => {
    if (value.status === "PaymentFailed") setFailed(true);
    else {
      setQuote(null);
      onComplete();
    }
  });
  return (
    <section className={styles.panel} aria-label={m.checkout}>
      <h3>
        {plan.name} · {m.checkout}
      </h3>
      <MutationError error={quoting.error ?? payment.error} />
      <p>
        {m.simulated} {m.tools}
      </p>
      <p>
        {m.seats}: {seats} · {money(plan.amount!, plan.currency)}{" "}
        {m.workspaceMonth}
      </p>
      <form
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          quoting.mutate({
            method: "POST",
            path: "/api/v1/teams/checkout-quote",
            json: {
              teamName: name.trim(),
              purchasedSeats: seats,
              priceVersion: plan.priceVersion,
              planId: plan.id,
            },
          });
        }}
      >
        <label>
          {m.teamName}{" "}
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setQuote(null);
            }}
            disabled={payment.isPending || quoting.isPending}
          />
        </label>
        {!quote && (
          <Button
            type="submit"
            loading={quoting.isPending}
            isDisabled={payment.isPending || seats == null}
          >
            {m.review}
          </Button>
        )}
      </form>
      {quote && (
        <>
          <QuoteSummary quote={quote} />
          {failed && <Alert tone="warning" title={m.failed} />}
          <div className={styles.row}>
            <Button
              variant="primary"
              loading={payment.isPending}
              isDisabled={quoting.isPending}
              onPress={() =>
                payment.mutate({
                  method: "POST",
                  path: "/api/v1/teams/confirm-purchase",
                  json: { quoteId: quote.id, idempotencyKey: key },
                })
              }
            >
              {m.confirm}
            </Button>
            <Button
              isDisabled={payment.isPending}
              onPress={() => setQuote(null)}
            >
              {m.review}
            </Button>
          </div>
        </>
      )}
      <Button
        isDisabled={payment.isPending || quoting.isPending}
        onPress={onCancel}
      >
        {m.cancel}
      </Button>
    </section>
  );
}

export function TeamBilling({
  teamId,
  dissolutionAt,
}: {
  teamId: string;
  dissolutionAt: string | null;
}) {
  const billing = useCoachingQuery<TeamBillingData>(
    `/api/v1/teams/${teamId}/billing`,
  );
  if (billing.isPending) return <Loading />;
  if (billing.isError)
    return (
      <Failure error={billing.error} retry={() => void billing.refetch()} />
    );
  return (
    <BillingEditor
      key={`${teamId}:${billing.data.version}`}
      billing={billing.data}
      dissolutionAt={dissolutionAt}
    />
  );
}

function BillingEditor({
  billing,
  dissolutionAt,
}: {
  billing: TeamBillingData;
  dissolutionAt: string | null;
}) {
  const uiCopy = useUiCopy();

  const m = useSubscriptionMessages();
  const data = billing;
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const workspacePlans =
    plans.data?.filter((plan) => plan.priceScope === "Workspace") ?? [];
  const [planId, setPlanId] = useState(data.pendingPlanId ?? data.planId ?? "");
  const selected = workspacePlans.find((plan) => plan.id === planId);
  const [quote, setQuote] = usePaymentQuote<TeamQuote>(
    `team-payment:${data.teamId}`,
  );
  const [key, setKey] = usePaymentActionId(`team-payment:${data.teamId}`);
  const [method, setMethod] = useState("");
  const [failed, setFailed] = useState(false);
  const methods = useCoachingQuery<Method[]>("/api/v1/me/payment-methods");
  const addMethod = useBillingMutation<Method>((created) =>
    setMethod(created.id),
  );
  const quoting = useCoachingMutation<TeamQuote>(
    (value) => {
      setQuote(value);
      setKey(crypto.randomUUID());
      setFailed(false);
    },
    { invalidate: false },
  );
  const mutation = useBillingMutation<TeamBillingData>((value) => {
    setFailed(value.status === "PaymentFailed");
    if (value.status !== "PaymentFailed") setQuote(null);
  });
  const busy = quoting.isPending || mutation.isPending;
  return (
    <div className={styles.stack}>
      <h3>
        {m.workspace} · {data.planId}
      </h3>
      <Alert title={m.simulated}>{m.policy}</Alert>
      <MutationError
        error={quoting.error ?? mutation.error ?? addMethod.error}
      />
      {data.overSeatLimit && <Alert tone="warning" title={m.overSeats} />}
      <p>
        {m.seats}: {billing.occupiedSeats} / {billing.purchasedSeats} ·{" "}
        {billing.status}
      </p>
      <p>
        {money(billing.unitPrice, billing.currency)} {m.workspaceMonth}
      </p>
      <p>
        {m.period}: {new Date(billing.periodStart).toLocaleDateString()} –{" "}
        {new Date(billing.periodEnd).toLocaleDateString()}
      </p>
      {billing.pendingSeats != null && (
        <p>
          {m.upcoming}: {data.pendingPlanId} · {m.seats}: {billing.pendingSeats}
        </p>
      )}
      <p>
        {m.renewal}: {billing.autoRenew ? m.on : m.off}
      </p>
      {billing.autoRenew && !billing.renewalMethodEligible && (
        <Alert tone="warning" title={m.renewalWarning} />
      )}
      {!dissolutionAt && (
        <>
          {billing.status === "BillingInactive" ? (
            <Button
              isDisabled={busy}
              onPress={() =>
                quoting.mutate({
                  method: "POST",
                  path: "/api/v1/teams/" + billing.teamId + "/renewal/quote",
                })
              }
            >
              {m.review}
            </Button>
          ) : (
            <form
              className={styles.row}
              onSubmit={(event) => {
                event.preventDefault();
                if (selected)
                  quoting.mutate({
                    method: "POST",
                    path: "/api/v1/teams/" + billing.teamId + "/seats/quote",
                    json: {
                      purchasedSeats: catalogLimit(
                        selected,
                        "organization.coach_seats",
                      ),
                      planId: selected.id,
                      version: billing.version,
                    },
                  });
              }}
            >
              <label>
                {m.plans}{" "}
                <select
                  value={planId}
                  onChange={(event) => {
                    setPlanId(event.target.value);
                    setQuote(null);
                  }}
                  disabled={busy}
                >
                  <option value="">{m.choose}</option>
                  {workspacePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {money(plan.amount!, plan.currency)} ·{" "}
                      {m.seats}:{" "}
                      {catalogLimit(plan, "organization.coach_seats")}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="submit"
                isDisabled={busy || !selected || planId === data.planId}
              >
                {m.review}
              </Button>
            </form>
          )}
          {plans.isError && (
            <Failure error={plans.error} retry={() => void plans.refetch()} />
          )}
          {quote && (
            <>
              <QuoteSummary quote={quote} />
              {failed && <Alert tone="warning" title={m.failed} />}
              <Button
                loading={mutation.isPending}
                onPress={() =>
                  mutation.mutate({
                    method: "POST",
                    path: "/api/v1/teams/" + billing.teamId + "/seats/confirm",
                    json: { quoteId: quote.id, idempotencyKey: key },
                  })
                }
              >
                {quote.kind === "Decrease" ? m.schedule : m.confirm}
              </Button>
              <Button isDisabled={busy} onPress={() => setQuote(null)}>
                {m.cancel}
              </Button>
            </>
          )}
          {billing.autoRenew ? (
            <Button
              isDisabled={busy}
              onPress={() =>
                mutation.mutate({
                  method: "POST",
                  path: "/api/v1/teams/" + billing.teamId + "/renewal",
                  json: { version: billing.version, autoRenew: false },
                })
              }
            >
              {m.cancelRenewal}
            </Button>
          ) : (
            <div className={styles.row}>
              <label>
                {m.method}{" "}
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  <option value="">{m.chooseMethod}</option>
                  {methods.data
                    ?.filter((item) => item.active)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                isDisabled={!method || busy}
                onPress={() =>
                  mutation.mutate({
                    method: "POST",
                    path: "/api/v1/teams/" + billing.teamId + "/renewal",
                    json: {
                      version: billing.version,
                      autoRenew: true,
                      paymentMethodId: method,
                    },
                  })
                }
              >
                {m.enableRenewal}
              </Button>
              <Button
                loading={addMethod.isPending}
                onPress={() =>
                  addMethod.mutate({
                    method: "POST",
                    path: "/api/v1/me/payment-methods/simulated-card",
                    json: {
                      label: uiCopy["ui"]["Workspace renewal simulator"],
                      outcome: "Success",
                    },
                  })
                }
              >
                {m.addMethod}
              </Button>
            </div>
          )}
          {methods.isError && (
            <Failure
              error={methods.error}
              retry={() => void methods.refetch()}
            />
          )}
        </>
      )}
      <h3>{m.history}</h3>
      {!billing.history.length ? (
        <p>{m.noHistory}</p>
      ) : (
        <DataTable
          label={m.history}
          rows={billing.history}
          rowKey={(item) => item.id}
          columns={[
            {
              id: "date",
              header: m.date,
              cell: (item) => new Date(item.createdAt).toLocaleDateString(),
            },
            { id: "kind", header: m.event, cell: (item) => item.kind },
            {
              id: "seats",
              header: m.seats,
              cell: (item) => item.purchasedSeats,
            },
            {
              id: "amount",
              header: m.amount,
              cell: (item) => money(item.amountDue, item.currency),
            },
            {
              id: "status",
              header: m.status,
              cell: (item) => item.status + " · " + m.payment,
            },
          ]}
        />
      )}
      <LinkButton href="/app/subscription">{m.historyLink}</LinkButton>
    </div>
  );
}
