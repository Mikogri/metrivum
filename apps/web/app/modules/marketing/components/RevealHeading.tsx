import type { ElementType } from "react";
import { useInView } from "../lib/useInView";
import styles from "./RevealHeading.module.css";

/**
 * Section heading in two tones: the claim, then a quieter second line. Each line rises
 * out of its own mask when the heading scrolls into view.
 */
export function RevealHeading({
  as: Tag = "h2",
  id,
  title,
  subtitle,
  align = "start",
  className,
}: {
  as?: ElementType;
  id?: string;
  title: string;
  subtitle?: string;
  align?: "start" | "center";
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLElement>({ margin: "0px 0px -12% 0px" });
  return (
    <Tag
      ref={ref}
      id={id}
      className={[styles.heading, className].filter(Boolean).join(" ")}
      data-align={align}
      data-inview={inView || undefined}
    >
      <span className={styles.mask}>
        <span className={styles.line}>{title}</span>
      </span>
      {subtitle ? (
        <span className={styles.mask}>
          <span className={styles.line} data-tone="quiet">
            {subtitle}
          </span>
        </span>
      ) : null}
    </Tag>
  );
}
