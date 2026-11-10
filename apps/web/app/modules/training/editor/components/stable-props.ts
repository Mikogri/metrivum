import { useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => any;
type Handlers = Record<string, Fn | undefined>;

/**
 * Stable callbacks for cards drawn in a list. Each card gets functions whose identity never changes (so a memoised
 * card can skip re-rendering), while every call goes to the newest function passed on the latest render.
 */
export function useStableHandlers() {
  const latest = useRef(new Map<string, Handlers>());
  const proxies = useRef(new Map<string, { keys: string; fns: Handlers }>());
  return <T extends Handlers>(id: string, handlers: T): T => {
    latest.current.set(id, handlers);
    const keys = Object.keys(handlers)
      .filter((key) => typeof handlers[key] === "function")
      .sort()
      .join("|");
    const cached = proxies.current.get(id);
    if (cached && cached.keys === keys)
      return { ...handlers, ...cached.fns } as T;
    const fns: Handlers = {};
    for (const key of keys ? keys.split("|") : [])
      fns[key] = (...args: unknown[]) =>
        latest.current.get(id)?.[key]?.(...args);
    proxies.current.set(id, { keys, fns });
    return { ...handlers, ...fns } as T;
  };
}

/**
 * Props equality for memoised cards: functions only need to stay present or absent (they are stable proxies), style
 * objects compare by their values, everything else by identity.
 */
export function sameCardProps(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const a = previous[key];
    const b = next[key];
    if (typeof a === "function" || typeof b === "function") {
      if (typeof a !== typeof b) return false;
      continue;
    }
    if (
      key === "style" &&
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object"
    ) {
      const styleA = a as Record<string, unknown>;
      const styleB = b as Record<string, unknown>;
      const styleKeys = new Set([
        ...Object.keys(styleA),
        ...Object.keys(styleB),
      ]);
      for (const styleKey of styleKeys)
        if (styleA[styleKey] !== styleB[styleKey]) return false;
      continue;
    }
    if (
      key === "size" &&
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object"
    ) {
      const sizeA = a as { cols: number; rows: number };
      const sizeB = b as { cols: number; rows: number };
      if (sizeA.cols !== sizeB.cols || sizeA.rows !== sizeB.rows) return false;
      continue;
    }
    if (a !== b) return false;
  }
  return true;
}
