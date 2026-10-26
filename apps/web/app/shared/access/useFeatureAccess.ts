import { useQuery } from "@tanstack/react-query";
import type { FeatureKey, FeatureReason, LimitDecision } from "@trainflow/api-client-web";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getAccess } from "./api";

export const accessKey = (accountKey: string) => [accountKey, "access"] as const;

export function useAccessSnapshot() {
  const api = useApi();
  const accountKey = useAccountKey();
  return useQuery({
    queryKey: accessKey(accountKey),
    queryFn: ({ signal }) => getAccess(api, signal),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export type FeatureState = "loading" | FeatureReason | "unknown";

export interface FeatureAccess {
  state: FeatureState;
  /** True only for an explicit `available` decision from the API. Unknown or missing = closed. */
  allowed: boolean;
  /** Decision is still loading (render a neutral placeholder, not an open control). */
  pending: boolean;
}

export function decide(features: Array<{ key: string; available: boolean; reason: string }> | undefined, key: FeatureKey): FeatureAccess {
  if (!features) return { state: "loading", allowed: false, pending: true };
  const decision = features.find((f) => f.key === key);
  if (!decision) return { state: "unknown", allowed: false, pending: false };
  const known = ["available", "feature_not_in_plan", "not_granted", "explicit_deny", "operationally_disabled", "dependency_unavailable", "limit_reached"];
  const state = (known.includes(decision.reason) ? decision.reason : "unknown") as FeatureState;
  return { state, allowed: decision.available === true && decision.reason === "available", pending: false };
}

export function useFeatureAccess(key: FeatureKey): FeatureAccess {
  const { data, isError } = useAccessSnapshot();
  if (isError && !data) return { state: "unknown", allowed: false, pending: false };
  return decide(data?.features, key);
}

/** Several decisions at once, e.g. for a toolbar. */
export function useFeatures<K extends FeatureKey>(keys: readonly K[]): Record<K, FeatureAccess> {
  const { data, isError } = useAccessSnapshot();
  const result = {} as Record<K, FeatureAccess>;
  for (const key of keys) result[key] = isError && !data ? { state: "unknown", allowed: false, pending: false } : decide(data?.features, key);
  return result;
}

export function useLimit(key: string): LimitDecision | undefined {
  return useAccessSnapshot().data?.limits.find((limit) => limit.key === key);
}
