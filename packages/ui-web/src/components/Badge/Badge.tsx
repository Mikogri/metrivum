import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "violet";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Leading status dot. Always pair with text: colour alone carries no meaning. */
  dot?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
}

export function Badge({ tone = "neutral", dot, icon, size = "md", className, children, ...props }: BadgeProps) {
  return (
    <span {...props} className={cx(styles.badge, styles[tone], styles[size], className)}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
