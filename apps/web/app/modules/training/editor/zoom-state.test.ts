import { expect, it, vi } from "vitest";
import { createZoomState, zoomAt, ZOOM_DURATION_MS } from "./zoom-state";
it("notifies zoom controls only for changed snapshots and supports independent subscriptions", () => {
  const state = createZoomState(1);
  const listener = vi.fn();
  const stop = state.subscribe(listener);
  state.set(1);
  expect(listener).not.toHaveBeenCalled();
  state.set(1.2);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(state.getSnapshot()).toBe(1.2);
  stop(); state.set(0.8);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(createZoomState(1).getSnapshot()).toBe(1);
});

it("has identical elapsed-time progress at different frame rates and completes after 200ms", () => {
  expect(ZOOM_DURATION_MS).toBe(200);
  for (const frameInterval of [8, 16, 50, 120]) {
    for (let now = 0; now < 100; now += frameInterval) zoomAt(1, 1.2, 0, now);
    expect(zoomAt(1, 1.2, 0, 100)).toBeCloseTo(1.175);
    expect(zoomAt(1, 1.2, 0, 200)).toBe(1.2);
  }
  expect(zoomAt(1.2, 0.8, 100, 500)).toBe(0.8);
  expect(zoomAt(1, 1.2, 0, 0, true)).toBe(1.2);
});
