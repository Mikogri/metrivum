import { useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { Combobox, Option, Select } from "@metrivum/ui-web";
import { MeasurementChart } from "~/modules/client-documentation";
import { Panel } from "~/shared/ui/Panel";
import styles from "./delivery.module.css";

export type Metric = "bestLoadKg" | "volumeKg" | "reps" | "sets";
export interface ExercisePerformance { occurrenceId?: string | null; exerciseId: string; name: string; performedDate: string; loadMeaning: string; sets: number; reps: number; volumeKg: number | null; bestLoadKg: number | null; averageRpe: number | null; averageRir: number | null }

/** At most this many exercises share the chart, each in its own colour. */
export const MAX_EXERCISES = 5;
const COLORS = ["var(--tf-color-accent)", "var(--tf-color-info)", "var(--tf-color-violet)", "var(--tf-color-warning)", "var(--tf-color-danger)"];

const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString();

/**
 * Progress of up to five exercises on one chart. Exercises are found by typing in the search field (only the ones
 * logged in the period are offered); each chosen one gets a chip with its latest value and change, and its own line.
 * With nothing chosen, the exercise logged most often is shown.
 */
export function ExerciseProgress({ series, selected, onSelect, metric, onMetric, workoutLink }: {
  series: Map<string, ExercisePerformance[]>;
  selected: string[];
  onSelect: (keys: string[]) => void;
  metric: Metric;
  onMetric: (metric: Metric) => void;
  /** Where a logged session opens; without it the chart and the table do not link. */
  workoutLink?: (point: ExercisePerformance) => string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const options = [...series].map(([key, points]) => ({ key, points, label: `${points[0]!.name}${points[0]!.loadMeaning !== "absolute" ? ` (${points[0]!.loadMeaning})` : ""}` }));
  const valid = selected.filter(key => series.has(key)).slice(0, MAX_EXERCISES);
  const keys = valid.length ? valid : [[...options].sort((a, b) => b.points.length - a.points.length)[0]!.key];
  const chosen = keys.map((key, index) => {
    const option = options.find(o => o.key === key)!;
    const usable = option.points.filter(p => p[metric] != null).sort((a, b) => a.performedDate.localeCompare(b.performedDate));
    return { ...option, usable, color: COLORS[index % COLORS.length]! };
  });
  const remaining = options.filter(o => !keys.includes(o.key) && o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const full = keys.length >= MAX_EXERCISES;
  const unit = metric === "bestLoadKg" || metric === "volumeKg" ? "kg" : metric === "reps" ? "reps" : "sets";
  const metricLabel = metric === "bestLoadKg" ? "Best weight" : metric === "volumeKg" ? "Volume" : metric === "reps" ? "Repetitions" : "Sets";
  const add = (key: string) => { if (!keys.includes(key) && !full) onSelect([...keys, key]); setSearch(""); };
  const remove = (key: string) => onSelect(keys.filter(k => k !== key));
  const lines = chosen.filter(c => c.usable.length);

  return <Panel title="Exercise progress" actions={<div className={styles.chartPick}>
    <Combobox aria-label="Add an exercise" size="sm" placeholder={full ? `Up to ${MAX_EXERCISES} exercises` : "Search exercises…"} isDisabled={full} className={styles.chartExercise}
      inputValue={search} onInputChange={setSearch} selectedKey={null} onSelectionChange={key => key != null && add(String(key))}
      items={remaining.map(o => ({ id: o.key, name: o.label }))} emptyState="No logged exercise matches" menuWidth="md">
      {(item: { id: string; name: string }) => <Option id={item.id} textValue={item.name}>{item.name}</Option>}
    </Combobox>
    <Select aria-label="Measure" size="sm" className={styles.chartMeasure} selectedKey={metric} onSelectionChange={key => onMetric(key as Metric)}>
      <Option id="bestLoadKg">Best weight (kg)</Option><Option id="volumeKg">Volume (kg·reps)</Option><Option id="reps">Total repetitions</Option><Option id="sets">Recorded sets</Option>
    </Select>
  </div>}>
    {/* One chip per exercise on the chart: its colour, name, latest value and change over the period. */}
    <ul className={styles.exChips} aria-label="Exercises on the chart">{chosen.map(c => {
      const first = c.usable[0]?.[metric], last = c.usable.at(-1)?.[metric];
      const change = first != null && last != null ? last - first : null;
      return <li key={c.key} style={{ "--ex": c.color } as React.CSSProperties}>
        <i aria-hidden="true" />
        <span className={styles.exName}>{c.label}</span>
        {last != null ? <b>{fmt(last)} {unit}</b> : <small>no {metricLabel.toLowerCase()}</small>}
        {change != null && c.usable.length > 1 ? <small data-tone={change > 0 ? "up" : change < 0 ? "down" : undefined}>{change > 0 ? "+" : ""}{fmt(change)}</small> : null}
        {valid.length ? <button type="button" aria-label={`Remove ${c.label} from the chart`} onClick={() => remove(c.key)}><X aria-hidden="true" /></button> : null}
      </li>;
    })}</ul>
    {lines.length ? <MeasurementChart key={keys.join("|")} height={280} unit={unit} label={`${metricLabel} over time: ${chosen.map(c => c.label).join(", ")}`}
      series={lines.map(c => ({ label: c.label, color: c.color, points: c.usable.map(p => ({ observedAt: p.performedDate, value: p[metric]! })) }))}
      onPick={workoutLink ? (s, i) => { const point = lines[s]?.usable[i]; if (point?.occurrenceId) void navigate(workoutLink(point)); } : undefined} />
      : <p className={styles.hint}>No {metricLabel.toLowerCase()} recorded for {keys.length === 1 ? "this exercise" : "these exercises"} in the period.</p>}
  </Panel>;
}
