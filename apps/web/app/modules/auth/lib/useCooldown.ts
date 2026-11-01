import { useEffect, useState } from "react";

/** Seconds left before an action may run again; `start` begins a new wait. */
export function useCooldown(): [number, (seconds: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return [left, setLeft];
}
