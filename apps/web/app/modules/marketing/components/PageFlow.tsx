import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./PageFlow.module.css";

type Wisp = { x: number; y: number; tilt: number; flip: boolean };

/** A few faint fibres running through each wisp, in the wisp's own 1000×600 box. */
const FIBRES = Array.from({ length: 9 }, (_, i) => {
  const t = (i / 8) * 2 - 1;
  return `M-40,${330 + t * 90}C260,${200 + t * 40},620,${430 - t * 50},1040,${250 + t * 120}`;
});

/**
 * Where the light sits: one wisp at every element marked `data-flow` (at `data-flow-x` of the width
 * and `data-flow-at` of the element's height), leaning alternately left and right down the page.
 */
function wisps(root: HTMLElement): Wisp[] {
  const width = root.clientWidth;
  const top = root.getBoundingClientRect().top;
  return [...root.querySelectorAll<HTMLElement>("[data-flow]")].map((mark, i) => {
    const rect = mark.getBoundingClientRect();
    return {
      x: width * Number(mark.dataset.flowX ?? 0.5),
      y: rect.top - top + rect.height * Number(mark.dataset.flowAt ?? 0.5),
      tilt: i % 2 ? 22 : -18,
      flip: i % 2 === 1,
    };
  });
}

/**
 * Smoky light behind the page below the hero: soft gradient wisps threaded with a few faint fibres,
 * the quiet echo of the hero's bundle. Everything here is static and filter-free, so the glass
 * panels above it never have to re-blur while the page scrolls.
 */
export function PageFlow({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Wisp[]>([]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setItems(wisps(root)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={[styles.page, className].filter(Boolean).join(" ")}>
      <div className={styles.layer} aria-hidden="true">
        {items.map((w, i) => (
          <div key={i} className={styles.wisp} data-flip={w.flip || undefined} style={{ left: w.x, top: w.y, rotate: `${w.tilt}deg` }}>
            <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className={styles.fibres}>
              {FIBRES.map((d, k) => (
                <path key={k} d={d} strokeWidth={k % 3 === 0 ? 1 : 0.6} strokeOpacity={0.35 + (k % 4) * 0.15} />
              ))}
            </svg>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}
