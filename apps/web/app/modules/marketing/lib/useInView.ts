import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Marks an element once it scrolls into view. Marketing reveals key off this so that
 * each section's motion plays when it is actually seen, not all at load.
 */
export function useInView<T extends Element>(options: { margin?: string; once?: boolean } = {}): [RefObject<T | null>, boolean] {
  const { margin = "0px 0px -15% 0px", once = true } = options;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin: margin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, once]);
  return [ref, inView];
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
