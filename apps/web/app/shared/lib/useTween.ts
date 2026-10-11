import { useEffect, useRef, useState } from "react";

/** The previous values stretched or squeezed to `length` points, so charts of different sizes can morph. */
function resample(values: number[], length: number) {
  if (values.length === length || !values.length) return values;
  return Array.from({ length }, (_, i) => {
    const at = length === 1 ? 0 : (i / (length - 1)) * (values.length - 1);
    const low = Math.floor(at);
    const high = Math.min(values.length - 1, low + 1);
    return values[low]! + (values[high]! - values[low]!) * (at - low);
  });
}

/**
 * Chart values that glide to new data instead of jumping. The first render shows the data as is;
 * later changes ease from what is on screen to the new values. With reduced motion, or where
 * animation frames are unavailable, the new values appear at once.
 */
export function useTween(target: number[], duration = 450): number[] {
  const [shown, setShown] = useState(target);
  const onScreen = useRef(target);
  const latest = useRef(target);
  latest.current = target;
  const key = target.join(",");
  useEffect(() => {
    const goal = latest.current;
    const from = resample(onScreen.current, goal.length);
    const still = typeof requestAnimationFrame === "undefined" || typeof matchMedia === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || from.length !== goal.length || from.every((value, i) => value === goal[i])) {
      onScreen.current = goal;
      setShown(goal);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = goal.map((value, i) => from[i]! + (value - from[i]!) * eased);
      onScreen.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, duration]);
  // A change in the number of points is drawn straight away; the tween catches up on the next frame.
  return shown.length === target.length ? shown : target;
}
