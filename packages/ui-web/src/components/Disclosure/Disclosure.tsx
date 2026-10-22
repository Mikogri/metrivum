import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Disclosure.module.css";

export interface DisclosureProps {
  /** The always-visible row that opens and closes the panel. */
  title: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * A row that expands its content smoothly (height and fade). Collapsed content is inert, so it is neither
 * focusable nor read out.
 */
export function Disclosure({ title, children, defaultExpanded = false, className }: DisclosureProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  return (
    <div className={cx(styles.disclosure, className)} data-expanded={expanded || undefined}>
      <button type="button" className={styles.trigger} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((open) => !open)}>
        <span className={styles.title}>{title}</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>
      <div id={id} className={styles.panel} inert={!expanded}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
