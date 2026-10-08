import { cx } from "../../lib/cx";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  /** `current` inherits text colour (inside buttons). */
  tone?: "default" | "accent" | "current";
  /** Accessible label; omit when a surrounding element already announces loading. */
  label?: string;
  className?: string;
}

export function Spinner({ size = "md", tone = "default", label, className }: SpinnerProps) {
  return (
    <span
      className={cx(styles.spinner, styles[size], styles[tone], className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
