import type { HTMLAttributes } from "react";
import { cx } from "../../lib/cx";
import styles from "./Kbd.module.css";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd {...props} className={cx(styles.kbd, className)} />;
}
