import { useLayoutEffect, useRef, useState } from "react";
import { useTween } from "~/shared/lib/useTween";
import styles from "./measurement-chart.module.css";

type Point = { observedAt: string; value: number };

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

/** Measurements over elapsed time: value gridlines, dated x axis, the trend as a soft area, a tooltip per point. */
export function MeasurementChart({ points, unit, height = 260 }: { points: Point[]; unit: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setMeasured(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setMeasured(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Drawn values ease towards new data (another metric, another period); labels and the tooltip stay exact.
  const drawn = useTween(points.map((p) => p.value));
  if (!points.length) return <p className={styles.empty}>No measurements in this period.</p>;

  const width = measured || 640;
  const pad = { top: 16, right: 16, bottom: 30, left: 48 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const values = points.map((p) => p.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // Body metrics never start at zero: the scale hugs the data with a little air, on round steps.
  const tick = step(Math.max(high - low, Math.abs(high) * 0.02, 0.5), 4);
  const min = Math.floor((low - tick * 0.25) / tick) * tick;
  const max = Math.ceil((high + tick * 0.25) / tick) * tick;
  const ticks: number[] = [];
  for (let v = min; v <= max + tick / 2; v += tick) ticks.push(Number(v.toFixed(4)));
  const start = Date.parse(points[0]!.observedAt);
  const end = Date.parse(points[points.length - 1]!.observedAt);
  const x = (p: Point) => pad.left + (end === start ? w / 2 : ((Date.parse(p.observedAt) - start) / (end - start)) * w);
  const y = (v: number) => pad.top + h - ((v - min) / (max - min || 1)) * h;
  const coords = points.map((p, i) => [x(p), y(drawn[i] ?? p.value)] as [number, number]);
  const line = curve(coords);
  const area = points.length > 1 ? `${line}L${coords.at(-1)![0]},${pad.top + h}L${coords[0]![0]},${pad.top + h}Z` : null;
  const decimals = tick < 1 ? 1 : 0;
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 80))));

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    coords.forEach(([cx], i) => { if (Math.abs(cx - px) < Math.abs(coords[nearest]![0] - px)) nearest = i; });
    setHover(nearest);
  };
  const active = hover === null ? null : points[hover]!;

  return (
    <div ref={ref} className={styles.chart} style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Measurement history (${unit})`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="measurement-fill" x1="0" x2="0" y1="0" y2="1">
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
        {points.map((p, i) => (i % every === 0 && points.length - 1 - i >= every / 2) || i === points.length - 1 ? (
          <text key={p.observedAt} className={styles.xLabel} x={coords[i]![0]} y={height - 8} textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>{day(p.observedAt)}</text>
        ) : null)}
        {area ? <path d={area} fill="url(#measurement-fill)" /> : null}
        <path className={styles.line} d={line} />
        {active ? <line className={styles.cursor} x1={coords[hover!]![0]} x2={coords[hover!]![0]} y1={pad.top} y2={pad.top + h} /> : null}
        {coords.map(([cx, cy], i) => <circle key={points[i]!.observedAt} className={styles.dot} data-active={hover === i || undefined} cx={cx} cy={cy} r={hover === i ? 5 : 3.5} />)}
      </svg>
      {active ? (
        <div className={styles.tooltip} style={{ left: `${(Math.min(Math.max(coords[hover!]![0], 70), width - 70) / width) * 100}%`, top: coords[hover!]![1] }}>
          <strong>{active.value.toFixed(1)} {unit}</strong>
          <span>{new Date(active.observedAt).toLocaleDateString([], { dateStyle: "medium" })}</span>
        </div>
      ) : null}
    </div>
  );
}
