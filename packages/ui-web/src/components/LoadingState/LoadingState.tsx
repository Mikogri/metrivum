import { cx } from "../../lib/cx";
import { Spinner } from "../Spinner/Spinner";
import styles from "./LoadingState.module.css";

export interface LoadingStateProps {
  /** Announced and shown next to the spinner, e.g. "Loading programs". */
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Loading for lists, tables and cards (dynamic content): a spinner with its label, shown immediately. Skeletons are kept for fixed layouts such as settings.
 */
export function LoadingState({
  label = "Loading…",
  size = "md",
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cx(styles.loading, styles[size], className)}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size === "sm" ? "sm" : "md"} className={styles.spinner} />
      <span className={styles.label}>{label}</span>
    </div>
  );
}
