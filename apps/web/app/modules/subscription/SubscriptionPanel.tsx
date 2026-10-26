import { Check, CreditCard, Minus, Rocket, Sparkles, User, Users } from "lucide-react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { Badge, Button, Dialog, DialogTrigger, LinkButton, Segment, SegmentedControl, Skeleton } from "@trainflow/ui-web";
import { Failure, MutationError, useCoachingMutation, useCoachingQuery } from "~/modules/coaching";
import { useProfile } from "~/modules/accounts";
import { useAccountKey } from "~/shared/session/AccountScope";
import { catalogLimit, isWorkspacePlan, planChangeKind, planLimitKeys, type CatalogPlan } from "./catalog";
import { isTopTier } from "~/shared/access/plan-catalog";

/** A yearly price is ten months: two months free. */
const YEARLY_MONTHS = 10;
/** Plan prices are whole amounts: no cents on the cards. */
export const wholeMoney = (amount: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);
import { useSubscriptionMessages } from "./messages";
import { useUpgrade } from "./upgrade";
import styles from "./SubscriptionPanel.module.css";

type Subscription = Schema<"PlatformSubscriptionDto">;

/** Capabilities listed on every plan card, with the server capability that switches each one on. */
export const FEATURES = [
  ["basic", null], ["builder", "training.builder.advanced"], ["export", "training.export.pdf"], ["custom", "exercises.custom.create"],
  ["cloud", "video.analysis.cloud"], ["analytics", "analytics.advanced"], ["mcp", "integrations.mcp.write-training-drafts"],
  ["priority", "discovery.ranking.priority"], ["workspace", "organization.workspace.manage"],
] as const;

export function PlanHighlights({ plan }: { plan: CatalogPlan }) {
  const m = useSubscriptionMessages();
  const workspace = isWorkspacePlan(plan);
  const limit = (key: string, value: number | null) => value === null ? m.unlimited : /gpu_seconds/.test(key) ? m.hours(Math.round(value / 360) / 10) : value.toLocaleString();
  return <ul className={styles.highlights}>
    {planLimitKeys.map(key => {
      const value = catalogLimit(plan, key);
      if (value === undefined || (key === "organization.coach_seats" && !workspace)) return null;
      const on = value !== 0;
      return <li key={key} data-off={!on || undefined}>{on ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}<span>{m.labels[key]}</span><strong>{on ? limit(key, value) : "—"}</strong></li>;
    })}
    {FEATURES.filter(([id]) => id !== "workspace" || workspace).map(([id, capability]) => {
      const on = capability === null || plan.capabilities.includes(capability);
      return <li key={id} data-off={!on || undefined}>{on ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}<span>{m.feature[id]}</span></li>;
    })}
  </ul>;
}

/** The plans to choose from. Choosing a higher plan opens the checkout page; a lower one is scheduled for the period end. */
export function Offers({ embedded = false, onLeave }: { embedded?: boolean; onLeave?: () => void } = {}) {
  const m = useSubscriptionMessages();
  const profile = useProfile();
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const current = useCoachingQuery<Subscription>("/api/v1/me/platform-subscription");
  const team = useCoachingQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
  const account = useAccountKey();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState("");
  // One ladder at a time (personal or workspace plans), and monthly or yearly prices.
  const [kind, setKind] = useState<"Account" | "Workspace" | null>(null);
  const [yearly, setYearly] = useState(false);
  const mutation = useCoachingMutation<Subscription>(() => { void cache.invalidateQueries({ queryKey: [account, "access"] }); void cache.invalidateQueries({ queryKey: [account, "usage"] }); });
  if (plans.isPending || current.isPending) return <div className={styles.offers} aria-busy="true" aria-label={m.loading}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height="25rem" />)}</div>;
  if (plans.isError || current.isError) return <Failure error={plans.error ?? current.error} retry={() => { void plans.refetch(); void current.refetch(); }} />;
  const subscription = current.data;
  const currentPlan = plans.data.find(plan => plan.id === subscription.planId);
  const shownKind = kind ?? (currentPlan && isWorkspacePlan(currentPlan) ? "Workspace" : "Account");
  const shown = plans.data.filter(plan => (isWorkspacePlan(plan) ? "Workspace" : "Account") === shownKind);

  return <div className={styles.panel}>
    <div className={styles.switches}>
      <ToggleButtonGroup className={styles.kind} aria-label={m.kindLabel} selectionMode="single" disallowEmptySelection selectedKeys={[shownKind]} onSelectionChange={keys => setKind(String([...keys][0] ?? "Account") as "Account" | "Workspace")}>
        <ToggleButton id="Account" className={styles.kindOption} aria-label={m.individual}><span className={styles.kindIcon} aria-hidden="true"><User /></span><span className={styles.kindText}><strong>{m.individual}</strong><small>{m.individualSub}</small></span></ToggleButton>
        <ToggleButton id="Workspace" className={styles.kindOption} data-kind="workspace" aria-label={m.teams}><span className={styles.kindIcon} aria-hidden="true"><Users /></span><span className={styles.kindText}><strong>{m.teams}</strong><small>{m.teamsSub}</small></span></ToggleButton>
      </ToggleButtonGroup>
      <SegmentedControl size="md" aria-label={m.billingLabel} selectedKeys={[yearly ? "year" : "month"]} onSelectionChange={keys => setYearly([...keys][0] === "year")}>
        <Segment id="month">{m.monthly}</Segment>
        <Segment id="year">{m.yearly} <span className={styles.save}>{m.yearlySave}</span></Segment>
      </SegmentedControl>
    </div>
    <MutationError error={mutation.error} />
    <div className={styles.offers} style={{ "--count": shown.length } as React.CSSProperties}>
      {shown.map(plan => {
        const isCurrent = subscription.planId === plan.id;
        const downgrade = planChangeKind(plans.data, subscription.planId, plan.id) === "downgrade";
        const workspace = isWorkspacePlan(plan);
        // Yearly is shown as ten monthly payments (two months free); checkout is monthly only for now.
        const amount = plan.priceConfigured && plan.amount != null ? Number(plan.amount) * (yearly && Number(plan.amount) > 0 ? YEARLY_MONTHS : 1) : null;
        const price = amount != null ? wholeMoney(amount, plan.currency) : null;
        const best = isTopTier(plan, plans.data);
        return <article key={plan.id} className={styles.offer} data-current={isCurrent || undefined} data-featured={best || undefined} data-kind={workspace ? "workspace" : "personal"}>
          <div className={styles.top}>
            {best ? <span className={styles.bestTag}><Sparkles aria-hidden="true" />{m.best}</span> : null}
            <header className={styles.head}><h3>{plan.name}</h3>{isCurrent ? <Badge tone="success">{m.current}</Badge> : null}</header>
            <p className={styles.price}><strong>{price ?? "—"}</strong><span>{price ? yearly && Number(plan.amount) > 0 ? workspace ? m.workspaceYear : m.year : workspace ? m.workspaceMonth : m.month : m.notConfigured}</span></p>
          </div>
          <PlanHighlights plan={plan} />
          {workspace && !!team.data?.teams.length ? <LinkButton href="/app/team" className={styles.cta}>{m.manageWorkspace}</LinkButton> : <Button variant={best ? "primary" : "secondary"} className={best ? `${styles.cta} ${styles.upgrade}` : styles.cta}
            isDisabled={(yearly && Number(plan.amount) > 0 && !isCurrent) || isCurrent || !plan.priceConfigured || mutation.isPending || subscription.pendingPlanId === plan.id || (workspace && (!profile.roles.includes("Coach") || team.isPending || team.isError))}
            onPress={() => {
              setNotice("");
              if (downgrade) mutation.mutate({ method: "POST", path: "/api/v1/me/platform-subscription/change-plan", json: { planId: plan.id, version: subscription.version } }, { onSuccess: () => setNotice(m.changeScheduled) });
              else { onLeave?.(); navigate(`/app/checkout?plan=${encodeURIComponent(plan.id)}`); }
            }}>
            {isCurrent ? m.yourPlan : yearly && Number(plan.amount) > 0 ? m.yearlySoon : subscription.pendingPlanId === plan.id ? m.scheduled : downgrade ? m.schedule + ": " + plan.name : m.select + " " + plan.name}
          </Button>}
        </article>;
      })}
    </div>
    {notice && <p role="status">{notice}</p>}
    {subscription.pendingPlanId && <p role="status">{m.upcoming}: {subscription.pendingPlanId} · {subscription.periodEnd && new Date(subscription.periodEnd).toLocaleDateString()}</p>}
    {!embedded && <LinkButton href="/app/subscription" variant="ghost" size="sm" className={styles.manage}>{m.historyLink}</LinkButton>}
  </div>;
}

export function SubscriptionButton({ label }: { label: string }) {
  const m = useSubscriptionMessages();
  // "Upgrade to <top plan>" until the account (or its Team) is on the highest tier of its kind.
  const upgrade = useUpgrade();
  const [open, setOpen] = useState(false);
  return <DialogTrigger isOpen={open} onOpenChange={setOpen}><Button variant={upgrade.available ? "primary" : "secondary"} size="sm" className={upgrade.available ? styles.upgrade : undefined} iconStart={upgrade.available ? <Rocket /> : <CreditCard />}>{upgrade.available ? (upgrade.target ? m.upgradeTo(upgrade.target.name) : m.upgrade) : label}</Button><Dialog title={m.plans} description={m.choose} size="xl"><Offers onLeave={() => setOpen(false)} /></Dialog></DialogTrigger>;
}
