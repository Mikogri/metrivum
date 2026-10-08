import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./List.module.css";

/** Bordered list container for repeated rows (programs, analyses, formulas). */
export function List({ className, ...props }: HTMLAttributes<HTMLUListElement>) {
  return <ul role="list" {...props} className={cx(styles.list, className)} />;
}

export interface ListRowProps extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  /** Extra columns rendered between text and trailing actions on wide screens. */
  columns?: ReactNode;
}

/**
 * Row with an optional stretched link: put a link with `data-row-link` inside `title`
 * and the whole row becomes clickable while nested buttons stay independent.
 */
export function ListRow({ leading, title, subtitle, trailing, columns, className, ...props }: ListRowProps) {
  return (
    <li {...props} className={cx(styles.row, className)}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.text}>
        <div className={styles.title}>{title}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
      {columns ? <div className={styles.columns}>{columns}</div> : null}
      {trailing ? <div className={styles.trailing}>{trailing}</div> : null}
    </li>
  );
}
