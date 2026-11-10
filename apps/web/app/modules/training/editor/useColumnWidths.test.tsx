import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useColumnWidths } from "./useColumnWidths";

afterEach(() => vi.unstubAllGlobals());
it("interpolates one shared width map, retargets from the current frame and cancels on unmount", () => {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
  const step = (now: number) =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    });
  const { result, rerender, unmount } = renderHook(
    ({ width, immediate }) => useColumnWidths({ 1: width }, immediate),
    { initialProps: { width: 104, immediate: false } },
  );
  rerender({ width: 200, immediate: false });
  step(100);
  step(210);
  expect(result.current[1]).toBeGreaterThan(104);
  expect(result.current[1]).toBeLessThan(200);
  const midway = result.current[1];
  rerender({ width: 80, immediate: false });
  step(300);
  expect(result.current[1]).toBe(midway);
  step(520);
  expect(result.current[1]).toBe(80);
  rerender({ width: 240, immediate: true });
  expect(result.current[1]).toBe(240);
  unmount();
  expect(frames.size).toBe(0);
});

it("does not schedule animation frames for unchanged effective widths", () => {
  const frame = vi.fn();
  vi.stubGlobal("requestAnimationFrame", frame);
  const { rerender } = renderHook(
    ({ widths }) => useColumnWidths(widths, false),
    { initialProps: { widths: { 1: 104 } } },
  );
  expect(frame).not.toHaveBeenCalled();
  rerender({ widths: { 1: 104 } });
  expect(frame).not.toHaveBeenCalled();
});
