import { useEffect, useState } from "react";
import { Badge } from "@metrivum/ui-web";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./VideoDemo.module.css";

// Illustrative bar path of a squat: down-and-slightly-forward, then back up.
const PATH = "M150 40 C 146 80, 138 130, 140 178 C 142 214, 156 222, 160 210 C 166 180, 160 120, 152 40";
type Status = "Queued" | "Processing" | "Completed";

export function VideoDemo() {
  const m = usePublicMessages();
  const v = m.home.video;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [status, setStatus] = useState<Status>("Completed");

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    setStatus("Queued");
    const a = setTimeout(() => setStatus("Processing"), 900);
    const b = setTimeout(() => setStatus("Completed"), 2300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [inView]);

  const completed = status === "Completed";
  return (
    <div ref={ref} className={styles.card} data-inview={inView || undefined} data-completed={completed || undefined}>
      <div className={styles.frame} aria-hidden="true">
        <div className={styles.floor} />
        <svg viewBox="0 0 300 260" className={styles.path}>
          <path className={styles.pathShadow} d={PATH} />
          <path className={styles.pathLine} d={PATH} pathLength={1} />
          <circle className={styles.plate} cx="150" cy="40" r="7" />
        </svg>
        <span className={styles.pathLabel}>{v.pathLabel}</span>
      </div>
      <div className={styles.panel}>
        <div className={styles.statusRow}>
          <Badge tone={completed ? "success" : status === "Processing" ? "info" : "neutral"} dot>
            {v.statuses[status]}
          </Badge>
        </div>
        <div className={styles.timeline} aria-hidden="true">
          {[0, 1, 2].map((rep) => (
            <div key={rep} className={styles.rep} style={{ "--i": rep } as React.CSSProperties}>
              <span className={styles.repLabel}>{v.repLabel(rep + 1)}</span>
              <span className={styles.phases}>
                <span className={styles.ecc} style={{ "--w": 0.56 + rep * 0.03 } as React.CSSProperties} />
                <span className={styles.con} />
              </span>
            </div>
          ))}
        </div>
        <div className={styles.legend} aria-hidden="true">
          <span>
            <i className={styles.eccSwatch} /> {v.phases.eccentric}
          </span>
          <span>
            <i className={styles.conSwatch} /> {v.phases.concentric}
          </span>
        </div>
      </div>
    </div>
  );
}
