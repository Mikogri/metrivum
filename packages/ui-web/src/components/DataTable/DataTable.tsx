import type { HTMLAttributes, Key, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./DataTable.module.css";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** CSS width of the column, e.g. "8rem". The first column takes the remaining space by default. */
  width?: string;
  align?: "start" | "end";
  /** Hide on narrow screens (below 48rem) to keep the name readable. */
  hideOnMobile?: boolean;
  /** Muted secondary text. */
  muted?: boolean;
}

export interface DataTableProps<T> {
  /** Accessible name of the table. */
  label: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => Key;
  /** Dimmed while placeholder data from the previous page is shown. */
  stale?: boolean;
  /** Extra attributes per row (e.g. drag and drop handlers). */
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement> & Record<`data-${string}`, unknown>;
  className?: string;
}

/**
 * Plain semantic table for collections. A link marked `data-row-link` inside a cell stretches over
 * the whole row, so rows are clickable while buttons in other cells stay independent.
 */
export function DataTable<T>({ label, columns, rows, rowKey, stale, rowProps, className }: DataTableProps<T>) {
  return (
    <div className={cx(styles.wrap, stale && styles.stale, className)}>
      <table className={styles.table} aria-label={label}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={column.width ? { width: column.width } : undefined} data-mobile-hidden={column.hideOnMobile || undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} scope="col" data-align={column.align} data-mobile-hidden={column.hideOnMobile || undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row)} {...rowProps?.(row)} style={{ "--i": index } as React.CSSProperties}>
              {columns.map((column) => (
                <td
                  key={column.id}
                  data-align={column.align}
                  data-muted={column.muted || undefined}
                  data-mobile-hidden={column.hideOnMobile || undefined}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
