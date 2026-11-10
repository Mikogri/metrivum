import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./FileCard.module.css";

export interface FileCardProps {
  name: string;
  /** Short type label shown on the file glyph, e.g. "CSV", "PDF", "MP4". */
  kind: string;
  meta?: ReactNode;
  /** Right-side action (download, retry, menu). */
  action?: ReactNode;
  status?: ReactNode;
  /** Optional thumbnail instead of the type glyph. */
  thumbnail?: ReactNode;
  className?: string;
}

/** File row in the style of the inspiration's attachment cards. */
export function FileCard({
  name,
  kind,
  meta,
  action,
  status,
  thumbnail,
  className,
}: FileCardProps) {
  return (
    <div className={cx(styles.card, className)}>
      {thumbnail ? (
        <div className={styles.thumbnail}>{thumbnail}</div>
      ) : (
        <div className={styles.glyph} aria-hidden="true">
          <span className={styles.fold} />
          <span className={styles.kind}>{kind}</span>
        </div>
      )}
      <div className={styles.text}>
        <p className={styles.name} title={name}>
          {name}
        </p>
        {meta ? <div className={styles.meta}>{meta}</div> : null}
        {status ? <div className={styles.status}>{status}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
