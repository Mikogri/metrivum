import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileLayout } from "./useMobileLayout";

afterEach(() => vi.restoreAllMocks());

it("updates mounted consumers at the phone boundary and releases the listener", () => {
  let width = 767;
  const listeners = new Set<() => void>();
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    get matches() { return width <= 767 && query === "(max-width: 767px)"; },
    media: query, onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener as () => void),
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener as () => void),
    addListener() {}, removeListener() {}, dispatchEvent: () => true,
  } as MediaQueryList));
  const { result, unmount } = renderHook(useMobileLayout);
  expect(result.current).toBe(true);
  act(() => { width = 768; listeners.forEach(listener => listener()); });
  expect(result.current).toBe(false);
  unmount();
  expect(listeners.size).toBe(0);
});

it("renders the server fallback without reading a browser media query", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(() => { throw new Error("Browser access during SSR"); });
  function Layout() { return <span>{useMobileLayout() ? "phone" : "desktop"}</span>; }
  expect(renderToString(<Layout />)).toBe("<span>desktop</span>");
});
