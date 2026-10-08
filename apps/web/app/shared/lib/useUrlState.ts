import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * List state (search, filters, sort, folder, page) lives in the URL so it survives refresh,
 * back/forward and sharing. Changing anything but the page resets the page.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as K[]) {
      const value = params.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
    // defaults are static per screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = useCallback(
    (patch: Partial<Record<K | "page", string | null>>, options: { replace?: boolean } = {}) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const touchesFilters = Object.keys(patch).some((key) => key !== "page");
          for (const [key, value] of Object.entries(patch) as Array<[string, string | null | undefined]>) {
            const fallback = (defaults as Record<string, string>)[key];
            if (value === null || value === undefined || value === "" || value === fallback) next.delete(key);
            else next.set(key, value);
          }
          if (touchesFilters && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: options.replace ?? true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );

  return [state, update] as const;
}

export function pageFromParam(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}
