import { useLayoutEffect, useRef, type RefObject } from "react";

/** One motion for the whole sheet: cards move, widen and grow with the same timing, so x and y change together. */
export const SHEET_MOTION_MS = 360;
/** Ease-out cubic, the same curve the column widths use. */
export const SHEET_MOTION_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";

/**
 * A card's height follows its content (a workout opened, rows added), so on its own it would jump.
 * When `change` is new (cards opened, folded or edited), the render notes how tall each card is on screen before the
 * update; after it, a card whose height changed animates from that height to the new one, its content clipped
 * meanwhile. A change in the middle of an animation starts from where the card is at that moment.
 */
export function useSmoothCardHeights(
  boardRef: RefObject<HTMLElement | null>,
  change: unknown,
  paused: boolean,
) {
  const running = useRef(new Map<string, Animation>());
  const measured = useRef<{ change: unknown; heights: Map<string, number> }>({
    change,
    heights: new Map(),
  });
  // The DOM still shows the previous state while rendering: read the heights before React updates it.
  if (measured.current.change !== change) {
    const heights = new Map<string, number>();
    boardRef.current
      ?.querySelectorAll<HTMLElement>("[data-node-id]")
      .forEach((node) => heights.set(node.dataset.nodeId!, node.offsetHeight));
    measured.current = { change, heights };
  }
  const handled = useRef(change);
  useLayoutEffect(() => {
    if (handled.current === change) return;
    handled.current = change;
    const board = boardRef.current;
    if (!board) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const heights = measured.current.heights;
    for (const node of board.querySelectorAll<HTMLElement>("[data-node-id]")) {
      const id = node.dataset.nodeId!;
      const before = heights.get(id);
      running.current.get(id)?.cancel();
      running.current.delete(id);
      const to = node.offsetHeight;
      if (
        paused ||
        reduced ||
        before == null ||
        Math.abs(before - to) < 2 ||
        node.hasAttribute("data-hidden") ||
        node.hasAttribute("data-dragging") ||
        typeof node.animate !== "function"
      )
        continue;
      // Sockets sit just outside the card's edge: keep them visible while the content is clipped.
      const frame = { overflow: "clip", overflowClipMargin: "16px" };
      const animation = node.animate(
        [
          { ...frame, height: `${before}px` },
          { ...frame, height: `${to}px` },
        ],
        { duration: SHEET_MOTION_MS, easing: SHEET_MOTION_EASING },
      );
      running.current.set(id, animation);
      animation.onfinish = () => {
        if (running.current.get(id) === animation) running.current.delete(id);
      };
    }
  });
}
