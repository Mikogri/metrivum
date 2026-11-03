import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { Schema } from "@metrivum/api-client-web";
import { Panel } from "~/shared/ui/Panel";
import { PerformanceChart } from "./PerformanceChart";
import styles from "./delivery.module.css";

type Point = Schema<"TrainingFeedbackPoint">;
type Field = "rating" | "sessionRpe" | "wellbeing" | "sleepQuality";

/** The four answers the athlete gives after a workout, each on its own scale. */
const metrics: { field: Field; label: string; hint: string; min: number; max: number; tone: string }[] = [
  { field: "rating", label: "Workout rating", hint: "How the session went", min: 1, max: 5, tone: "accent" },
  { field: "sessionRpe", label: "Session RPE", hint: "How hard it felt", min: 0, max: 10, tone: "warning" },
  { field: "wellbeing", label: "Wellbeing", hint: "How they felt that day", min: 1, max: 5, tone: "info" },
  { field: "sleepQuality", label: "Sleep quality", hint: "The night before", min: 1, max: 5, tone: "violet" },
];

const one = (n: number) => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * Workout feedback over the period: per answer the average on its scale, a line of every answer, then the latest
 * answer and how it moved from the first. Workouts without feedback are left out, not counted as zero.
 */
export function FeedbackSummary({ points, completed, hasMore }: { points: Point[]; completed: number; hasMore?: boolean }) {
  const uiCopy = useUiCopy();

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return <Panel title={uiCopy["ui"]["Workout feedback"]} description={formatInterfaceText(uiCopy["ui"]["{0} of {1} completed {2} with answers{3}."], [sorted.length,completed,completed === 1 ? "workout" : "workouts",hasMore ? " (latest 1000 shown)" : ""])}>
    <div className={styles.fbGrid}>{metrics.map(metric => {
      const answered = sorted.flatMap(point => {
        const value = point[metric.field] as number | string | null | undefined;
        return value == null || value === "" ? [] : [{ date: point.date, value: Number(value) }];
      });
      const head = <header><h3>{metric.label}</h3><span>{metric.hint}</span></header>;
      if (!answered.length) return <section key={metric.field} className={styles.fbCard} data-tone={metric.tone}>{head}<p className={styles.fbEmpty}>{uiCopy["ui"]["No answers yet"]}</p></section>;
      const average = answered.reduce((sum, point) => sum + point.value, 0) / answered.length;
      const latest = answered.at(-1)!.value;
      const change = latest - answered[0]!.value;
      return <section key={metric.field} className={styles.fbCard} data-tone={metric.tone}>
        {head}
        <p className={styles.fbValue}><strong>{one(average)}</strong><small>/ {metric.max}  {uiCopy["ui"]["average"]}</small></p>
        <span className={styles.fbMeter} aria-hidden="true"><span style={{ transform: `scaleX(${(average - metric.min) / (metric.max - metric.min)})` }} /></span>
        {answered.length > 1 ? <PerformanceChart height={52} domain={[metric.min, metric.max]} label={formatInterfaceText(uiCopy["ui"]["{0} over time"], [metric.label])} points={answered} /> : null}
        <dl className={styles.fbFacts}>
          <div><dt>{uiCopy["ui"]["Latest"]}</dt><dd>{one(latest)}</dd></div>
          {answered.length > 1 ? <div><dt>{uiCopy["ui"]["Change"]}</dt><dd>{change > 0 ? "+" : ""}{one(change)}</dd></div> : null}
          <div><dt>{uiCopy["ui"]["Answers"]}</dt><dd>{answered.length}</dd></div>
        </dl>
      </section>;
    })}</div>
  </Panel>;
}
