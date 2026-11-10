import { Check, ChevronDown } from "lucide-react";
import {
  Button,
  Dialog,
  DialogTrigger,
  ListBox,
  ListBoxItem,
  Popover,
  type Selection,
} from "react-aria-components";
import type { AnalysisRepetition } from "@metrivum/api-client-web";
import styles from "./RepSelect.module.css";

/**
 * Multi-select of repetitions: tick or untick any of them; "All repetitions" brings every one back.
 * At least one stays selected. `null` means all (including the time around the reps).
 */
export function RepSelect({
  repetitions,
  selected,
  onChange,
  label,
  allLabel,
  repLabel,
}: {
  repetitions: AnalysisRepetition[];
  selected: ReadonlySet<number> | null;
  onChange: (next: ReadonlySet<number> | null) => void;
  label: string;
  allLabel: string;
  repLabel: (n: number) => string;
}) {
  const keys = new Set(
    (selected ? [...selected] : repetitions.map((r) => r.number)).map(String),
  );
  const summary = !selected
    ? allLabel
    : selected.size === 1
      ? repLabel([...selected][0]!)
      : `${label}: ${[...selected].sort((a, b) => a - b).join(", ")}`;
  const change = (next: Selection) => {
    const chosen = next === "all" ? null : new Set([...next].map(Number));
    if (chosen && chosen.size === 0) return;
    onChange(chosen && chosen.size === repetitions.length ? null : chosen);
  };

  return (
    <DialogTrigger>
      <Button className={styles.trigger} aria-label={`${label}: ${summary}`}>
        <span className={styles.count} aria-hidden="true">
          {selected ? selected.size : repetitions.length}
        </span>
        <span className={styles.value}>{summary}</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </Button>
      <Popover className={styles.popover} placement="bottom start" offset={6}>
        <Dialog className={styles.dialog} aria-label={label}>
          <button
            type="button"
            className={styles.all}
            data-on={!selected || undefined}
            onClick={() => onChange(null)}
          >
            <span className={styles.box} aria-hidden="true">
              {!selected ? <Check /> : null}
            </span>
            {allLabel}
          </button>
          <ListBox
            aria-label={label}
            selectionMode="multiple"
            selectedKeys={keys}
            onSelectionChange={change}
            className={styles.list}
          >
            {repetitions.map((r) => (
              <ListBoxItem
                key={r.number}
                id={String(r.number)}
                textValue={repLabel(r.number)}
                className={styles.item}
              >
                {({ isSelected }) => (
                  <>
                    <span className={styles.box} aria-hidden="true">
                      {isSelected ? <Check /> : null}
                    </span>
                    <span>{repLabel(r.number)}</span>
                    <span className={styles.duration}>
                      {(r.endSeconds - r.startSeconds).toFixed(2)} s
                    </span>
                  </>
                )}
              </ListBoxItem>
            ))}
          </ListBox>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
