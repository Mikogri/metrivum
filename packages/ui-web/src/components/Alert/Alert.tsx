import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XOctagon } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Alert.module.css";

export interface AlertProps {
  tone?: "info" | "success" | "warning" | "danger";
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** `alert` interrupts screen readers; use only for errors that need attention now. */
  live?: "polite" | "assertive" | "off";
  className?: string;
}

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XOctagon,
};

export function Alert({
  tone = "info",
  title,
  children,
  actions,
  live = "off",
  className,
}: AlertProps) {
  const Icon = icons[tone];
  return (
    <div
      role={
        live === "assertive"
          ? "alert"
          : live === "polite"
            ? "status"
            : undefined
      }
      className={cx(styles.alert, styles[tone], className)}
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {children ? <div className={styles.text}>{children}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
