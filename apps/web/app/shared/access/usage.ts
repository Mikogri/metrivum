import { useAccessSnapshot } from "./useFeatureAccess";
import { useQuotaContext } from "./QuotaContext";

/** One limit as the usage page and the near-limit warnings show it. */
export type UsageItem = {
  key: string;
  used: number;
  /** null: no limit on this plan. */
  maximum: number | null;
  /** Counted in the current billing period (resets), rather than a standing cap. */
  period: boolean;
  resetAt: string | null;
  /** used / maximum, 0 when there is no limit. */
  ratio: number;
};

/** Share of a limit from which the app warns that it is nearly used up. */
export const NEAR_LIMIT = 0.8;

/** Caps on a single item (file size, video length) are not used up over time, so they never warn. */
export const isCap = (key: string) => /bytes|duration|size/i.test(key);

/** A limit is close when something countable has used at least NEAR_LIMIT of it. */
export const isNear = (item: UsageItem) => item.maximum !== null && item.maximum > 0 && !isCap(item.key) && item.ratio >= NEAR_LIMIT;

const UNLIMITED = 1e12;

function toItem(limit: { key: string; used: number | string; maximum: null | number | string; resetAt?: string | null }, period: boolean): UsageItem {
  const used = Number(limit.used);
  const raw = limit.maximum == null ? null : Number(limit.maximum);
  const maximum = raw === null || raw >= UNLIMITED ? null : raw;
  return { key: limit.key, used, maximum, period, resetAt: limit.resetAt ?? null, ratio: maximum ? Math.min(1, used / maximum) : 0 };
}

/**
 * Every limit of the account: what this billing period has used (from /me/usage, for the chosen quota scope) and the
 * standing plan limits (from the access snapshot). A key in both is shown once, as the period figure.
 */
export function useUsage() {
  const context = useQuotaContext();
  const access = useAccessSnapshot();
  const periodItems = (context.usage.data?.usage ?? []).map((limit) => toItem(limit, true));
  const seen = new Set(periodItems.map((item) => item.key));
  const planItems = (access.data?.limits ?? []).filter((limit) => !seen.has(limit.key)).map((limit) => toItem(limit, false));
  // Coach seats belong to a Team (studio): shown only in a Team's scope, to its owner or admins.
  const teamAdmin = Boolean(context.teamId) && /^(owner|admin)$/i.test(context.team.data?.role ?? "");
  const items = [...periodItems, ...planItems].filter((item) => !/seat/i.test(item.key) || teamAdmin);
  return {
    context,
    items,
    near: items.filter(isNear),
    period: context.usage.data ? { start: context.usage.data.periodStart, end: context.usage.data.periodEnd } : null,
    pending: context.usage.isPending || access.isPending,
    error: context.usage.error ?? access.error,
  };
}
