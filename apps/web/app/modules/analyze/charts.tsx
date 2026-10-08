import { ArrowDownRight, ArrowUpRight, ChartNoAxesColumn, Minus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./charts.module.css";

/* ------------------------------------------------------------------ helpers */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts from the last shown value to the new one, easing out, so numbers feel measured rather than swapped. */
export function useCountUp(value: number, duration = 900) {
  const [shown, setShown] = useState(reduced() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (reduced()) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      const current = origin + (value - origin) * eased;
      from.current = current;
      setShown(current);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const shown = useCountUp(value);
  return <span className={styles.number}>{format(shown)}</span>;
}

/** Width of an element, kept current with a ResizeObserver; charts draw in real pixels. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Monotone cubic curve through the points: smooth, but never overshoots the data. */
function curve(points: Array<[number, number]>) {
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0]![0]},${points[0]![1]}`;
  const n = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) slopes.push((points[i + 1]![1] - points[i]![1]) / (points[i + 1]![0] - points[i]![0] || 1));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]!;
    if (i === n - 1) return slopes[n - 2]!;
    const a = slopes[i - 1]!;
    const b = slopes[i]!;
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[i + 1]!;
    const dx = (x1 - x0) / 3;
    d += `C${(x0 + dx).toFixed(1)},${(y0 + tangents[i]! * dx).toFixed(1)},${(x1 - dx).toFixed(1)},${(y1 - tangents[i + 1]! * dx).toFixed(1)},${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/** A scale maximum split into four round steps (1, 2 or 5 × 10ⁿ), so gridlines land on whole numbers. */
function niceMax(value: number) {
  if (value <= 0) return 4;
  const raw = value / 4;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, ([1, 2, 5, 10].find((s) => s * power >= raw) ?? 10) * power);
  return step * 4;
}

export const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const compact = (n: number) => new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/* ------------------------------------------------------------------ empty */

/** What a chart shows when the period has nothing to plot: a quiet dashed box that says so. */
export function NoData({ height = 160, title = "No data for this period", hint = "Try a longer period or clear the filters." }: { height?: number; title?: string; hint?: string }) {
  return (
    <div className={styles.noData} style={{ minHeight: height }} role="note">
      <span className={styles.noDataIcon} aria-hidden="true">
        <ChartNoAxesColumn />
      </span>
      <strong>{title}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

const allZero = (values: number[]) => values.every((v) => !v);

/* ------------------------------------------------------------------ KPI */

export function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) return <span className={styles.delta}>No baseline</span>;
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  const good = invert ? change < 0 : change > 0;
  const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  return (
    <span className={styles.delta} data-tone={change === 0 ? undefined : good ? "up" : "down"} title="Compared with the previous period of the same length">
      <Icon aria-hidden="true" />
      {change > 0 ? "+" : ""}
      {change}%
    </span>
  );
}

export function Sparkline({ values, tone = "accent" }: { values: number[]; tone?: Tone }) {
  if (values.length < 2 || allZero(values)) return null;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * 240, 34 - ((v - min) / span) * 28] as [number, number]);
  const line = curve(points);
  return (
    <svg className={styles.spark} viewBox="0 0 240 36" preserveAspectRatio="none" aria-hidden="true" data-tone={tone}>
      <path className={styles.sparkLine} d={line} pathLength={1} />
    </svg>
  );
}

export function Kpi({
  label,
  value,
  format,
  previous,
  invert,
  spark,
  tone = "accent",
  caption,
  index = 0,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  previous?: number;
  invert?: boolean;
  spark?: number[];
  tone?: Tone;
  caption?: string;
  index?: number;
}) {
  return (
    <article className={styles.kpi} style={{ "--i": index } as React.CSSProperties} data-tone={tone}>
      <header>
        <span className={styles.kpiLabel}>{label}</span>
        {previous !== undefined ? <Delta current={value} previous={previous} invert={invert} /> : null}
      </header>
      <strong className={styles.kpiValue}>
        <AnimatedNumber value={value} format={format} />
      </strong>
      {spark && !allZero(spark) ? <Sparkline values={spark} tone={tone} /> : <p className={styles.kpiCaption}>{caption ?? (spark ? "No activity in this period" : "")}</p>}
    </article>
  );
}

/* ------------------------------------------------------------------ area / line chart */

export type Tone = "accent" | "info" | "violet" | "warning" | "danger" | "neutral";

export interface Series {
  label: string;
  values: number[];
  tone: Tone;
  /** Drawn as a quiet dashed line without fill, e.g. the previous period. */
  ghost?: boolean;
}

export function AreaChart({ labels, series, format = compact, height = 240 }: { labels: string[]; series: Series[]; format?: (n: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length;
  const x = (i: number) => pad.left + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => pad.top + h - (v / max) * h;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const everyNth = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 72))));
  const empty = n === 0 || series.every((s) => allZero(s.values));
  // The area under the main series is shaded; comparison lines stay lines.
  const primary = series.findIndex((s) => !s.ghost);

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left - pad.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / (w || 1)) * (n - 1)))));
  };

  return (
    <div ref={ref} className={styles.area} style={{ height }}>
      {empty ? <NoData height={height} /> : null}
      {width > 0 && !empty ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={series.map((s) => `${s.label}: ${s.values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}`).join(". ")}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t} className={styles.grid}>
              <line x1={pad.left} x2={pad.left + w} y1={y(t)} y2={y(t)} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {compact(t)}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            // Every nth label, plus the last one when it isn't crowding the previous label.
            (i % everyNth === 0 && n - 1 - i >= everyNth / 2) || i === n - 1 ? (
              <text key={`${label}-${i}`} className={styles.xLabel} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {shortDate(label)}
              </text>
            ) : null,
          )}
          {/* Keyed by point count: a new bucket size redraws, a new filter morphs. */}
          {series.map((s, i) => {
            const points = s.values.map((v, j) => [x(j), y(v)] as [number, number]);
            const line = curve(points);
            return (
              <g key={`${s.label}-${n}`} className={styles.tone} data-tone={s.tone} data-ghost={s.ghost || undefined}>
                {i === primary ? <path className={styles.fill} d={`${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} /> : null}
                <path className={styles.line} d={line} pathLength={s.ghost ? undefined : 1} />
              </g>
            );
          })}
          {hover !== null ? (
            <g className={styles.cursor}>
              <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} />
              {series.map((s) => (
                <circle key={s.label} className={styles.tone} data-tone={s.tone} data-ghost={s.ghost || undefined} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4} />
              ))}
            </g>
          ) : null}
        </svg>
      ) : null}
      {hover !== null && labels[hover] ? (
        <div className={styles.tooltip} style={{ left: Math.min(Math.max(x(hover), 90), width - 90) }}>
          <strong>{shortDate(labels[hover]!)}</strong>
          {series.map((s) => (
            <span key={s.label} className={styles.tipRow}>
              <i className={styles.tone} data-tone={s.tone} data-ghost={s.ghost || undefined} />
              {s.label}
              <b>{format(s.values[hover] ?? 0)}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ bars */

/** Stacked columns per bucket; each column grows from the baseline in turn. */
export function StackedBars({ labels, series, height = 200 }: { labels: string[]; series: Omit<Series, "ghost">[]; height?: number }) {
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const [hover, setHover] = useState<number | null>(null);
  if (allZero(totals)) return <NoData height={height} />;
  return (
    <div className={styles.barsWrap}>
      <div className={styles.bars} style={{ height }} role="img" aria-label={labels.map((l, i) => `${l}: ${series.map((s) => `${s.label} ${s.values[i]}`).join(", ")}`).join("; ")} onPointerLeave={() => setHover(null)}>
        {labels.map((label, i) => (
          <div key={`${label}-${labels.length}`} className={styles.column} style={{ "--i": i, "--n": labels.length } as React.CSSProperties} onPointerEnter={() => setHover(i)} data-hover={hover === i || undefined}>
            <div className={styles.stack} style={{ transform: `scaleY(${totals[i]! / max})` }}>
              {series.map((s) => (
                <span key={s.label} className={styles.tone} data-tone={s.tone} style={{ flexGrow: s.values[i] ?? 0 }} />
              ))}
            </div>
          </div>
        ))}
        {hover !== null ? (
          <div className={styles.tooltip} style={{ left: `${((hover + 0.5) / labels.length) * 100}%` }}>
            <strong>{shortDate(labels[hover]!)}</strong>
            {series.map((s) => (
              <span key={s.label} className={styles.tipRow}>
                <i className={styles.tone} data-tone={s.tone} />
                {s.label}
                <b>{s.values[hover] ?? 0}</b>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.barAxis}>
        <span>{labels[0] ? shortDate(labels[0]) : ""}</span>
        <span>{labels.at(-1) ? shortDate(labels.at(-1)!) : ""}</span>
      </div>
    </div>
  );
}

/** Gains above the line, losses below: how the roster moved in each bucket. */
export function FlowBars({ labels, gains, losses }: { labels: string[]; gains: number[]; losses: number[] }) {
  const max = Math.max(1, ...gains, ...losses);
  if (allZero([...gains, ...losses])) return <NoData height={140} title="No one joined or left" hint="Roster changes in this period appear here." />;
  return (
    <div className={styles.flow} role="img" aria-label={labels.map((l, i) => `${l}: +${gains[i]} −${losses[i]}`).join("; ")}>
      {labels.map((label, i) => (
        <div key={`${label}-${labels.length}`} className={styles.flowColumn} style={{ "--i": i } as React.CSSProperties} title={`${shortDate(label)}: +${gains[i]} / −${losses[i]}`}>
          <span className={styles.gain} style={{ transform: `scaleY(${(gains[i] ?? 0) / max})` }} />
          <span className={styles.loss} style={{ transform: `scaleY(${(losses[i] ?? 0) / max})` }} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ donut, ring */

export function Donut({ items, format, center }: { items: Array<{ label: string; value: number; tone: Tone }>; format: (n: number) => string; center: string }) {
  const total = items.reduce((s, x) => s + x.value, 0);
  if (!total) return <NoData title="Nothing to split yet" hint="Revenue by offer appears after the first payment." />;
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = items.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className={styles.donutWrap}>
      <div className={styles.donut}>
        <svg viewBox="0 0 128 128" role="img" aria-label={items.map((x) => `${x.label} ${format(x.value)}`).join(", ")}>
          <circle className={styles.track} cx="64" cy="64" r={r} />
          {items.map((item, i) => {
            const length = total ? (item.value / total) * c : 0;
            const segment = (
              <circle
                key={item.label}
                className={`${styles.segment} ${styles.tone}`}
                data-tone={item.tone}
                cx="64"
                cy="64"
                r={r}
                style={{ strokeDasharray: `${Math.max(0, length - gap)} ${c}`, strokeDashoffset: -offset, "--i": i } as React.CSSProperties}
              />
            );
            offset += length;
            return segment;
          })}
        </svg>
        <div className={styles.donutCenter}>
          <strong>
            <AnimatedNumber value={total} format={format} />
          </strong>
          <span>{center}</span>
        </div>
      </div>
      <ul className={styles.legend}>
        {items.map((item, i) => (
          <li key={item.label} style={{ "--i": i } as React.CSSProperties}>
            <i className={styles.tone} data-tone={item.tone} />
            <span>{item.label}</span>
            <b>{total ? Math.round((item.value / total) * 100) : 0}%</b>
            <small>{format(item.value)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single share out of 100, as an arc that fills to its value. */
export function Ring({ value, label, caption, tone = "accent" }: { value: number | null; label: string; caption?: string; tone?: Tone }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const share = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <figure className={styles.ring}>
      <div className={styles.ringArt}>
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle className={styles.track} cx="48" cy="48" r={r} />
          <circle className={`${styles.ringValue} ${styles.tone}`} data-tone={tone} cx="48" cy="48" r={r} style={{ strokeDasharray: `${share * c} ${c}` }} />
        </svg>
        <strong data-empty={value === null || undefined}>{value === null ? "No data" : <AnimatedNumber value={value} format={(n) => `${Math.round(n)}%`} />}</strong>
      </div>
      <figcaption>
        <span>{label}</span>
        {caption ? <small>{caption}</small> : null}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ funnel, ranking, split */

export function Funnel({ steps }: { steps: Array<{ label: string; value: number; tone: Tone }> }) {
  const max = Math.max(1, steps[0]?.value ?? 1);
  if (!steps[0]?.value) return <NoData height={120} />;
  return (
    <ol className={styles.funnel}>
      {steps.map((step, i) => {
        const prev = steps[i - 1]?.value;
        return (
          <li key={step.label} style={{ "--i": i } as React.CSSProperties}>
            <div className={styles.funnelHead}>
              <span>{step.label}</span>
              <strong>
                <AnimatedNumber value={step.value} />
              </strong>
              {prev ? <small>{Math.round((step.value / prev) * 100)}% of previous</small> : null}
            </div>
            <div className={styles.funnelTrack}>
              <span className={styles.tone} data-tone={step.tone} style={{ transform: `scaleX(${step.value / max})` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function RankList({ items, format = (n) => String(n), tone = "accent" }: { items: Array<{ label: ReactNode; key: string; value: number; note?: string }>; format?: (n: number) => string; tone?: Tone }) {
  const max = Math.max(1, ...items.map((x) => x.value));
  if (!items.length || allZero(items.map((x) => x.value))) return <NoData height={120} />;
  return (
    <ul className={styles.rank}>
      {items.map((item, i) => (
        <li key={item.key} style={{ "--i": i } as React.CSSProperties}>
          <div className={styles.rankHead}>
            <span>{item.label}</span>
            <b>{format(item.value)}</b>
          </div>
          <div className={styles.rankTrack}>
            <span className={styles.tone} data-tone={tone} style={{ transform: `scaleX(${item.value / max})` }} />
          </div>
          {item.note ? <small>{item.note}</small> : null}
        </li>
      ))}
    </ul>
  );
}

export function Split({ a, b }: { a: { label: string; value: number; tone: Tone }; b: { label: string; value: number; tone: Tone } }) {
  if (!a.value && !b.value) return <NoData height={96} />;
  const total = a.value + b.value;
  return (
    <div className={styles.split}>
      <div className={styles.splitBar} role="img" aria-label={`${a.label} ${a.value}, ${b.label} ${b.value}`}>
        <span className={styles.tone} data-tone={a.tone} style={{ flexGrow: a.value / total }} />
        <span className={styles.tone} data-tone={b.tone} style={{ flexGrow: b.value / total }} />
      </div>
      <div className={styles.splitLegend}>
        {[a, b].map((x) => (
          <span key={x.label}>
            <i className={styles.tone} data-tone={x.tone} />
            {x.label}
            <b>
              <AnimatedNumber value={x.value} />
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
