import { useEffect, useRef, useState } from "react";
import { columnWidth, type ColumnWidths } from "./model/layout";
import { SHEET_MOTION_MS } from "./useSmoothCardHeights";

/** One interpolated geometry keeps headers, cards, grid lines and cables aligned. */
export function useColumnWidths(target: ColumnWidths, immediate: boolean) {
  const [current, setCurrent] = useState(target);
  const latest = useRef(current);
  const key = JSON.stringify(target);
  useEffect(() => {
    const from = latest.current;
    const destination: ColumnWidths = JSON.parse(key);
    const columns = [
      ...new Set([...Object.keys(from), ...Object.keys(destination)]),
    ];
    // Opening cards must not animate an unchanged geometry for another animation.
    if (
      columns.every(
        (col) =>
          columnWidth(from, Number(col)) ===
          columnWidth(destination, Number(col)),
      )
    )
      return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let start: number | undefined;
    let frame = 0;
    const tick = (now: number) => {
      start ??= now;
      const progress =
        immediate || reduced ? 1 : Math.min(1, (now - start) / SHEET_MOTION_MS);
      const ease = 1 - (1 - progress) ** 3;
      const value =
        progress === 1
          ? destination
          : Object.fromEntries(
              columns.map((col) => [
                col,
                columnWidth(from, Number(col)) +
                  (columnWidth(destination, Number(col)) -
                    columnWidth(from, Number(col))) *
                    ease,
              ]),
            );
      latest.current = value;
      setCurrent(value);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, immediate]);
  return immediate ? target : current;
}
