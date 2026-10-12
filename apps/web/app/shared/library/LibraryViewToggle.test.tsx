import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useLibraryView } from "./LibraryViewToggle";

const viewport = vi.hoisted(() => ({ phone: true }));
vi.mock("@trainflow/ui-web", () => ({ useMobileLayout: () => viewport.phone }));

it("uses phone cards without losing the desktop list preference on resize", () => {
  const hook = renderHook(() => useLibraryView("list"));
  expect(hook.result.current).toBe("cards");
  viewport.phone = false;
  hook.rerender();
  expect(hook.result.current).toBe("list");
});

it("retains an explicit desktop card preference", () => {
  viewport.phone = false;
  expect(renderHook(() => useLibraryView("cards")).result.current).toBe("cards");
});
