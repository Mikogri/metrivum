import { MoreVertical } from "lucide-react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./SheetCanvas.module.css";

export function SheetMenuButton({ label, onOpen }: { label: string; onOpen: (x: number, y: number) => void }) {
  const m = useT();
  return (
    <button
      type="button"
      className={styles.menu}
      aria-label={m.common.moreActions(label)}
      data-no-drag
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        onOpen(rect.left, rect.bottom + 4);
      }}
    >
      <MoreVertical aria-hidden="true" />
    </button>
  );
}
