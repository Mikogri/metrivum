/** Local animation snapshots are observed only by zoom controls, not the card tree. */
export function createZoomState(initial: number) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(next: number) { if (Object.is(value, next)) return; value = next; listeners.forEach(listener => listener()); },
  };
}
export type ZoomState = ReturnType<typeof createZoomState>;
