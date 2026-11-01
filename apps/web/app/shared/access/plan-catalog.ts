import type { Schema } from "@metrivum/api-client-web";

/** Amounts, limits and eligibility always come from the server catalog. */
export type CatalogPlan = Schema<"PlatformPlanDto">;

export const planLimitKeys = ["coaching.active_clients", "organization.coach_seats", "training.generator.runs_per_period", "video.local_analyses_per_period", "video.cloud_gpu_seconds_per_period"] as const;

export function catalogLimit(plan: CatalogPlan, key: string): number | null | undefined {
  const value = plan.limits?.[key];
  return value == null ? value : Number(value);
}

export function isWorkspacePlan(plan: CatalogPlan) {
  return plan.priceScope === "Workspace";
}

export function planChangeKind(plans: CatalogPlan[], currentId: string, nextId: string) {
  const current = plans.find(plan => plan.id === currentId);
  const next = plans.find(plan => plan.id === nextId);
  if (!current || !next || current.currency !== next.currency) return "checkout";
  return Number(next.amount) < Number(current.amount) ? "downgrade" : "checkout";
}

/**
 * The highest tier of its kind (personal and workspace plans rank separately), so there is no upgrade from it. A server
 * that does not send tiers yet falls back to the most expensive plan of the same kind in the given catalog.
 */
export function isTopTier(plan: CatalogPlan, plans: readonly CatalogPlan[] = []) {
  if (plan.tier != null && plan.topTier != null) return Number(plan.tier) >= Number(plan.topTier);
  const kin = plans.filter((other) => isWorkspacePlan(other) === isWorkspacePlan(plan));
  return kin.length > 0 && kin.every((other) => Number(other.amount ?? 0) <= Number(plan.amount ?? 0));
}
