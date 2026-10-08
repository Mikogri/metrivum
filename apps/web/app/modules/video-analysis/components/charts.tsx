import { useMemo } from "react";
import type { AnalysisRepetition, TrajectoryPoint } from "@trainflow/api-client-web";
import { formatNumber } from "~/shared/i18n/format";
import type { Locale } from "~/shared/i18n/locale";
import styles from "./charts.module.css";

interface Domain {
  min: number;
  max: number;
}

function domain(values: number[]): Domain {
  if (!values.length) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.06;
  return { min: min - pad, max: max + pad };
}

/** Splits points into drawable runs; occluded points break the line instead of being invented. */
function runs(points: TrajectoryPoint[], value: (p: TrajectoryPoint) => number | null) {
  const out: Array<Array<{ x: number; y: number; q: number }>> = [];
  let current: Array<{ x: number; y: number; q: number }> = [];
  let previousSegment: number | null | undefined;
  for (const point of points) {
    if (current.length && point.segment !== previousSegment) { out.push(current); current = []; }
    previousSegment = point.segment;
    const v = value(point);
    if (point.occluded || v === null || !Number.isFinite(v)) {
      if (current.length) out.push(current);
      current = [];
      continue;
    }
    current.push({ x: point.seconds, y: v, q: point.quality });
  }
  if (current.length) out.push(current);
  return out;
}

const W = 640;
const H = 220;
const PAD = { l: 48, r: 12, t: 12, b: 28 };

export function TimeSeriesChart({
  points,
  value,
  unit,
  label,
  cursor,
  onSeek,
  repetitions,
  timeLabel,
  locale,
  yDomain,
}: {
  points: TrajectoryPoint[];
  value: (p: TrajectoryPoint) => number | null;
  unit: string;
  label: string;
  cursor?: number | null;
  onSeek?: (seconds: number) => void;
  repetitions?: AnalysisRepetition[];
  timeLabel: string;
  locale: Locale;
  yDomain?: Domain;
}) {
  const xs = points.map((p) => p.seconds);
  const ys = points.map(value).filter((v): v is number => v !== null);
  const x = domain(xs);
  const y = yDomain ?? domain(ys);
  const sx = (v: number) => PAD.l + ((v - x.min) / (x.max - x.min)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - ((v - y.min) / (y.max - y.min)) * (H - PAD.t - PAD.b);
  const paths = useMemo(
    () => runs(points, value).map((run) => run.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, x.min, x.max, y.min, y.max],
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => y.min + r * (y.max - y.min));
  const timeTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => x.min + r * (x.max - x.min));

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`${label} (${unit})`}
        onClick={(event) => {
          if (!onSeek) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const px = ((event.clientX - rect.left) / rect.width) * W;
          const seconds = x.min + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x.max - x.min);
          onSeek(Math.max(x.min, Math.min(x.max, seconds)));
        }}
      >
        {repetitions?.map((rep) => (
          <rect key={rep.number} x={sx(rep.startSeconds)} y={PAD.t} width={Math.max(0, sx(rep.endSeconds) - sx(rep.startSeconds))} height={H - PAD.t - PAD.b} className={styles.repBand} />
        ))}
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(tick)} y2={sy(tick)} className={styles.grid} />
            <text x={PAD.l - 6} y={sy(tick)} className={styles.tickY}>
              {formatNumber(locale, tick, 1)}
            </text>
          </g>
        ))}
        {timeTicks.map((tick) => (
          <text key={tick} x={sx(tick)} y={H - 8} className={styles.tickX}>
            {formatNumber(locale, tick, 1)}
          </text>
        ))}
        {paths.map((d, i) => (
          <path key={i} d={d} className={styles.line} />
        ))}
        {cursor !== null && cursor !== undefined && cursor >= x.min && cursor <= x.max ? (
          <line x1={sx(cursor)} x2={sx(cursor)} y1={PAD.t} y2={H - PAD.b} className={styles.cursor} />
        ) : null}
      </svg>
      <figcaption className={styles.caption}>
        {label} ({unit}) · {timeLabel}
      </figcaption>
    </figure>
  );
}

/** x/y bar path, drawn as the camera saw it (y grows downward in image coordinates). */
export function BarPathPlot({ points, unit, label, cursor }: { points: TrajectoryPoint[]; unit: string; label: string; cursor?: number | null }) {
  const size = 260;
  const visible = points.filter((p) => !p.occluded);
  const xd = domain(visible.map((p) => p.x));
  const yd = domain(visible.map((p) => p.y));
  const span = Math.max(xd.max - xd.min, yd.max - yd.min);
  const cx = (xd.min + xd.max) / 2;
  const cy = (yd.min + yd.max) / 2;
  const sx = (v: number) => 16 + ((v - (cx - span / 2)) / span) * (size - 32);
  const sy = (v: number) => 16 + ((v - (cy - span / 2)) / span) * (size - 32);
  const segments = runs(points, (p) => p.y).map((run) => run.map((p, i) => {
    const point = points.find((q) => q.seconds === p.x)!;
    return `${i ? "L" : "M"}${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`;
  }).join(""));
  const current = cursor !== null && cursor !== undefined ? points.reduce<TrajectoryPoint | null>((best, p) => (!best || Math.abs(p.seconds - cursor) < Math.abs(best.seconds - cursor) ? p : best), null) : null;
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${size} ${size}`} className={styles.square} role="img" aria-label={`${label} (${unit})`}>
        <rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={8} className={styles.frame} />
        {segments.map((d, i) => (
          <path key={i} d={d} className={styles.path} />
        ))}
        {current && !current.occluded ? <circle cx={sx(current.x)} cy={sy(current.y)} r={5} className={styles.dot} /> : null}
      </svg>
      <figcaption className={styles.caption}>
        {label} ({unit})
      </figcaption>
    </figure>
  );
}

export function PhaseTimeline({ repetitions, phaseLabel, repLabel, locale }: { repetitions: AnalysisRepetition[]; phaseLabel: (kind: string) => string; repLabel: (n: number) => string; locale: Locale }) {
  return (
    <ol className={styles.timeline}>
      {repetitions.map((rep, i) => {
        const total = rep.endSeconds - rep.startSeconds || 1;
        return (
          <li key={rep.number} style={{ "--i": i } as React.CSSProperties}>
            <span className={styles.repName}>{repLabel(rep.number)}</span>
            <span className={styles.phases}>
              {rep.phases.map((phase, index) => (
                <span
                  key={index}
                  className={styles.phase}
                  data-kind={phase.kind.toLowerCase()}
                  style={{ width: `${((phase.endSeconds - phase.startSeconds) / total) * 100}%` }}
                  title={`${phaseLabel(phase.kind)}: ${formatNumber(locale, phase.endSeconds - phase.startSeconds, 2)} s`}
                />
              ))}
            </span>
            <span className={styles.duration}>{formatNumber(locale, total, 2)} s</span>
          </li>
        );
      })}
    </ol>
  );
}
