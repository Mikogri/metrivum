import { AlertTriangle, Check, CloudOff, Loader2, Pencil, XOctagon } from "lucide-react";
import { useT } from "~/shared/i18n/AppLocale";
import type { SaveStatus as Status } from "../useEditor";
import styles from "./SaveStatus.module.css";

const icons = { clean: Check, saved: Check, dirty: Pencil, saving: Loader2, error: XOctagon, conflict: AlertTriangle, offline: CloudOff };

export function SaveStatus({ status }: { status: Status }) {
  const m = useT();
  const Icon = icons[status];
  return (
    <span className={styles.status} data-status={status} role="status" aria-live="polite">
      <Icon aria-hidden="true" className={styles.icon} />
      <span className={styles.label} key={status}>
        {m.editor.status[status]}
      </span>
    </span>
  );
}
