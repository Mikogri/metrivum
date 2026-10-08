import { useState } from "react";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./CycleMap.module.css";

// Training-day patterns per cycle length (illustrative). 1 = training day.
const PATTERNS: Record<string, number[]> = {
  "7": [1, 0, 1, 0, 1, 1, 0],
  "9": [1, 1, 0, 1, 0, 1, 1, 0, 0],
  "10": [1, 0, 1, 1, 0, 1, 0, 1, 0, 0],
};
const CYCLES = 3;
const MAX_DAYS = 10;

export function CycleMap() {
  const m = usePublicMessages();
  const c = m.home.cycles;
  const [length, setLength] = useState("10");
  const [ref, inView] = useInView<HTMLDivElement>();
  const pattern = PATTERNS[length]!;
  const days = pattern.length;

  return (
    <div ref={ref} className={styles.map} data-inview={inView || undefined}>
      <div className={styles.controls}>
        <SegmentedControl
          aria-label={c.title}
          size="sm"
          selectedKeys={[length]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (typeof next === "string") setLength(next);
          }}
        >
          {Object.keys(PATTERNS).map((key) => (
            <Segment key={key} id={key}>
              {c.cycleLabel(1, Number(key)).replace(/^.*— /, "")}
            </Segment>
          ))}
        </SegmentedControl>
        <div className={styles.legend} aria-hidden="true">
          <span>
            <i className={styles.dotOn} /> {c.legendTraining}
          </span>
          <span>
            <i className={styles.dotOff} /> {c.legendRest}
          </span>
        </div>
      </div>
      <div className={styles.grid} role="img" aria-label={`${c.cycleLabel(1, days)}: ${pattern.map((on, i) => (on ? c.dayLabel(i + 1) : null)).filter(Boolean).join(", ")}`}>
        <div className={styles.dayHeader} aria-hidden="true">
          <span />
          {Array.from({ length: MAX_DAYS }, (_, i) => (
            <span key={i} className={styles.dayNumber} data-hidden={i >= days || undefined}>
              {i + 1}
            </span>
          ))}
        </div>
        {Array.from({ length: CYCLES }, (_, cycle) => (
          <div key={cycle} className={styles.cycleRow} aria-hidden="true">
            <span className={styles.cycleName}>{c.cycleLabel(cycle + 1, days)}</span>
            {Array.from({ length: MAX_DAYS }, (_, day) => {
              const exists = day < days;
              const on = exists && pattern[day] === 1;
              return (
                <span
                  key={day}
                  className={styles.dot}
                  data-exists={exists || undefined}
                  data-on={on || undefined}
                  style={{ "--d": cycle * days + day } as React.CSSProperties}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
