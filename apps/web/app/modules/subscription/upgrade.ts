import type { Schema } from "@metrivum/api-client-web";
import { useCoachingQuery } from "~/modules/coaching";
import { isTopTier, isWorkspacePlan, type CatalogPlan } from "~/shared/access/plan-catalog";

type Subscription = Schema<"PlatformSubscriptionDto">;
type TeamAccess = Schema<"TeamAccess">;
type TeamBilling = Schema<"TeamBillingDto">;

/**
 * Whether there is a higher plan to offer, and which: the top tier of the kind the account is on (its Team's plan
 * when it has one, otherwise the personal plan). Plans rank by the server's tier within their kind, never by name.
 */
export function useUpgrade(): { available: boolean; target: CatalogPlan | null } {
  const plans = useCoachingQuery<CatalogPlan[]>("/api/v1/subscriptions/plans");
  const personal = useCoachingQuery<Subscription>("/api/v1/me/platform-subscription");
  const team = useCoachingQuery<TeamAccess | null>("/api/v1/me/team-context");
  const teamId = team.data?.isActive ? team.data.teamId : null;
  const billing = useCoachingQuery<TeamBilling>(`/api/v1/teams/${teamId}/billing`, undefined, Boolean(teamId));
  const find = (planId: string | undefined) => (planId ? plans.data?.find((p) => p.id === planId) : undefined);
  const teamPlan = find(billing.data?.planId);
  const personalPlan = find(personal.data?.planId);
  const all = plans.data ?? [];
  const onTop = Boolean((teamPlan && isTopTier(teamPlan, all)) || (personalPlan && isTopTier(personalPlan, all)));
  // The ladder to climb: the Team's kind when there is a Team plan, otherwise personal plans.
  const workspace = teamPlan ? true : false;
  const target = plans.data?.find((p) => isWorkspacePlan(p) === workspace && isTopTier(p, all)) ?? null;
  return { available: !onTop, target };
}
