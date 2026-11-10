import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./SetKinds.module.css";

type Kind =
  | "Standard"
  | "Amrap"
  | "TopSet"
  | "Ramp"
  | "DropSet"
  | "RestPause"
  | "Cluster";

// Bar heights (0–1) and gaps sketch the shape of each set type; illustrative only.
const SHAPES: Record<
  Kind,
  { bars: number[]; gaps?: number[]; accent?: number[]; open?: boolean }
> = {
  Standard: { bars: [0.62, 0.62, 0.62, 0.62] },
  Amrap: { bars: [0.66], open: true },
  TopSet: { bars: [0.92, 0.72, 0.72, 0.72], accent: [0] },
  Ramp: { bars: [0.38, 0.5, 0.62, 0.74, 0.86] },
  DropSet: { bars: [0.86, 0.68, 0.5, 0.34], gaps: [0, 0, 0] },
  RestPause: { bars: [0.7, 0.36, 0.24], gaps: [1, 1] },
  Cluster: { bars: [0.44, 0.44, 0.44, 0.44, 0.44], gaps: [1, 1, 1, 1] },
};
const ORDER: Kind[] = [
  "Standard",
  "Amrap",
  "TopSet",
  "Ramp",
  "DropSet",
  "RestPause",
  "Cluster",
];

export function SetKinds() {
  const m = usePublicMessages();
  const s = m.home.sets;
  const [active, setActive] = useState<Kind>("TopSet");
  const [ref, inView] = useInView<HTMLDivElement>();
  const paused = useRef(false);

  // Auto-advance until the visitor takes over.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      if (paused.current) return;
      setActive(
        (current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!,
      );
    }, 2800);
    return () => clearInterval(timer);
  }, [inView]);

  const shape = SHAPES[active];
  const label =
    active === "TopSet"
      ? `${s.kinds.TopSet} + ${s.kinds.BackOff}`
      : s.kinds[active];

  return (
    <div
      ref={ref}
      className={styles.wrap}
      onPointerEnter={() => (paused.current = true)}
      onPointerLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <div className={styles.list} role="group" aria-label={s.title}>
        {ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={active === kind}
            className={styles.kind}
            onClick={() => {
              paused.current = true;
              setActive(kind);
            }}
          >
            <span className={styles.kindName}>
              {kind === "TopSet"
                ? `${s.kinds.TopSet} → ${s.kinds.BackOff}`
                : s.kinds[kind]}
            </span>
            <span className={styles.kindNote}>
              {kind === "TopSet"
                ? `${s.kindNotes.TopSet}; ${s.kindNotes.BackOff.toLowerCase()}`
                : s.kindNotes[kind]}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.visual}>
        <p className={styles.visualLabel}>{label}</p>
        <div className={styles.bars} data-open={shape.open || undefined}>
          {Array.from({ length: 5 }, (_, i) => {
            const h = shape.bars[i];
            const gap = shape.gaps?.[i - 1];
            return (
              <span
                key={i}
                className={styles.bar}
                data-hidden={h === undefined || undefined}
                data-accent={shape.accent?.includes(i) || undefined}
                data-gap={gap ? true : undefined}
                style={{ "--h": h ?? 0.05, "--i": i } as React.CSSProperties}
              />
            );
          })}
          {active === "TopSet" ? (
            <span className={styles.reference} aria-hidden="true" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
