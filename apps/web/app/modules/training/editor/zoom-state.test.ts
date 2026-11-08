import { expect, it, vi } from "vitest";
import { createZoomState } from "./zoom-state";
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
