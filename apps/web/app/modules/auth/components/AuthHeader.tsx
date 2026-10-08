import type { ReactNode } from "react";
import styles from "./AuthHeader.module.css";

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className={styles.footer}>{children}</p>;
}
