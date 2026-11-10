import { useCallback, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

const VIEW_PREFIX = "tf.view:";

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit only.
  }
}

/**
 * List state (search, filters, sort, folder, page) lives in the URL so it survives refresh,
 * back/forward and sharing. Changing anything but the page resets the page.
 *
 * A `view` key (cards / table) is also remembered per page in this browser: the last choice
 * becomes the page's default, while an explicit `?view=` in the URL still wins.
 */
export function useUrlState<K extends string>(
  staticDefaults: Record<K, string>,
) {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const viewKey = VIEW_PREFIX + pathname;
  const hasView = "view" in staticDefaults;
  const [rememberedView, setRememberedView] = useState(() =>
    hasView ? readStored(viewKey) : null,
  );
  const defaults = useMemo(
    () =>
      hasView && rememberedView
        ? { ...staticDefaults, view: rememberedView }
        : staticDefaults,
    // static defaults per screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rememberedView],
  );
  const state = useMemo(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as K[]) {
      const value = params.get(key);
      if (value !== null) result[key] = value;
    }
    return result;
  }, [params, defaults]);

  const update = useCallback(
    (
      patch: Partial<Record<K | "page", string | null>>,
      options: { replace?: boolean } = {},
    ) => {
      const view = (patch as Record<string, string | null | undefined>).view;
      if (hasView && view) {
        writeStored(viewKey, view);
        setRememberedView(view);
      }
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const touchesFilters = Object.keys(patch).some(
            (key) => key !== "page",
          );
          for (const [key, value] of Object.entries(patch) as Array<
            [string, string | null | undefined]
          >) {
            // The view keeps its static fallback, so an explicit choice stays in the URL; the remembered
            // value only fills in when the URL has none.
            const fallback =
              key === "view"
                ? (staticDefaults as Record<string, string>)[key]
                : (defaults as Record<string, string>)[key];
            if (
              value === null ||
              value === undefined ||
              value === "" ||
              value === fallback
            )
              next.delete(key);
            else next.set(key, value);
          }
          if (touchesFilters && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: options.replace ?? true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams, defaults, viewKey, hasView],
  );

  return [state, update] as const;
}

export function pageFromParam(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}
