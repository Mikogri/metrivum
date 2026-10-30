import { Check, Minus, Sparkles, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ToggleButton, ToggleButtonGroup } from "react-aria-components";
import { Badge, Segment, SegmentedControl } from "@trainflow/ui-web";
import { catalogLimit, isTopTier, isWorkspacePlan, planLimitKeys, type CatalogPlan } from "~/shared/access/plan-catalog";
import { DISCOVERY_ENABLED } from "~/shared/features";
import { useSubscriptionMessages } from "~/shared/i18n/subscription-messages";
import styles from "./SubscriptionPanel.module.css";

/*
 * The plan cards as the app shows them, with no session or data fetching of their own: the subscription page, the
 * plans dialog and the public landing page all draw the same ladder switch, cards and feature lists from here.
 */

/** A yearly price is ten months: two months free. */
export const YEARLY_MONTHS = 10;
/** Plan prices are whole amounts: no cents on the cards. */
export const wholeMoney = (amount: number, currency: string) => new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(amount);

/** Capabilities listed on every plan card, with the server capability that switches each one on. */
const ALL_FEATURES = [
  ["basic", null], ["builder", "training.builder.advanced"], ["export", "training.export.pdf"], ["custom", "exercises.custom.create"],
  ["cloud", "video.analysis.cloud"], ["analytics", "analytics.advanced"], ["mcp", "integrations.mcp.write-training-drafts"],
  ["priority", "discovery.ranking.priority"], ["workspace", "organization.workspace.manage"],
] as const;
// Discovery priority is not listed while Discovery is switched off.
export const FEATURES = ALL_FEATURES.filter(([id]) => DISCOVERY_ENABLED || id !== "priority");

export type PlanKind = "Account" | "Workspace";
export const planKind = (plan: CatalogPlan): PlanKind => (isWorkspacePlan(plan) ? "Workspace" : "Account");

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

/** Which ladder to show (personal or workspace plans) and whether prices are monthly or yearly. */
export function PlanSwitches({ kind, onKind, yearly, onYearly }: { kind: PlanKind; onKind: (kind: PlanKind) => void; yearly: boolean; onYearly: (yearly: boolean) => void }) {
  const m = useSubscriptionMessages();
  return <div className={styles.switches}>
    <ToggleButtonGroup className={styles.kind} aria-label={m.kindLabel} selectionMode="single" disallowEmptySelection selectedKeys={[kind]} onSelectionChange={keys => onKind(String([...keys][0] ?? "Account") as PlanKind)}>
      <ToggleButton id="Account" className={styles.kindOption} aria-label={m.individual}><span className={styles.kindIcon} aria-hidden="true"><User /></span><span className={styles.kindText}><strong>{m.individual}</strong><small>{m.individualSub}</small></span></ToggleButton>
      <ToggleButton id="Workspace" className={styles.kindOption} data-kind="workspace" aria-label={m.teams}><span className={styles.kindIcon} aria-hidden="true"><Users /></span><span className={styles.kindText}><strong>{m.teams}</strong><small>{m.teamsSub}</small></span></ToggleButton>
    </ToggleButtonGroup>
    <SegmentedControl size="md" aria-label={m.billingLabel} selectedKeys={[yearly ? "year" : "month"]} onSelectionChange={keys => onYearly([...keys][0] === "year")}>
      <Segment id="month">{m.monthly}</Segment>
      <Segment id="year">{m.yearly} <span className={styles.save}>{m.yearlySave}</span></Segment>
    </SegmentedControl>
  </div>;
}

/** The cards of one ladder, side by side. */
export function PlanGrid({ count, children }: { count: number; children: ReactNode }) {
  return <div className={styles.offers} style={{ "--count": count } as React.CSSProperties}>{children}</div>;
}

/**
 * One plan: name, price (monthly, or ten months a year), the limits and features it includes, then its action.
 * The ladder's best plan wears the Upgrade look.
 */
export function PlanCard({ plan, plans, yearly, current = false, action }: { plan: CatalogPlan; plans: CatalogPlan[]; yearly: boolean; current?: boolean; action: (best: boolean) => ReactNode }) {
  const m = useSubscriptionMessages();
  const workspace = isWorkspacePlan(plan);
  const amount = plan.priceConfigured && plan.amount != null ? Number(plan.amount) * (yearly && Number(plan.amount) > 0 ? YEARLY_MONTHS : 1) : null;
  const price = amount != null ? wholeMoney(amount, plan.currency) : null;
  const best = isTopTier(plan, plans);
  return <article className={styles.offer} data-current={current || undefined} data-featured={best || undefined} data-kind={workspace ? "workspace" : "personal"}>
    <div className={styles.top}>
      {best ? <span className={styles.bestTag}><Sparkles aria-hidden="true" />{m.best}</span> : null}
      <header className={styles.head}><h3>{plan.name}</h3>{current ? <Badge tone="success">{m.current}</Badge> : null}</header>
      <p className={styles.price}><strong>{price ?? "—"}</strong><span>{price ? yearly && Number(plan.amount) > 0 ? workspace ? m.workspaceYear : m.year : workspace ? m.workspaceMonth : m.month : m.notConfigured}</span></p>
    </div>
    <PlanHighlights plan={plan} />
    {action(best)}
  </article>;
}

/** The class the best plan's action takes to look like the app bar's Upgrade button. */
export const upgradeClass = (best: boolean) => (best ? `${styles.cta} ${styles.upgrade}` : styles.cta);
