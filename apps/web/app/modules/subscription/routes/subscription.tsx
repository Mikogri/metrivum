import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Badge, Button, DataTable, Option, PageHeader, Select } from "@trainflow/ui-web";
import { Failure, Loading, MutationError, money, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { Facts, Panel, PanelGrid } from "~/shared/ui/Panel";
import { QuotaContextField, useQuotaContext } from "~/shared/access";
import { useAccountKey } from "~/shared/session/AccountScope";
import { privateMeta } from "~/shared/i18n/site";
import { Offers } from "../SubscriptionPanel";
import { TeamBilling } from "../team-billing";
import { useSubscriptionMessages } from "../messages";
import { planLimitKeys, type CatalogPlan } from "../catalog";
import styles from "./subscription.module.css";

export const meta = () => privateMeta("Subscription — Metrivum");
type Subscription = Schema<"PlatformSubscriptionDto">;
type History = Schema<"PlatformHistoryDto">;
type Method = Schema<"PaymentMethodDto">;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString() : "—";

export default function SubscriptionRoute() {
  const m = useSubscriptionMessages();
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const current = useCoachingQuery<Subscription>("/api/v1/me/platform-subscription");
  const history = useCoachingQuery<History>("/api/v1/me/platform-subscription/history");
  const methods = useCoachingQuery<Method[]>("/api/v1/me/payment-methods");
  const teams = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
  const quotaContext = useQuotaContext();
  const account = useAccountKey();
  const cache = useQueryClient();
  const [method, setMethod] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useCoachingMutation<Subscription>(() => { void cache.invalidateQueries({ queryKey: [account, "access"] }); void cache.invalidateQueries({ queryKey: [account, "usage"] }); });
  const addMethod = useCoachingMutation<Method>(created => setMethod(created.id));
  const refund = useCoachingMutation(() => { setNotice(m.refunded); void cache.invalidateQueries({ queryKey: [account, "access"] }); void cache.invalidateQueries({ queryKey: [account, "usage"] }); });
  const update = (path: string, json: object, success: string) => {
    setNotice(null);
    mutation.mutate({ method: "POST", path: "/api/v1/me/platform-subscription/" + path, json }, { onSuccess: result => {
      const completed = path !== "confirm-payment" || result.status === "Active";
      setNotice(completed ? success : m.failed);
      if (path === "confirm-payment" && completed) setKey(crypto.randomUUID());
    } });
  };
  if (plans.isPending || current.isPending) return <Loading />;
  if (plans.isError || current.isError) return <Failure error={plans.error ?? current.error} retry={() => { void plans.refetch(); void current.refetch(); }} />;
  const subscription = current.data;
  const due = subscription.pendingDue;
  const paid = subscription.planId !== "Free";
  return <>
    <PageHeader title={m.title} description={m.description} meta={<><Badge tone={paid ? "success" : "neutral"} dot>{subscription.planId}</Badge><span>{m.paidThrough}: {date(subscription.periodEnd)}</span></>} />
    <div className={styles.stack}>
      <Alert title={m.simulated}>{m.policy}</Alert>
      <MutationError error={mutation.error ?? addMethod.error ?? refund.error} />
      {notice && <Alert title={m.updated}>{notice}</Alert>}
      {due && <Panel title={m.outstanding} description={m.simulated} actions={<Button variant="primary" loading={mutation.isPending} isDisabled={mutation.isPending} onPress={() => update("confirm-payment", { dueId: due.id, idempotencyKey: key, paymentMethodId: null }, m.active)}>{m.confirm}</Button>}>
        <Facts columns={2} items={[{ label: m.amount, value: money(due.amount, due.currency) }, { label: m.nextDue, value: date(due.dueAt) }, { label: m.status, value: due.status }, { label: m.paidThrough, value: date(due.periodEnd) }]} />
      </Panel>}
      <PanelGrid>
        <Panel title={m.current} actions={paid && subscription.autoRenew ? <Button isDisabled={mutation.isPending} onPress={() => update("cancel-renewal", { version: subscription.version }, m.renewalCancelled)}>{m.cancelRenewal}</Button> : undefined}>
          <Facts items={[
            { label: m.plans, value: subscription.planId }, { label: m.status, value: subscription.status },
            { label: m.period, value: date(subscription.periodStart) + " – " + date(subscription.periodEnd) },
            { label: m.nextDue, value: date(subscription.nextDueAt) }, { label: m.renewal, value: subscription.autoRenew ? m.on : m.off },
            ...(subscription.pendingPlanId ? [{ label: m.upcoming, value: subscription.pendingPlanId + " · " + date(subscription.periodEnd) }] : []),
          ]} />
          {subscription.autoRenew && !subscription.renewalMethodEligible && <Alert tone="warning" title={m.renewalWarning} />}
        </Panel>
        <Panel title={m.method} description={m.test} actions={<Button size="sm" loading={addMethod.isPending} onPress={() => addMethod.mutate({ method: "POST", path: "/api/v1/me/payment-methods/simulated-card", json: { label: "Platform renewal simulator", outcome: "Success" } })}>{m.addMethod}</Button>}>
          {methods.isError ? <Failure error={methods.error} retry={() => void methods.refetch()} /> : <p>{methods.data?.filter(item => item.active).map(item => item.label).join(", ") || m.noMethods}</p>}
          {paid && !subscription.autoRenew && <div className={styles.row}>
            <Select aria-label={m.method} placeholder={m.chooseMethod} selectedKey={method || null} onSelectionChange={k => setMethod(String(k))} className={styles.grow}>{(methods.data ?? []).filter(item => item.active).map(item => <Option key={item.id} id={item.id}>{item.label}</Option>)}</Select>
            <Button variant="primary" isDisabled={!method || mutation.isPending} onPress={() => update("renewal", { version: subscription.version, autoRenew: true, paymentMethodId: method }, m.renewalEnabled)}>{m.enableRenewal}</Button>
          </div>}
        </Panel>
      </PanelGrid>
      <Panel title={m.usage} description={quotaContext.usage.data?.planId === "Free" ? m.freeReset : m.paidReset}>
        <QuotaContextField context={quotaContext} />
        {quotaContext.usage.isPending ? <Loading /> : quotaContext.usage.isError ? <Failure error={quotaContext.usage.error} retry={() => void quotaContext.usage.refetch()} /> : <><p>{quotaContext.usage.data.planId} · {date(quotaContext.usage.data.periodStart)} – {date(quotaContext.usage.data.periodEnd)}</p><DataTable label={m.usage} rows={quotaContext.usage.data.usage.filter(limit => planLimitKeys.includes(limit.key as typeof planLimitKeys[number]))} rowKey={limit => limit.key} columns={[
          { id: "limit", header: m.details, cell: limit => m.labels[limit.key] ?? limit.key },
          { id: "used", header: m.usage, cell: limit => String(limit.used) + " / " + (limit.maximum == null ? m.unlimited : Number(limit.maximum).toLocaleString()) },
          { id: "reset", header: m.reset, cell: limit => date(limit.resetAt ?? (limit.key.includes("per_period") ? quotaContext.usage.data?.periodEnd : null)) },
        ]} /></>}
        <p className={styles.muted}>{m.remaining}</p>
      </Panel>
      <Offers embedded />
      {teams.data?.teams.map(team => <Panel key={team.id} title={m.teamAccess + " · " + team.name}>
        <Facts columns={2} items={[{ label: m.status, value: team.status }, { label: m.seats, value: team.occupiedSeats + " / " + team.purchasedSeats }, { label: m.paidThrough, value: date(team.periodEnd) }]} />
        {team.allowedActions.includes("teams.billing") && <TeamBilling teamId={team.id} dissolutionAt={team.dissolutionAt} />}
      </Panel>)}
      <Panel title={m.history} description={m.simulated} flush>
        {history.isPending ? <Loading /> : history.isError ? <Failure error={history.error} retry={() => void history.refetch()} /> : history.data.payments.length === 0 && history.data.changes.length === 0 ? <p className={styles.empty}>{m.noHistory}</p> : <DataTable label={m.history} rows={[
          ...history.data.payments.map(p => ({ id: p.id, at: p.settledAt, kind: m.payment, detail: p.source, amount: money(p.grossAmount, p.currency), refundable: !(history.data.refunds ?? []).some(r => r.paymentId === p.id) })),
          ...history.data.changes.map(c => ({ id: c.id, at: c.createdAt, kind: c.type, detail: c.planId + (c.effectiveAt ? " · " + date(c.effectiveAt) : ""), amount: "—", refundable: false })),
          ...(history.data.refunds ?? []).map(r => ({ id: r.id, at: r.createdAt, kind: m.refundEvent, detail: r.paymentId, amount: money(r.amount, r.currency), refundable: false })),
        ].sort((a, b) => String(b.at).localeCompare(String(a.at)))} rowKey={row => row.id ?? row.kind + ":" + row.at} columns={[
          { id: "date", header: m.date, cell: row => date(row.at) }, { id: "kind", header: m.event, cell: row => row.kind }, { id: "detail", header: m.details, cell: row => row.detail }, { id: "amount", header: m.amount, align: "end", cell: row => row.amount },
          { id: "refund", header: m.refundEvent, cell: row => row.refundable ? <Button size="sm" isDisabled={refund.isPending} onPress={() => refund.mutate({ method: "POST", path: "/api/v1/me/platform-payments/" + row.id + "/simulated-refund", json: { idempotencyKey: "refund:" + row.id } })}>{m.refund}</Button> : null },
        ]} />}
      </Panel>
    </div>
  </>;
}
