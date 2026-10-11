import { Dumbbell, Heart, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./LibraryDemo.module.css";

export function LibraryDemo() {
  const m = usePublicMessages();
  const l = m.home.library;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [activeFilter, setActiveFilter] = useState<number | null>(null);

  // Cycle through filters to show the list narrowing; stops once the visitor clicks a chip.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!inView || !auto || prefersReducedMotion()) return;
    let i = 0;
    const timer = setInterval(() => {
      setActiveFilter(i % (l.filters.length + 1) === l.filters.length ? null : i % (l.filters.length + 1));
      i++;
    }, 1700);
    return () => clearInterval(timer);
  }, [inView, auto, l.filters.length]);

  // Which sample items each filter keeps (illustrative).
  const matches: Record<number, number[]> = { 0: [0, 2], 1: [1], 2: [1, 2], 3: [0, 3] };
  const visible = (index: number) => activeFilter === null || matches[activeFilter]!.includes(index);

  return (
    <div ref={ref} className={styles.card} data-inview={inView || undefined}>
      <div className={styles.search} aria-hidden="true">
        <Search />
        <span>{activeFilter === null ? l.searchPlaceholder : l.filters[activeFilter]}</span>
      </div>
      <div className={styles.filters} role="group" aria-label={l.searchPlaceholder}>
        {l.filters.map((filter, i) => (
          <button
            key={filter}
            type="button"
            className={styles.filter}
            aria-pressed={activeFilter === i}
            onClick={() => {
              setAuto(false);
              setActiveFilter(activeFilter === i ? null : i);
            }}
          >
            {i === 3 ? <Heart aria-hidden="true" /> : null}
            {filter}
          </button>
        ))}
      </div>
      <ul role="list" className={styles.items}>
        {l.items.map((item, i) => (
          <li key={item.name} className={styles.item} data-hidden={!visible(i) || undefined} style={{ "--i": i } as React.CSSProperties}>
            <span className={styles.thumb} aria-hidden="true">
              <Dumbbell />
            </span>
            <span className={styles.text}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.meta}>{item.meta}</span>
            </span>
            {i === 0 || i === 3 ? <Heart className={styles.fav} aria-hidden="true" /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
