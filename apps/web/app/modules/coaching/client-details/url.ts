import { useSearchParams } from "react-router";

/**
 * Namespaced filters coexist across the six relationship tabs. Tab and filter changes replace the
 * history entry, so Back leaves the client instead of stepping through the tabs.
 */
export function useClientDetailsUrl() {
  const [params, setParams] = useSearchParams();
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(patch)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  return { params, update };
}
export function endExclusive(date: string | null) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const next = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(next.getTime())) return undefined;
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}
