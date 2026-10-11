import { LayoutGrid, Table2 } from "lucide-react";
import { Segment, SegmentedControl } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./LibraryViewToggle.module.css";

export type LibraryView = "list" | "cards";

export function LibraryViewToggle({ value, onChange }: { value: LibraryView; onChange: (value: LibraryView) => void }) {
  const labels = useT().training.library.view;
  return (
    <SegmentedControl aria-label={labels.label} selectedKeys={[value]}
      onSelectionChange={(keys) => { const selected = [...keys][0]; if (selected === "list" || selected === "cards") onChange(selected); }}
      className={styles.toggle}>
      <Segment id="cards" aria-label={labels.cards}><LayoutGrid aria-hidden="true" /></Segment>
      <Segment id="list" aria-label={labels.table}><Table2 aria-hidden="true" /></Segment>
    </SegmentedControl>
  );
}
