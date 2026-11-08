import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSheetViewport } from "./SheetMinimap";

afterEach(() => vi.unstubAllGlobals());
it("coalesces scrolling in the minimap without rerendering its parent and cleans up", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => frames.delete(frame));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const element = document.createElement("div");
  Object.defineProperties(element, { clientWidth: { value: 400 }, clientHeight: { value: 200 } });
  const scroller = { current: element };
  let parentRenders = 0;
  function View({ zoom }: { zoom: number }) { const view = useSheetViewport(scroller, zoom); return <output>{JSON.stringify(view)}</output>; }
  function Parent({ zoom }: { zoom: number }) { parentRenders++; return <View zoom={zoom} />; }
  const { unmount, rerender } = render(<Parent zoom={2} />);
  const flush = () => act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(0)); });
  act(() => { element.scrollLeft = 100; element.scrollTop = 60; for (let i = 0; i < 20; i++) element.dispatchEvent(new Event("scroll")); });
  expect(frames.size).toBe(1);
  flush();
  expect(parentRenders).toBe(1);
  expect(screen.getByRole("status")).toHaveTextContent(JSON.stringify({ x: 50, y: 30, w: 200, h: 100 }));
  rerender(<Parent zoom={1} />);
  expect(screen.getByRole("status")).toHaveTextContent(JSON.stringify({ x: 100, y: 60, w: 400, h: 200 }));
  act(() => element.dispatchEvent(new Event("scroll")));
  unmount();
  expect(frames.size).toBe(0);
  element.dispatchEvent(new Event("scroll"));
  expect(frames.size).toBe(0);
});
