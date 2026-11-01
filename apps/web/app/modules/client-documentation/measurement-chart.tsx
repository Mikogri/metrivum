import { useId, useLayoutEffect, useRef, useState } from "react";
import { useTween } from "~/shared/lib/useTween";
import styles from "./measurement-chart.module.css";

type Point = { observedAt: string; value: number };

/** One line on the chart. `color` is any CSS colour; a single line without one uses the accent. */
export interface ChartSeries {
  label: string;
  color?: string;
  points: Point[];
}

/** Round tick step (1, 2, 2.5 or 5 × 10ⁿ) so gridlines land on readable values. */
function step(range: number, count: number) {
  const raw = range / count || 1;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  return ([1, 2, 2.5, 5, 10].find((s) => s * power >= raw) ?? 10) * power;
}

/** Monotone cubic curve through the points: smooth, but never overshoots a measurement. */
function curve(points: Array<[number, number]>) {
  if (points.length < 2) return points.length ? `M${points[0]![0]},${points[0]![1]}` : "";
  const n = points.length;
  const slopes = points.slice(0, -1).map((p, i) => (points[i + 1]![1] - p[1]) / (points[i + 1]![0] - p[0] || 1));
  const tangent = (i: number) => (i === 0 ? slopes[0]! : i === n - 1 ? slopes[n - 2]! : slopes[i - 1]! * slopes[i]! <= 0 ? 0 : (slopes[i - 1]! + slopes[i]!) / 2);
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const dx = (x1 - x0) / 3;
    d += `C${x0 + dx},${y0 + tangent(i) * dx},${x1 - dx},${y1 - tangent(i + 1) * dx},${x1},${y1}`;
  }
  return d;
}

const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });

/**
 * Values over elapsed time: value gridlines, dated x axis, a tooltip per point. One line is drawn as a soft
 * area; with `series` several lines share the axes (e.g. up to five exercises side by side).
 * `label` names the chart for screen readers; `onPick` makes a click open the point under the cursor.
 */
export function MeasurementChart({ points, series, unit, height = 260, label, onPick }: {
  points?: Point[];
  series?: ChartSeries[];
  unit: string;
  height?: number;
  label?: string;
  onPick?: (series: number, index: number) => void;
}) {
  const fill = `fill-${useId().replace(/:/g, "")}`;
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setMeasured(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setMeasured(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const lines = (series ?? [{ label: unit, points: points ?? [] }]).filter((line) => line.points.length);
  const all = lines.flatMap((line) => line.points);
  // Drawn values ease towards new data (another metric, another period); labels and the tooltip stay exact.
  const drawn = useTween(all.map((p) => p.value));
  if (!all.length) return <p className={styles.empty}>No measurements in this period.</p>;

  const multi = lines.length > 1;
  const width = measured || 640;
  const pad = { top: 16, right: 16, bottom: 30, left: 48 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const values = all.map((p) => p.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // The scale hugs the data with a little air, on round steps; it never has to start at zero.
  const tick = step(Math.max(high - low, Math.abs(high) * 0.02, 0.5), 4);
  const min = Math.floor((low - tick * 0.25) / tick) * tick;
  const max = Math.ceil((high + tick * 0.25) / tick) * tick;
  const ticks: number[] = [];
  for (let v = min; v <= max + tick / 2; v += tick) ticks.push(Number(v.toFixed(4)));
  const times = all.map((p) => Date.parse(p.observedAt));
  const start = Math.min(...times);
  const end = Math.max(...times);
  const x = (p: Point) => pad.left + (end === start ? w / 2 : ((Date.parse(p.observedAt) - start) / (end - start)) * w);
  const y = (v: number) => pad.top + h - ((v - min) / (max - min || 1)) * h;
  let offset = 0;
  const drawnLines = lines.map((line) => {
    const coords = line.points.map((p, i) => [x(p), y(drawn[offset + i] ?? p.value)] as [number, number]);
    offset += line.points.length;
    const path = curve(coords);
    const area = !multi && coords.length > 1 ? `${path}L${coords.at(-1)![0]},${pad.top + h}L${coords[0]![0]},${pad.top + h}Z` : null;
    return { ...line, coords, path, area };
  });
  const decimals = tick < 1 ? 1 : 0;
  // Date labels from every line, without crowding: roughly one per 80px.
  const dates = [...new Set(all.map((p) => p.observedAt))].sort();
  const every = Math.max(1, Math.ceil(dates.length / Math.max(2, Math.floor(w / 80))));

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const py = ((event.clientY - rect.top) / rect.height) * height;
    let best: { s: number; i: number; d: number } | null = null;
    drawnLines.forEach((line, s) => line.coords.forEach(([cx, cy], i) => {
      // Horizontal distance counts most, so the nearest date wins; vertical picks between lines on that date.
      const d = Math.abs(cx - px) * 3 + Math.abs(cy - py);
      if (!best || d < best.d) best = { s, i, d };
    }));
    setHover(best ? { s: (best as { s: number }).s, i: (best as { i: number }).i } : null);
  };
  const activeLine = hover ? drawnLines[hover.s] : undefined;
  const active = hover && activeLine ? activeLine.points[hover.i] : undefined;
  const activeAt = hover && activeLine ? activeLine.coords[hover.i] : undefined;
  const xOf = (iso: string) => x({ observedAt: iso, value: 0 });

  return (
    <div ref={ref} className={styles.chart} style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? `Measurement history (${unit})`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        onClick={onPick && hover ? () => onPick(hover.s, hover.i) : undefined} style={onPick ? { cursor: "pointer" } : undefined}>
        <defs>
          <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t} className={styles.grid}>
            <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} />
            <text x={pad.left - 10} y={y(t)} dy="0.32em" textAnchor="end">{t.toFixed(decimals)}</text>
          </g>
        ))}
        {dates.map((iso, i) => (i % every === 0 && dates.length - 1 - i >= every / 2) || i === dates.length - 1 ? (
          <text key={iso} className={styles.xLabel} x={xOf(iso)} y={height - 8} textAnchor={dates.length === 1 ? "middle" : i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}>{day(iso)}</text>
        ) : null)}
        {activeAt ? <line className={styles.cursor} x1={activeAt[0]} x2={activeAt[0]} y1={pad.top} y2={pad.top + h} /> : null}
        {drawnLines.map((line, s) => (
          <g key={`${line.label}-${s}`} style={line.color ? { color: line.color } : undefined} data-dim={hover && hover.s !== s ? "" : undefined} className={styles.series}>
            {line.area ? <path d={line.area} fill={`url(#${fill})`} /> : null}
            <path className={styles.line} d={line.path} />
            {line.coords.map(([cx, cy], i) => {
              const on = hover?.s === s && hover.i === i;
              return <circle key={`${line.points[i]!.observedAt}-${i}`} className={styles.dot} data-active={on || undefined} cx={cx} cy={cy} r={on ? 5 : multi ? 3 : 3.5} />;
            })}
          </g>
        ))}
      </svg>
      {active && activeAt && activeLine ? (
        <div className={styles.tooltip} style={{ left: `${(Math.min(Math.max(activeAt[0], 70), width - 70) / width) * 100}%`, top: activeAt[1] }}>
          {multi ? <em style={{ color: activeLine.color }}>{activeLine.label}</em> : null}
          <strong>{Number(active.value.toFixed(1)).toLocaleString()}{unit ? ` ${unit}` : ""}</strong>
          <span>{new Date(active.observedAt).toLocaleDateString([], { dateStyle: "medium" })}</span>
        </div>
      ) : null}
    </div>
  );
}
