/** Local animation snapshots are observed only by zoom controls, not the card tree. */
export function createZoomState(initial: number) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(next: number) {
      if (Object.is(value, next)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
  };
}
export type ZoomState = ReturnType<typeof createZoomState>;

export const ZOOM_DURATION_MS = 200;
/** Elapsed time, not the number of available frames, determines zoom progress. */
export function zoomAt(
  from: number,
  to: number,
  startedAt: number,
  now: number,
  reducedMotion = false,
) {
  const progress = reducedMotion
    ? 1
    : Math.max(0, Math.min(1, (now - startedAt) / ZOOM_DURATION_MS));
  return progress === 1 ? to : from + (to - from) * (1 - (1 - progress) ** 3);
}
