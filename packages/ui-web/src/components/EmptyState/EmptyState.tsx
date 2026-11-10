import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: "sm" | "md";
  className?: string;
}

/** Default glyph: an empty tray, drawn thin to match the line icons. */
function EmptyGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 13.5 5.6 6.2A1.8 1.8 0 0 1 7.3 5h9.4a1.8 1.8 0 0 1 1.7 1.2L21 13.5" />
      <path d="M3 13.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4.5h-5l-1.5 2h-5L8 13.5H3Z" />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  size = "md",
  className,
}: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, styles[size], className)}>
      <div className={styles.icon} aria-hidden="true">
        {icon ?? <EmptyGlyph />}
      </div>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export interface ErrorStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Technical reference shown in small type so support can trace the request. */
  reference?: string;
  actions?: ReactNode;
  className?: string;
}

export function ErrorState({
  title,
  description,
  reference,
  actions,
  className,
}: ErrorStateProps) {
  return (
    <div role="alert" className={cx(styles.empty, styles.error, className)}>
      <div className={cx(styles.icon, styles.errorIcon)} aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 8v5M12 16.5v.01" />
          <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {reference ? <p className={styles.reference}>{reference}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
