import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * In-app "back" arrows mean "up a level", not "the previous page". Going list → plan → editor and
 * pressing back twice must end on the list, not bounce between the plan and the editor.
 *
 * The app remembers which address each history entry holds (React Router numbers them in
 * `history.state.idx`). Going up then steps back to the nearest earlier entry that is the parent,
 * so the browser's own Back stays in step, and only opens the parent fresh when it was never visited.
 */
const trail = new Map<number, string>();

function currentIndex(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

/** Records the address of each history entry. Mount once, high in the app. */
export function useHistoryTrail() {
  const location = useLocation();
  useEffect(() => {
    trail.set(currentIndex(), location.pathname + location.search);
  }, [location.key, location.pathname, location.search]);
}

/** How far back the nearest entry showing `target` is (pathname match, or exact address when it has a query). */
export function stepsBackTo(target: string, from = currentIndex(), entries: ReadonlyMap<number, string> = trail): number | null {
  const hasQuery = target.includes("?");
  for (let i = from - 1; i >= 0; i--) {
    const address = entries.get(i);
    if (address === undefined) return null;
    if (hasQuery ? address === target : address.split("?")[0] === target) return from - i;
  }
  return null;
}

/** Returns a function that goes up to `target`: back through history when it is there, else to it. */
export function useNavigateUp() {
  const navigate = useNavigate();
  return useCallback(
    (target: string) => {
      const steps = stepsBackTo(target);
      if (steps) navigate(-steps);
      else navigate(target);
    },
    [navigate],
  );
}
