import { useState } from "react";
import { Option, Select, TextField } from "@trainflow/ui-web";
import styles from "./PeriodFilter.module.css";

const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const daysBack = (days: number) => localDate(new Date(Date.now() - (days - 1) * 86_400_000));

const PRESETS = [7, 30, 90] as const;

/**
 * Period picker for filter bars: "Last 7 / 30 / 90 days", optionally "All time", or a custom range
 * that reveals two date fields. Dates are local `YYYY-MM-DD` strings.
 */
export function PeriodFilter({
  from,
  to,
  onChange,
  earliest,
  label = "Period",
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  /** Enables "All time" starting at this date. */
  earliest?: string | null;
  label?: string;
}) {
  const today = localDate();
  const matched = to === today ? (PRESETS.find((days) => from === daysBack(days)) ?? (earliest && from === earliest ? "all" : null)) : null;
  const [custom, setCustom] = useState(matched === null);
  const key = custom || matched === null ? "custom" : String(matched);
  return (
    <div className={styles.period}>
      <Select
        aria-label={label}
        selectedKey={key}
        className={styles.select}
        onSelectionChange={(next) => {
          if (next === "custom") return setCustom(true);
          setCustom(false);
          if (next === "all" && earliest) onChange({ from: earliest, to: today });
          else onChange({ from: daysBack(Number(next)), to: today });
        }}
      >
        {PRESETS.map((days) => (
          <Option key={days} id={String(days)}>{`Last ${days} days`}</Option>
        ))}
        {earliest ? <Option id="all">All time</Option> : null}
        <Option id="custom">Custom range</Option>
      </Select>
      {key === "custom" ? (
        <>
          <TextField aria-label="From" type="date" value={from} onChange={(value) => onChange({ from: value, to })} className={styles.date} />
          <span className={styles.dash} aria-hidden="true">–</span>
          <TextField aria-label="Through" type="date" value={to} onChange={(value) => onChange({ from, to: value })} className={styles.date} />
        </>
      ) : null}
    </div>
  );
}
