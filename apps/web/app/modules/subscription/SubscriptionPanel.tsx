import { Check, CreditCard } from "lucide-react";
import { useState } from "react";
import type { Schema } from "@trainflow/api-client-web";
import { Badge, Button, Dialog, DialogTrigger, LinkButton, Skeleton } from "@trainflow/ui-web";
import { Failure, MutationError, money, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useProfile } from "~/modules/accounts";
import { TeamCheckout } from "./team-billing";
import styles from "./SubscriptionPanel.module.css";

type Plan = Schema<"PlatformPlanDto">;
type Subscription = Schema<"PlatformSubscriptionDto">;

const OFFERS = [
  { id: "Free", description: "For getting started with your first clients." },
  { id: "Pro", description: "For coaches running their practice full time." },
  { id: "Team", description: "For coaching businesses that are growing." },
] as const;

const FEATURES = [
  { title: "Programs and templates", body: "Spreadsheet editor, formulas, folders, CSV and PDF." },
  { title: "Clients and groups", body: "Invitations, applications and client groups." },
  { title: "Check-ins and forms", body: "Scheduled check-ins with your own forms." },
  { title: "Messages and calendar", body: "Chats, meetings and events with clients." },
  { title: "Offers and payments", body: "Paid offers, dues and earnings." },
  { title: "Video analysis", body: "Private lift library and analyses." },
  { title: "Analyze", body: "Revenue, clients and check-in trends." },
];

/** The plans are fixed content, so loading shows their shape rather than a spinner. */
function OffersSkeleton() {
  return (
    <div className={styles.panel} aria-busy="true" aria-label="Loading plans">
      <Skeleton width="60%" height="0.875rem" />
      <div className={styles.offers}>
        {OFFERS.map((offer) => (
          <div key={offer.id} className={styles.offer}>
            <Skeleton width="40%" height="1.25rem" />
            <Skeleton width="65%" height="2rem" />
            <Skeleton width="90%" height="0.875rem" />
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} width="75%" height="0.75rem" />
            ))}
            <Skeleton width="100%" height="2.25rem" className={styles.cta} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Offers() {
  const profile = useProfile();
  const plans = useCoachingQuery<Plan[]>("/api/v1/subscriptions/plans");
  const current = useCoachingQuery<Subscription>("/api/v1/me/platform-subscription");
  const team = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
  // One key per open panel, so a retried confirmation is never charged twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [selected, setSelected] = useState<Plan | null>(null);
  const [notice, setNotice] = useState("");
  const mutation = useCoachingMutation<Subscription>();
  if (plans.isPending || current.isPending) return <OffersSkeleton />;
  if (plans.isError || current.isError)
    return (
      <Failure
        error={plans.error ?? current.error}
        retry={() => {
          void plans.refetch();
          void current.refetch();
        }}
      />
    );
  const subscription = current.data;
  const pay = async () => {
    if (!selected) return;
    const checkout = await mutation.mutateAsync({ method: "POST", path: "/api/v1/me/platform-subscription/checkout", json: { planId: selected.id, priceVersion: selected.priceVersion } });
    if (!checkout.pendingDue) return;
    const paid = await mutation.mutateAsync({ method: "POST", path: "/api/v1/me/platform-subscription/confirm-payment", json: { dueId: checkout.pendingDue.id, idempotencyKey: key } });
    if (paid.planId === selected.id) { setNotice(`${selected.id} is active. Simulated payment completed.`); setSelected(null); setKey(crypto.randomUUID()); }
  };
  const post = (path: string, json: object) => mutation.mutate({ method: "POST", path: `/api/v1/me/platform-subscription/${path}`, json });

  return (
    <div className={styles.panel}>
      <p className={styles.note}>Individual tools stay available. Team adds organizational roles, paid seats and shared client management. Payments are simulated; no real money is charged.</p>
      <MutationError error={mutation.error} />
      <div className={styles.offers}>
        {OFFERS.map((offer, i) => {
          const plan = plans.data.find((p) => p.id === offer.id);
          const isCurrent = subscription.planId === offer.id;
          const price = plan?.priceConfigured && plan.amount != null ? money(plan.amount, plan.currency) : null;
          return (
            <article key={offer.id} className={styles.offer} data-current={isCurrent || undefined} data-featured={offer.id === "Pro" || undefined} style={{ "--i": i } as React.CSSProperties}>
              <header className={styles.head}>
                <h3>{offer.id}</h3>
                {isCurrent ? <Badge tone="success">Current plan</Badge> : offer.id === "Pro" ? <Badge tone="accent">Recommended</Badge> : null}
              </header>
              <p className={styles.price}>
                <strong>{price ?? "—"}</strong>
                <span>{price ? offer.id === "Team" ? "per person / month" : "per month" : "Price not set yet"}</span>
              </p>
              <p className={styles.description}>{offer.description}</p>
              <ul className={styles.highlights}>
                {FEATURES.slice(0, 4).map((feature) => (
                  <li key={feature.title}>
                    <Check aria-hidden="true" />
                    {feature.title}
                  </li>
                ))}
              </ul>
              {offer.id === "Team" && <p className={styles.description}>Owner/Admin controls, client consent, assignments and Team Analyze.</p>}
              {offer.id === "Team" && !profile.roles.includes("Coach") && <p className={styles.note}>A coach account is required to purchase Team. You can still respond to invitations on the Team page.</p>}
              {offer.id === "Team" && !!team.data?.teams.length ? <LinkButton href="/app/team" className={styles.cta}>Manage Team membership</LinkButton> : <Button variant={offer.id === "Pro" ? "primary" : "secondary"} className={styles.cta}
                isDisabled={isCurrent || !plan?.priceConfigured || mutation.isPending || (offer.id === "Free" && subscription.pendingPlanId === "Free") || (offer.id === "Team" && (!profile.roles.includes("Coach") || team.isPending || team.isError))}
                onPress={() => offer.id === "Free" ? post("change-plan", { planId: "Free", version: subscription.version }) : (setSelected(plan!), setNotice(""))}>
                {isCurrent ? "Your plan" : offer.id === "Free" ? subscription.pendingPlanId === "Free" ? "Free scheduled" : "Switch to Free at period end" : `Pay for ${offer.id}`}
              </Button>}
            </article>
          );
        })}
      </div>

      {notice && <p role="status">{notice}</p>}
      {subscription.pendingPlanId === "Free" && <p role="status">Free starts at the end of your paid period{subscription.periodEnd ? ` (${new Date(subscription.periodEnd).toLocaleDateString()})` : ""}. Your paid benefits continue until then; automatic renewal is off.</p>}
      {selected?.id === "Team" && <TeamCheckout priceVersion={selected.priceVersion!} onCancel={() => setSelected(null)} onComplete={() => { setNotice("Team is active. Simulated payment completed."); setSelected(null); }} />}
      {selected && selected.id !== "Team" && <form className={styles.checkout} onSubmit={(event) => { event.preventDefault(); void pay().catch(() => undefined); }}>
        <h3>{selected.id} checkout</h3>
        <p>Test payment. No real money is charged and no card details are needed.</p>
        <p>{money(selected.amount!, selected.currency)} per month, in your profile currency.</p>
        <p>Your plan activates immediately after payment.</p>
        <div className={styles.checkoutActions}><Button type="submit" variant="primary" isDisabled={mutation.isPending} loading={mutation.isPending}>Pay {money(selected.amount!, selected.currency)}</Button>
        <Button onPress={() => setSelected(null)} isDisabled={mutation.isPending}>Cancel</Button></div>
      </form>}
      <section className={styles.features} aria-labelledby="plan-features">
        <h3 id="plan-features">Individual tools</h3>
        <ul>
          {FEATURES.map((feature, i) => (
            <li key={feature.title} style={{ "--i": i } as React.CSSProperties}>
              <span className={styles.check} aria-hidden="true">
                <Check />
              </span>
              <span>
                <strong>{feature.title}</strong>
                <span>{feature.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <LinkButton href="/app/subscription" variant="ghost" size="sm" className={styles.manage}>
        Renewal and payment history
      </LinkButton>
    </div>
  );
}

/** App-bar button that opens the plans in a side panel. */
export function SubscriptionButton({ label }: { label: string }) {
  return (
    <DialogTrigger>
      <Button variant="primary" size="sm" iconStart={<CreditCard />}>
        {label}
      </Button>
      <Dialog title="Plans" description="Pick the plan that fits your practice." size="xl">
        <Offers />
      </Dialog>
    </DialogTrigger>
  );
}
