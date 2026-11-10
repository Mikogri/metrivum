import { afterEach, describe, expect, it, vi } from "vitest";
import { overlayPosition, overlayViewport } from "./overlay-position";

afterEach(() => vi.restoreAllMocks());

describe("overlay placement", () => {
  const viewport = { width: 800, height: 600 };
  it("flips above and left instead of shrinking a menu near the lower right corner", () => {
    expect(
      overlayPosition(
        { left: 760, right: 790, top: 540, bottom: 570 },
        { width: 300, height: 250 },
        viewport,
      ),
    ).toEqual({ left: 490, top: 286 });
  });
  it("opens below when it fits and clamps oversized content to the viewport", () => {
    expect(
      overlayPosition(
        { left: 10, right: 50, top: 20, bottom: 50 },
        { width: 300, height: 250 },
        viewport,
      ),
    ).toEqual({ left: 10, top: 54 });
    expect(
      overlayPosition(
        { left: 790, right: 790, top: 590, bottom: 590 },
        { width: 1000, height: 1000 },
        viewport,
      ),
    ).toEqual({ left: 8, top: 8 });
  });
  it("excludes root and edge-aligned application scrollbars before deciding where to flip", () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      1024,
    );
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      768,
    );
    const container = document.createElement("main");
    container.style.overflowY = "auto";
    document.body.append(container);
    Object.defineProperties(container, {
      clientWidth: { value: 809 },
      clientHeight: { value: 600 },
      scrollHeight: { value: 1200 },
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 200,
      right: 1024,
      top: 0,
      bottom: 768,
    } as DOMRect);
    const trigger = document.createElement("button");
    container.append(trigger);
    const viewport = overlayViewport(trigger);
    expect(viewport.width).toBe(1009);
    const position = overlayPosition(
      { left: 1000, right: 1010, top: 720, bottom: 740 },
      { width: 300, height: 200 },
      viewport,
    );
    expect(position.left + 300).toBeLessThanOrEqual(1001);
    expect(position.top).toBeLessThan(720);
    container.remove();
  });
  it("does not constrain a portaled menu to an interior scroll panel", () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      1024,
    );
    const container = document.createElement("div");
    container.style.overflowY = "auto";
    Object.defineProperties(container, {
      clientWidth: { value: 300 },
      clientHeight: { value: 200 },
      scrollHeight: { value: 500 },
    });
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 315,
      top: 0,
      bottom: 200,
    } as DOMRect);
    expect(overlayViewport(container).width).toBe(1024);
  });
});
