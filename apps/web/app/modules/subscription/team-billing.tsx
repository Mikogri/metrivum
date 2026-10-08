import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DataTable, LinkButton } from "@trainflow/ui-web";
import { Failure, Loading, MutationError, money, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useAccountKey } from "~/shared/session/AccountScope";
import styles from "./routes/subscription.module.css";

export type TeamQuote = Schema<"TeamBillingQuoteDto">;
export type TeamBillingData = Schema<"TeamBillingDto">;
type Method = Schema<"PaymentMethodDto">;

function useBillingMutation<T>(onSuccess?: (value: T) => void) {
  const account = useAccountKey();
  const cache = useQueryClient();
  return useCoachingMutation<T>(result => {
    void cache.invalidateQueries({ queryKey: [account, "access"] });
    void cache.invalidateQueries({ queryKey: [account, "me"] });
    onSuccess?.(result);
  });
}

function QuoteSummary({ quote }: { quote: TeamQuote }) {
  return <div className={styles.stack}>
    <h3>Review Team quote</h3>
    <p>{quote.purchasedSeats} paid seats · {money(quote.unitPrice, quote.currency)} per seat / month</p>
    <p>Full monthly total: {money(quote.unitPrice * quote.purchasedSeats, quote.currency)}</p>
    <p>This adjustment: {money(quote.grossAmount, quote.currency)} · Unused Pro credit: {money(quote.creditAmount, quote.currency)}</p>
    <p><strong>Amount due: {money(quote.amountDue, quote.currency)}</strong></p>
    {quote.creditAmount > quote.grossAmount && <Alert tone="warning" title="Unused credit exceeds this purchase">This quote cannot be confirmed until the excess paid value has an explicit credit policy. Choose a different seat quantity or contact support; paid value must not be discarded.</Alert>}
    {quote.kind === "Decrease" && <Alert title="Seat reduction applies next period">Current paid capacity remains available until the end of this period. There is no partial refund.</Alert>}
    <p>Quote expires {new Date(quote.expiresAt).toLocaleString()}. Price {quote.priceVersion} · Terms {quote.termsVersion}.</p>
    <Alert title="Simulated payment — no real money charged">Confirming records a simulated payment. No card details are requested.</Alert>
  </div>;
}

export function TeamCheckout({ priceVersion, onComplete, onCancel }: { priceVersion: string; onComplete: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(1);
  const [quote, setQuote] = useState<TeamQuote | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [failed, setFailed] = useState(false);
  const quoting = useCoachingMutation<TeamQuote>(value => { setQuote(value); setKey(crypto.randomUUID()); setFailed(false); }, { invalidate: false });
  const payment = useBillingMutation<TeamBillingData>(value => {
    if (value.status === "PaymentFailed") setFailed(true);
    else onComplete();
  });
  return <section className={styles.panel} aria-label="Team checkout"><h3>Team checkout</h3>
    <MutationError error={quoting.error ?? payment.error} />
    <p>The owner occupies one paid seat. Choose enough seats for the coaches you want to invite. Unused Pro credit is calculated by the server from your paid period.</p>
    <form className={styles.stack} onSubmit={event => { event.preventDefault(); quoting.mutate({ method: "POST", path: "/api/v1/teams/checkout-quote", json: { teamName: name.trim(), purchasedSeats: seats, priceVersion } }); }}>
      <label>Team name <input required maxLength={80} value={name} onChange={event => { setName(event.target.value); setQuote(null); }} disabled={payment.isPending || quoting.isPending} /></label>
      <label>Purchased seats <input type="number" required min={1} max={10000} step={1} value={seats} onChange={event => { setSeats(Number(event.target.value)); setQuote(null); }} disabled={payment.isPending || quoting.isPending} /></label>
      {!quote && <Button type="submit" loading={quoting.isPending} isDisabled={payment.isPending}>Review quote</Button>}
    </form>
    {quote && <><QuoteSummary quote={quote} />{failed && <Alert tone="warning" title="Payment did not complete">The Team has not been activated. Retry confirmation or request a fresh quote.</Alert>}
      <div className={styles.row}><Button variant="primary" loading={payment.isPending} isDisabled={quoting.isPending || quote.creditAmount > quote.grossAmount} onPress={() => payment.mutate({ method: "POST", path: "/api/v1/teams/confirm-purchase", json: { quoteId: quote.id, idempotencyKey: key } })}>Confirm payment</Button>
        <Button isDisabled={payment.isPending} onPress={() => setQuote(null)}>Refresh quote</Button></div></>}
    <Button isDisabled={payment.isPending || quoting.isPending} onPress={onCancel}>Cancel checkout</Button>
  </section>;
}

export function TeamBilling({ teamId, dissolutionAt }: { teamId: string; dissolutionAt: string | null }) {
  const billing = useCoachingQuery<TeamBillingData>(`/api/v1/teams/${teamId}/billing`);
  if (billing.isPending) return <Loading />;
  if (billing.isError) return <Failure error={billing.error} retry={() => void billing.refetch()} />;
  return <BillingEditor key={`${teamId}:${billing.data.version}`} billing={billing.data} dissolutionAt={dissolutionAt} />;
}

function BillingEditor({ billing, dissolutionAt }: { billing: TeamBillingData; dissolutionAt: string | null }) {
  const [seats, setSeats] = useState(billing.pendingSeats ?? billing.purchasedSeats);
  const [quote, setQuote] = useState<TeamQuote | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState("");
  const [failed, setFailed] = useState(false);
  const methods = useCoachingQuery<Method[]>("/api/v1/me/payment-methods");
  const addMethod = useBillingMutation<Method>(created => setMethod(created.id));
  const quoting = useCoachingMutation<TeamQuote>(value => { setQuote(value); setKey(crypto.randomUUID()); setFailed(false); }, { invalidate: false });
  const mutation = useBillingMutation<TeamBillingData>(value => { setFailed(value.status === "PaymentFailed"); if (value.status !== "PaymentFailed") setQuote(null); });
  const busy = quoting.isPending || mutation.isPending;
  return <div className={styles.stack}>
    <h3>Team billing</h3><Alert title="Simulated payment — no real money charged">Only the owner can manage the organization's subscription.</Alert>
    <MutationError error={quoting.error ?? mutation.error ?? addMethod.error} />
    <p>{billing.occupiedSeats} occupied / {billing.purchasedSeats} paid seats · {billing.status}</p>
    <p>{money(billing.unitPrice, billing.currency)} per seat / month · {money(billing.unitPrice * billing.purchasedSeats, billing.currency)} monthly total</p>
    <p>Paid period: {new Date(billing.periodStart).toLocaleString()} – {new Date(billing.periodEnd).toLocaleString()}</p>
    {billing.pendingSeats != null && <p>Next period capacity: {billing.pendingSeats} paid seats.</p>}
    <p>Automatic renewal: {billing.autoRenew ? "Enabled" : "Off"}. Cancelling renewal preserves access through the paid period; the organization and its history are retained after expiry.</p>
    {billing.autoRenew && !billing.renewalMethodEligible && <Alert tone="warning" title="Renewal method unavailable">Choose an active simulated method to enable automatic renewal. No automatic payment can currently be made.</Alert>}
    {!dissolutionAt && <>
      {billing.status === "BillingInactive" ? <Button isDisabled={busy} onPress={() => quoting.mutate({ method: "POST", path: `/api/v1/teams/${billing.teamId}/renewal/quote` })}>Review renewal quote</Button> : <form className={styles.row} onSubmit={event => { event.preventDefault(); quoting.mutate({ method: "POST", path: `/api/v1/teams/${billing.teamId}/seats/quote`, json: { purchasedSeats: seats, version: billing.version } }); }}>
        <label>Paid seats <input type="number" required min={Math.max(1, billing.occupiedSeats)} max={10000} step={1} value={seats} onChange={event => { setSeats(Number(event.target.value)); setQuote(null); }} disabled={busy} /></label><Button type="submit" isDisabled={busy || seats === billing.purchasedSeats}>Review seat adjustment</Button>
      </form>}
      {quote && <><QuoteSummary quote={quote} />{failed && <Alert tone="warning" title="Payment did not complete">Your existing paid capacity remains unchanged. Retry confirmation or request a new quote.</Alert>}<Button loading={mutation.isPending} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${billing.teamId}/seats/confirm`, json: { quoteId: quote.id, idempotencyKey: key } })}>{quote.kind === "Decrease" ? "Confirm next-period seats" : "Confirm payment"}</Button><Button isDisabled={busy} onPress={() => setQuote(null)}>Discard quote</Button></>}
      {billing.autoRenew ? <Button isDisabled={busy} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${billing.teamId}/renewal`, json: { version: billing.version, autoRenew: false } })}>Cancel Team renewal</Button> : <div className={styles.row}>
        <label>Team renewal method <select value={method} onChange={event => setMethod(event.target.value)}><option value="">Choose simulated method</option>{methods.data?.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <Button isDisabled={!method || busy} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/teams/${billing.teamId}/renewal`, json: { version: billing.version, autoRenew: true, paymentMethodId: method } })}>Enable Team renewal</Button>
        <Button loading={addMethod.isPending} onPress={() => addMethod.mutate({ method: "POST", path: "/api/v1/me/payment-methods/simulated-card", json: { label: "Team renewal simulator", outcome: "Success" } })}>Save simulated renewal method</Button>
      </div>}
      {methods.isError && <Failure error={methods.error} retry={() => void methods.refetch()} />}
    </>}
    <h3>Team billing history</h3>
    {!billing.history.length ? <p>No Team billing adjustments yet.</p> : <DataTable label="Team billing history" rows={billing.history} rowKey={item => item.id} columns={[
      { id: "date", header: "Date", cell: item => new Date(item.createdAt).toLocaleDateString() },
      { id: "kind", header: "Adjustment", cell: item => item.kind },
      { id: "seats", header: "Seats", cell: item => item.purchasedSeats },
      { id: "amount", header: "Amount due", cell: item => money(item.amountDue, item.currency) },
      { id: "status", header: "Status", cell: item => `${item.status} · Simulated` },
    ]} />}
    <LinkButton href="/app/subscription">Personal subscription and payment history</LinkButton>
  </div>;
}
