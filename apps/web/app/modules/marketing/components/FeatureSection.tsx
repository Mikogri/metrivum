import type { ReactNode } from "react";
import { useInView } from "../lib/useInView";
import styles from "./FeatureSection.module.css";

export interface FeatureSectionProps {
  id: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  /** Visual on the left instead of the right (desktop only). */
  reverse?: boolean;
  footer?: ReactNode;
  /** Title above a full-width visual, for diagrams that need the room. */
  stacked?: boolean;
}

export function FeatureSection({
  id,
  title,
  body,
  visual,
  reverse,
  footer,
  stacked,
}: FeatureSectionProps) {
  const [ref, inView] = useInView<HTMLElement>({ margin: "0px 0px -20% 0px" });
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={`${id}-title`}
      className={styles.section}
      data-reverse={reverse || undefined}
      data-stacked={stacked || undefined}
      data-inview={inView || undefined}
    >
      <div className={styles.copy}>
        <h2 id={`${id}-title`} className={styles.title}>
          <span className={styles.mask}>
            <span className={styles.line}>{title}</span>
          </span>
        </h2>
        <div className={styles.body}>{body}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
      <div className={styles.visual}>{visual}</div>
    </section>
  );
}
