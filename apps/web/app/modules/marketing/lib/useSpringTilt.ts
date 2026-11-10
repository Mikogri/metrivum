import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./useInView";

/**
 * Decorative pointer tilt with spring physics. Writes `transform` directly on the element
 * (no React state, no inherited CSS variables) so only that element restyles each frame.
 */
export function useSpringTilt<T extends HTMLElement>(
  base: string,
  strength = 6,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (
      !node ||
      prefersReducedMotion() ||
      !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    )
      return;
    const target = { x: 0, y: 0 };
    const value = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    const stiffness = 0.06;
    const damping = 0.82;
    let frame = 0;
    let running = false;

    const step = () => {
      for (const axis of ["x", "y"] as const) {
        velocity[axis] =
          (velocity[axis] + (target[axis] - value[axis]) * stiffness) * damping;
        value[axis] += velocity[axis];
      }
      node.style.transform = `${base} rotateX(${(-value.y * strength).toFixed(3)}deg) rotateY(${(value.x * strength).toFixed(3)}deg)`;
      const settled =
        Math.abs(velocity.x) < 0.0005 &&
        Math.abs(velocity.y) < 0.0005 &&
        Math.abs(target.x - value.x) < 0.001 &&
        Math.abs(target.y - value.y) < 0.001;
      if (settled) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    const kick = () => {
      if (!running) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    };
    const onMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      target.x = Math.max(
        -1,
        Math.min(
          1,
          (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2),
        ),
      );
      target.y = Math.max(
        -1,
        Math.min(
          1,
          (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2),
        ),
      );
      kick();
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      kick();
    };
    const zone = node.parentElement ?? node;
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerleave", onLeave);
    };
  }, [base, strength]);
  return ref;
}
