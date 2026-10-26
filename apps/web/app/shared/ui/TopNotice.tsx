import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./TopNotice.module.css";

/** The slot in the app shell's top row (beside the analyzer update banner) that pages can fill. */
export const TOP_NOTICE_ID = "tf-top-notice";

/**
 * A thin full-width notice at the very top of the app, in the style of the update banner: an icon badge, a one-line
 * message, inline actions and a close button. Renders nothing outside the app shell.
 */
export function TopNotice({ icon, title, children, label, onClose, closeLabel, tone = "info" }: { icon: ReactNode; title: string; children?: ReactNode; label: string; onClose?: () => void; closeLabel?: string; tone?: "info" | "accent" | "warning" }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(TOP_NOTICE_ID)), []);
  if (!slot) return null;
  return createPortal(
    <aside className={styles.banner} data-tone={tone} aria-label={label}>
      <p className={styles.message}>
        <span className={styles.badge} aria-hidden="true">
          {icon}
        </span>
        <strong>{title}</strong>
        {children ? (
          <>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span className={styles.detail}>{children}</span>
          </>
        ) : null}
      </p>
      {onClose ? (
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      ) : null}
    </aside>,
    slot,
  );
}

/** An inline text action inside a TopNotice. */
export function TopNoticeLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <button type="button" className={styles.link} onClick={onPress}>
      {children}
    </button>
  );
}
