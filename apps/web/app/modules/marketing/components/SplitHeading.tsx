import type { ElementType } from "react";
import styles from "./SplitHeading.module.css";

/**
 * Headline whose words rise out of their own masks one after another (page-load moment).
 * Words stay real text in the static HTML; only their transform is animated.
 */
export function SplitHeading({ as: Tag = "h1", text, className, delay = 0, id, accentLast = false }: { as?: ElementType; text: string; className?: string; delay?: number; id?: string; accentLast?: boolean }) {
  const words = text.split(" ");
  return (
    <Tag id={id} className={[styles.heading, className].filter(Boolean).join(" ")}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className={styles.word}>
          <span className={styles.inner} data-accent={(accentLast && i === words.length - 1) || undefined} style={{ "--i": i, "--delay": `${delay}ms` } as React.CSSProperties}>
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
