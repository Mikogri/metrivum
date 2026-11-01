import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { IconButton, Tooltip as InfoTooltip, TooltipTrigger } from "@metrivum/ui-web";
import { createPortal } from "react-dom";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { AnalysisRepetition, TrajectoryPoint } from "@metrivum/api-client-web";
import { formatNumber } from "~/shared/i18n/format";
import type { Locale } from "~/shared/i18n/locale";
import styles from "./charts.module.css";

import { normalizePhase, type PhaseKind } from "../phases";
export { normalizePhase, PHASE_KINDS, type PhaseKind } from "../phases";

/** Which phase a moment belongs to, from the analyzer's repetitions (no phases are invented). */
export function phaseAt(repetitions: AnalysisRepetition[], seconds: number): PhaseKind {
  for (const rep of repetitions) {
    if (seconds < rep.startSeconds || seconds > rep.endSeconds) continue;
    for (const phase of rep.phases) if (seconds >= phase.startSeconds && seconds <= phase.endSeconds) return normalizePhase(phase.kind);
  }
  return "none";
}

/** The trajectory sample closest to a moment in the video. */
export function nearest(points: TrajectoryPoint[], seconds: number): TrajectoryPoint | null {
  let best: TrajectoryPoint | null = null;
  for (const p of points) if (!best || Math.abs(p.seconds - seconds) < Math.abs(best.seconds - seconds)) best = p;
  return best;
}

/** Speed is a magnitude; retain raw signed image-axis velocity in analyzer results. */
export function movementSpeed(point: TrajectoryPoint): number | null {
  return point.velocity == null ? null : Math.abs(point.velocity);
}

/**
 * One value per sample for a time chart. Occluded samples become gaps, and a gap sample is inserted between two
 * tracked segments, so the line breaks there instead of joining two separate tracks (nothing is invented).
 */
export function timeSeries(points: TrajectoryPoint[], value: (p: TrajectoryPoint) => number | null) {
  const x: number[] = [];
  const y: Array<number | null> = [];
  const source: Array<TrajectoryPoint | null> = [];
  let previous: TrajectoryPoint | null = null;
  for (const point of points) {
    if (previous && point.segment !== previous.segment && !previous.occluded) {
      x.push((previous.seconds + point.seconds) / 2); y.push(null); source.push(null);
    }
    const v = point.occluded ? null : value(point);
    x.push(point.seconds); y.push(v === null || v === undefined || !Number.isFinite(v) ? null : v); source.push(point);
    previous = point;
  }
  return { x, y, source };
}

/** Unbroken pieces of the bar path, one phase each; a phase change shares its first sample with the previous piece. */
export function pathRuns(points: TrajectoryPoint[], repetitions: AnalysisRepetition[]) {
  const out: Array<{ kind: PhaseKind; points: TrajectoryPoint[] }> = [];
  let current: { kind: PhaseKind; points: TrajectoryPoint[] } | null = null;
  let previous: TrajectoryPoint | null = null;
  for (const point of points) {
    if (point.occluded) { if (current) out.push(current); current = null; previous = null; continue; }
    const kind = phaseAt(repetitions, point.seconds);
    if (current && previous && point.segment !== previous.segment) { out.push(current); current = null; }
    if (current && current.kind !== kind) { const last: TrajectoryPoint = current.points[current.points.length - 1]!; out.push(current); current = { kind, points: [last] }; }
    if (!current) current = { kind, points: [] };
    current.points.push(point);
    previous = point;
  }
  if (current?.points.length) out.push(current);
  return out;
}

// ——— shared canvas helpers ———

let library: Promise<typeof uPlot> | null = null;
/** uPlot draws on canvas; it is loaded in the browser only (and not at all where canvas is unavailable). */
function loadLibrary() {
  library ??= import("uplot").then((module) => module.default);
  return library;
}
function canvasAvailable() {
  try { return typeof document !== "undefined" && Boolean(document.createElement("canvas").getContext("2d")); } catch { return false; }
}

interface Palette { text: string; grid: string; axis: string; cursor: string; background: string; phase: Record<PhaseKind, string> }
function readPalette(element: HTMLElement): Palette {
  const css = getComputedStyle(element);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    text: v("--tf-color-text-tertiary", "#888"),
    grid: v("--tf-color-border", "rgba(128,128,128,.25)"),
    axis: v("--tf-color-border-strong", "rgba(128,128,128,.45)"),
    cursor: v("--tf-color-text", "#fff"),
    background: v("--tf-color-surface", "#111"),
    // Defined once in ../phases.css; the fallback only shows if that file failed to load.
    phase: { eccentric: v("--phase-eccentric", "gray"), pause: v("--phase-pause", "gray"), concentric: v("--phase-concentric", "gray"), none: v("--phase-none", "gray") },
  };
}

/** Any CSS colour with a different alpha (canvas gradients need real colours, not color-mix()). */
function alpha(color: string, a: number) {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return color;
  ctx.fillStyle = color;
  const normal = ctx.fillStyle;
  if (normal.startsWith("#")) {
    const n = parseInt(normal.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const parts = normal.match(/[\d.]+/g);
  return parts && parts.length >= 3 ? `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})` : color;
}

/** Rebuilds the chart when the theme flips (class or data-theme on <html>, or the system scheme). */
function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", bump);
    return () => { observer.disconnect(); media?.removeEventListener?.("change", bump); };
  }, []);
  return version;
}

function axis(palette: Palette, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
  return {
    stroke: palette.text,
    font: "10px Inter, system-ui, sans-serif",
    grid: { stroke: palette.grid, width: 1, dash: [3, 4] },
    ticks: { show: false },
    border: { show: false },
    gap: 6,
    ...extra,
  };
}

/** The plot area always gets a closed frame, whatever ticks the axes happen to draw. */
function drawFrame(u: uPlot, color: string) {
  const { left, top, width, height } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, devicePixelRatio);
  const inset = ctx.lineWidth / 2;
  ctx.strokeRect(Math.round(left) + inset, Math.round(top) + inset, Math.round(width) - inset * 2, Math.round(height) - inset * 2);
  ctx.restore();
}

interface Tip { crosshair?: boolean; points?: Array<{ left: number; top: number; color: string }>; left: number; top: number; flip: boolean; title: string; rows: Array<{ label: string; value: string; kind?: PhaseKind; color?: string }> }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <>
    <div className={styles.hoverVertical} style={{ left: tip.left }} aria-hidden="true" />
    {tip.crosshair ? <div className={styles.hoverHorizontal} style={{ top: tip.top }} aria-hidden="true" /> : null}
    {tip.points?.map((point, i) => <i key={i} className={styles.hoverPoint} style={{ left: point.left, top: point.top, borderColor: point.color }} aria-hidden="true" />)}
    <div className={styles.tooltip} style={{ left: tip.left, top: tip.top, translate: tip.flip ? "calc(-100% - 12px) 0" : "12px 0" }} role="presentation">
      <strong>{tip.title}</strong>
      {tip.rows.map((row) => (
        <span key={row.label} className={styles.tipRow}>
          {row.kind ? <i className={styles.tipSwatch} data-kind={row.kind} aria-hidden="true" /> : row.color ? <i className={styles.tipSwatch} style={{ background: row.color }} aria-hidden="true" /> : null}
          <span>{row.label}</span>
          <b>{row.value}</b>
        </span>
      ))}
    </div>
    </>
  );
}

// ——— time chart ———

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
  visible,
  phaseLabel,
  height = 190,
  invert = false,
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
  /** Phase kinds drawn at full strength; the others stay as a faint trace for context. */
  visible?: ReadonlySet<PhaseKind>;
  phaseLabel?: (kind: PhaseKind) => string;
  height?: number;
  /** Image rows grow downward: inverted, the bar moves down on the chart when it moves down in the video. */
  invert?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [over, setOver] = useState<HTMLElement | null>(null);
  const theme = useThemeVersion();
  const reps = useMemo(() => repetitions ?? [], [repetitions]);
  const series = useMemo(() => timeSeries(points, value), [points, value]);
  const latest = useRef({ onSeek, reps, visible, phaseLabel, unit, locale, timeLabel, label, series });
  latest.current = { onSeek, reps, visible, phaseLabel, unit, locale, timeLabel, label, series };
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const visibleKey = visible ? [...visible].sort().join() : "all";

  useEffect(() => {
    const element = host.current;
    if (!element || !canvasAvailable()) return;
    let disposed = false;
    let chart: uPlot | null = null;
    let observer: ResizeObserver | null = null;
    void loadLibrary().then((UPlot) => {
      if (disposed || !host.current) return;
      const palette = readPalette(element);
      const shown = (kind: PhaseKind) => !visible || visible.has(kind);
      const color = (kind: PhaseKind) => (shown(kind) ? palette.phase[kind] : alpha(palette.phase[kind], 0.22));
      // Phase colour changes exactly at the analyzer's phase boundaries: a hard-stop gradient along x.
      const stroke = (u: uPlot) => {
        const { left, width: w } = u.bbox;
        const gradient = u.ctx.createLinearGradient(left, 0, left + w, 0);
        const stops: Array<[number, PhaseKind]> = [[0, "none"]];
        for (const rep of reps) for (const phase of rep.phases) {
          stops.push([u.valToPos(phase.startSeconds, "x", true), normalizePhase(phase.kind)]);
          stops.push([u.valToPos(phase.endSeconds, "x", true), "none"]);
        }
        stops.sort((a, b) => a[0] - b[0]);
        let kind: PhaseKind = "none";
        gradient.addColorStop(0, color("none"));
        for (const [position, next] of stops.slice(1)) {
          const r = Math.min(1, Math.max(0, (position - left) / w));
          gradient.addColorStop(r, color(kind));
          gradient.addColorStop(r, color(next));
          kind = next;
        }
        gradient.addColorStop(1, color(kind));
        return gradient;
      };
      const options: uPlot.Options = {
        width: element.clientWidth || 600,
        height,
        legend: { show: false },
        padding: [10, 12, 0, 0],
        scales: { x: { time: false }, y: { dir: invert ? -1 : 1, range: (_u, min, max) => { const pad = (max - min) * 0.08 || 1; return [min - pad, max + pad]; } } },
        axes: [
          axis(palette, { values: (_u, ticks) => ticks.map((t) => `${formatNumber(locale, t, 1)} s`) }),
          axis(palette, { size: 46, values: (_u, ticks) => ticks.map((t) => formatNumber(locale, t, Math.abs(t) >= 100 ? 0 : 1)) }),
        ],
        series: [{}, {
          stroke, width: 2, spanGaps: false, points: { show: false },
        }],
        cursor: {
          drag: { x: false, y: false, setScale: false },
          y: false,
          x: true,
          points: { size: 8, width: 2, stroke: palette.cursor, fill: (u) => { const idx = u.cursor.idx; const s = idx == null ? null : latest.current.series.source[idx]; return s ? palette.phase[phaseAt(reps, s.seconds)] : palette.phase.none; } },
        },
        hooks: {
          // Phase colours behind the line: each lowering, pause and lifting span is tinted in its colour.
          drawClear: [(u) => {
            const { top, height: h } = u.bbox;
            u.ctx.save();
            for (const rep of reps) for (const phase of rep.phases) {
              const kind = normalizePhase(phase.kind);
              if (!shown(kind) || kind === "none") continue;
              const x0 = u.valToPos(phase.startSeconds, "x", true);
              const x1 = u.valToPos(phase.endSeconds, "x", true);
              u.ctx.fillStyle = alpha(palette.phase[kind], 0.08);
              u.ctx.fillRect(x0, top, Math.max(0, x1 - x0), h);
            }
            u.ctx.restore();
          }],
          setCursor: [(u) => {
            const idx = u.cursor.idx;
            const now = latest.current;
            const sample = idx == null ? null : now.series.source[idx];
            const v = idx == null ? null : now.series.y[idx];
            if (!sample || v == null || u.cursor.left == null || u.cursor.left < 0) { setTip(null); return; }
            const kind = phaseAt(now.reps, sample.seconds);
            setTip({
              left: u.valToPos(sample.seconds, "x"), top: Math.max(0, u.valToPos(v, "y")), flip: u.cursor.left > u.over.clientWidth - 180,
              title: `${formatNumber(now.locale, sample.seconds, 2)} s`,
              rows: [
                { label: now.label, value: `${formatNumber(now.locale, v, 2)} ${now.unit}` },
                ...(kind !== "none" ? [{ label: now.phaseLabel?.(kind) ?? kind, value: "", kind }] : []),
              ],
            });
          }],
          draw: [(u) => drawFrame(u, palette.axis)],
          ready: [(u) => placePlayhead(u)],
          setSize: [(u) => placePlayhead(u)],
        },
      };
      chart = new UPlot(options, [series.x, series.y], element);
      plot.current = chart;
      setOver(chart.over);
      // Click or drag on the plot to move the video there.
      const over = chart.over;
      let dragging = false;
      const seekAt = (clientX: number) => {
        const seek = latest.current.onSeek;
        if (!seek || !chart) return;
        const rect = over.getBoundingClientRect();
        const seconds = chart.posToVal(clientX - rect.left, "x");
        const xs = latest.current.series.x;
        if (xs.length) seek(Math.max(xs[0]!, Math.min(xs[xs.length - 1]!, seconds)));
      };
      over.addEventListener("pointerdown", (event) => { if (!latest.current.onSeek) return; dragging = true; over.setPointerCapture?.(event.pointerId); seekAt(event.clientX); });
      over.addEventListener("pointermove", (event) => { if (dragging) seekAt(event.clientX); });
      const stop = () => { dragging = false; };
      over.addEventListener("pointerup", stop);
      over.addEventListener("pointercancel", stop);
      observer = new ResizeObserver(() => {
        if (!chart || !host.current) return;
        const w = host.current.clientWidth;
        if (w && Math.abs(w - chart.width) > 1) chart.setSize({ width: w, height });
      });
      observer.observe(element);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      setOver(null);
      chart?.destroy();
      plot.current = null;
    };
    // The chart is rebuilt when what it draws changes; the cursor moves without a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, reps, visibleKey, height, theme, locale, invert]);

  function placePlayhead(u: uPlot | null = plot.current) {
    const line = playhead.current;
    if (!line || !u) return;
    const at = cursorRef.current;
    const xs = latest.current.series.x;
    if (at == null || !xs.length || at < xs[0]! || at > xs[xs.length - 1]!) { line.hidden = true; return; }
    line.hidden = false;
    line.style.transform = `translateX(${u.valToPos(at, "x")}px)`;
  }
  useEffect(() => placePlayhead());

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.head}>
        <span className={styles.title}>{label}</span>
        <span className={styles.unit}>{unit} · {timeLabel}</span>
      </figcaption>
      <div className={styles.chart} data-seekable={onSeek ? "" : undefined} role="img" aria-label={`${label} (${unit})`} onPointerLeave={() => setTip(null)}>
        <div ref={host} className={styles.canvas} style={{ minHeight: height }} />
        {over ? createPortal(<><div ref={playhead} className={styles.playhead} hidden aria-hidden="true" /><Tooltip tip={tip} /></>, over) : null}
      </div>
    </figure>
  );
}

// ——— bar path (x/y) ———

/** x/y bar path, drawn as the camera saw it (y grows downward in image coordinates), coloured by phase. */
export function BarPathPlot({ points, unit, label, cursor, repetitions = [], visible, locale = "en", phaseLabel, timeLabel = "Time" }: {
  points: TrajectoryPoint[]; unit: string; label: string; cursor?: number | null; repetitions?: AnalysisRepetition[]; visible?: ReadonlySet<PhaseKind>;
  locale?: Locale; phaseLabel?: (kind: PhaseKind) => string; timeLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const dot = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [over, setOver] = useState<HTMLElement | null>(null);
  const theme = useThemeVersion();
  const runs = useMemo(() => pathRuns(points, repetitions), [points, repetitions]);
  const shownPoints = useMemo(() => points.filter((p) => !p.occluded), [points]);
  const visibleKey = visible ? [...visible].sort().join() : "all";
  const latest = useRef({ shownPoints, repetitions, locale, unit, phaseLabel, timeLabel });
  latest.current = { shownPoints, repetitions, locale, unit, phaseLabel, timeLabel };
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    const element = host.current;
    if (!element || !canvasAvailable() || !shownPoints.length) return;
    let disposed = false;
    let chart: uPlot | null = null;
    let observer: ResizeObserver | null = null;
    void loadLibrary().then((UPlot) => {
      if (disposed || !host.current) return;
      const palette = readPalette(element);
      // Same scale on both axes so the path keeps the shape the camera saw.
      const xs = shownPoints.map((p) => p.x);
      const ys = shownPoints.map((p) => p.y);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) * 1.15;
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const size = Math.min(element.clientWidth || 280, 360);
      const shown = (kind: PhaseKind) => !visible || visible.has(kind);
      const options: uPlot.Options = {
        mode: 2,
        width: size,
        height: size,
        legend: { show: false },
        padding: [8, 10, 0, 0],
        scales: {
          x: { time: false, auto: false, range: [cx - span / 2, cx + span / 2] },
          // Image rows grow downward: invert so the path looks like the video.
          y: { auto: false, range: [cy - span / 2, cy + span / 2], dir: -1 },
        },
        axes: [
          axis(palette, { values: (_u, ticks) => ticks.map((t) => formatNumber(locale, t, 0)) }),
          axis(palette, { size: 40, values: (_u, ticks) => ticks.map((t) => formatNumber(locale, t, 0)) }),
        ],
        cursor: { drag: { x: false, y: false, setScale: false }, points: { show: false }, x: false, y: false },
        series: [
          {},
          ...runs.map((run) => ({
            stroke: shown(run.kind) ? palette.phase[run.kind] : alpha(palette.phase[run.kind], 0.15),
            width: 2.5,
            paths: UPlot.paths.linear!(),
            points: { show: false },
            facets: [{ scale: "x", auto: false }, { scale: "y", auto: false }],
          }) as uPlot.Series),
        ],
        hooks: { draw: [(u) => drawFrame(u, palette.axis)], ready: [(u) => placeDot(u)], setSize: [(u) => placeDot(u)] },
      };
      const data = [null, ...runs.map((run) => [run.points.map((p) => p.x), run.points.map((p) => p.y)])] as unknown as uPlot.AlignedData;
      chart = new UPlot(options, data, element);
      plot.current = chart;
      setOver(chart.over);
      const over = chart.over;
      // Hover: the closest tracked sample on screen, with its time and phase.
      over.addEventListener("pointermove", (event) => {
        if (!chart) return;
        const rect = over.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const now = latest.current;
        let best: TrajectoryPoint | null = null;
        let distance = 24 * 24;
        for (const p of now.shownPoints) {
          const d = (chart.valToPos(p.x, "x") - px) ** 2 + (chart.valToPos(p.y, "y") - py) ** 2;
          if (d < distance) { distance = d; best = p; }
        }
        if (!best) { setTip(null); return; }
        const kind = phaseAt(now.repetitions, best.seconds);
        setTip({
          crosshair: true, left: chart.valToPos(best.x, "x"), top: chart.valToPos(best.y, "y"), flip: chart.valToPos(best.x, "x") > over.clientWidth - 180,
          title: `${formatNumber(now.locale, best.seconds, 2)} s`,
          rows: [
            { label: "x", value: `${formatNumber(now.locale, best.x, 1)} ${now.unit}` },
            { label: "y", value: `${formatNumber(now.locale, best.y, 1)} ${now.unit}` },
            ...(kind !== "none" ? [{ label: now.phaseLabel?.(kind) ?? kind, value: "", kind }] : []),
          ],
        });
      });
      over.addEventListener("pointerleave", () => setTip(null));
      observer = new ResizeObserver(() => {
        if (!chart || !host.current) return;
        const next = Math.min(host.current.clientWidth, 360);
        if (next && Math.abs(next - chart.width) > 1) chart.setSize({ width: next, height: next });
      });
      observer.observe(element);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      setOver(null);
      chart?.destroy();
      plot.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, shownPoints, visibleKey, theme, locale]);

  function placeDot(u: uPlot | null = plot.current) {
    const element = dot.current;
    if (!element || !u) return;
    const at = cursorRef.current;
    const current = at == null ? null : nearest(points, at);
    if (!current || current.occluded) { element.hidden = true; return; }
    element.hidden = false;
    element.style.transform = `translate(${u.valToPos(current.x, "x")}px, ${u.valToPos(current.y, "y")}px)`;
  }
  useEffect(() => placeDot());

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.head}>
        <span className={styles.title}>{label}</span>
        <span className={styles.unit}>{unit}</span>
      </figcaption>
      <div className={styles.chart} role="img" aria-label={`${label} (${unit})`}>
        <div ref={host} className={styles.canvas} />
        {over ? createPortal(<><div ref={dot} className={styles.dot} hidden aria-hidden="true" /><Tooltip tip={tip} /></>, over) : null}
      </div>
    </figure>
  );
}

// ——— phase timeline ———

export function PhaseTimeline({ repetitions, phaseLabel, repLabel, locale, cursor, onSeek }: { repetitions: AnalysisRepetition[]; phaseLabel: (kind: string) => string; repLabel: (n: number) => string; locale: Locale; cursor?: number | null; onSeek?: (seconds: number) => void }) {
  return (
    <ol className={styles.timeline}>
      {repetitions.map((rep, i) => {
        const total = rep.endSeconds - rep.startSeconds || 1;
        const inside = cursor != null && cursor >= rep.startSeconds && cursor <= rep.endSeconds;
        return (
          <li key={rep.number} style={{ "--i": i } as React.CSSProperties} data-current={inside || undefined}>
            <span className={styles.repName}>{repLabel(rep.number)}</span>
            <span className={styles.phases}>
              {rep.phases.map((phase, index) => (
                <button
                  type="button"
                  key={index}
                  className={styles.phase}
                  data-kind={normalizePhase(phase.kind)}
                  style={{ width: `${((phase.endSeconds - phase.startSeconds) / total) * 100}%` }}
                  aria-label={`${repLabel(rep.number)} · ${phaseLabel(phase.kind)}${rep.phases.filter(p => normalizePhase(p.kind) === normalizePhase(phase.kind)).length > 1 ? ` ${rep.phases.slice(0, index + 1).filter(p => normalizePhase(p.kind) === normalizePhase(phase.kind)).length}` : ''}`}
                  onClick={() => onSeek?.(phase.startSeconds)}
                  disabled={!onSeek}
                >
                  <span className={styles.phaseTip} role="presentation">{phaseLabel(phase.kind)} · {formatNumber(locale, phase.endSeconds - phase.startSeconds, 2)} s</span>
                </button>
              ))}
              {inside ? <span className={styles.timelineCursor} style={{ left: `${((cursor! - rep.startSeconds) / total) * 100}%` }} aria-hidden="true" /> : null}
            </span>
            <span className={styles.duration}>{formatNumber(locale, total, 2)} s</span>
          </li>
        );
      })}
    </ol>
  );
}

// ——— overlay (comparisons) ———

/** One line on an overlay chart: its own x and y values, colour and label. */
export interface OverlayLine {
  id: string; label: string; color: string; x: number[]; y: Array<number | null>;
  /** Points where one phase ends and the next begins (drawn as dots on the line). */
  marks?: Array<{ x: number; y: number }>;
}

/**
 * Several repetitions on one chart (from one video or several): each line is drawn against its own x values,
 * so reps of different lengths and from different videos overlap from their start.
 */
export function OverlayChart({ lines, label, unit, xUnit = "s", locale, height = 322, square = false, invertY = false, timeOrigin = "rep", description }: {
  description?: string;
  timeOrigin?: "rep" | "phase";
  lines: OverlayLine[]; label: string; unit: string; xUnit?: string; locale: Locale; height?: number; square?: boolean; invertY?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState<HTMLElement | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const theme = useThemeVersion();
  const latest = useRef({ lines, locale, unit, xUnit, label, timeOrigin });
  latest.current = { lines, locale, unit, xUnit, label, timeOrigin };
  const key = lines.map((line) => `${line.id}:${line.color}:${line.x.length}`).join("|");

  useEffect(() => {
    const element = host.current;
    if (!element || !canvasAvailable() || !lines.length) return;
    let disposed = false;
    let chart: uPlot | null = null;
    let observer: ResizeObserver | null = null;
    void loadLibrary().then((UPlot) => {
      if (disposed || !host.current) return;
      const palette = readPalette(element);
      const xs = lines.flatMap((line) => line.x);
      const ys = lines.flatMap((line) => line.y).filter((v): v is number => v != null && Number.isFinite(v));
      const range = (values: number[], pad = 0.06): [number, number] => {
        let min = Math.min(...values); let max = Math.max(...values);
        if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
        if (min === max) { min -= 1; max += 1; }
        const p = (max - min) * pad; return [min - p, max + p];
      };
      let xRange = range(xs, 0.02); let yRange = range(ys);
      if (ys.length && ys.every(v => v >= 0)) yRange[0] = Math.max(0, yRange[0]);
      if (square) {
        // Same scale on both axes so bar paths keep their shape.
        const span = Math.max(xRange[1] - xRange[0], yRange[1] - yRange[0]);
        const cx = (xRange[0] + xRange[1]) / 2; const cy = (yRange[0] + yRange[1]) / 2;
        xRange = [cx - span / 2, cx + span / 2]; yRange = [cy - span / 2, cy + span / 2];
      }
      const width = element.clientWidth || 600;
      const size = square ? Math.min(width, 420) : width;
      chart = new UPlot({
        mode: 2,
        width: size,
        height: square ? size : height,
        legend: { show: false },
        padding: [10, 12, 0, 0],
        scales: { x: { time: false, auto: false, range: xRange }, y: { auto: false, range: yRange, dir: invertY ? -1 : 1 } },
        axes: [
          axis(palette, { values: (_u, ticks) => ticks.map((t) => `${formatNumber(locale, t, 1)}${xUnit === "s" ? " s" : ""}`) }),
          axis(palette, { size: 44, values: (_u, ticks) => ticks.map((t) => formatNumber(locale, t, Math.abs(t) >= 100 ? 0 : 1)) }),
        ],
        cursor: { drag: { x: false, y: false, setScale: false }, points: { show: false }, x: false, y: false },
        series: [{}, ...lines.map((line) => ({ stroke: line.color, width: 1.75, paths: UPlot.paths.linear!(), points: { show: false }, facets: [{ scale: "x", auto: false }, { scale: "y", auto: false }] }) as uPlot.Series)],
        hooks: {
          draw: [(u) => {
            drawFrame(u, palette.axis);
          }],
        },
      }, [null, ...lines.map((line) => [line.x, line.y])] as unknown as uPlot.AlignedData, element);
      setOver(chart.over);
      const area = chart.over;
      area.addEventListener("pointermove", (event) => {
        if (!chart) return;
        const rect = area.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const at = chart.posToVal(px, "x");
        const now = latest.current;
        // Each line's value at the pointer's x (nearest sample), listed in the tooltip.
        const rows = now.lines.map((line) => {
          let best = -1; let distance = Infinity;
          for (let i = 0; i < line.x.length; i++) { const d = Math.abs(line.x[i]! - at); if (d < distance) { distance = d; best = i; } }
          const value = best < 0 ? null : line.y[best];
          return value == null ? null : { line, value, seconds: line.x[best]!, x: chart!.valToPos(line.x[best]!, "x"), y: chart!.valToPos(value, "y") };
        }).filter((row): row is NonNullable<typeof row> => row !== null);
        if (!rows.length) { setTip(null); return; }
        setTip({
          crosshair: square, points: rows.map(row => ({ left: row.x, top: row.y, color: row.line.color })),
          left: px, top: py, flip: px > area.clientWidth - 200,
          title: now.xUnit === "s" ? `${formatNumber(now.locale, at, 2)} s into the ${now.timeOrigin}` : now.label,
          rows: rows.map((row) => ({ label: now.xUnit === "s" ? `${row.line.label} (${formatNumber(now.locale, row.seconds, 2)} s)` : row.line.label, value: `${formatNumber(now.locale, row.value, 2)} ${now.unit}`, color: row.line.color })),
        });
      });
      area.addEventListener("pointerleave", () => setTip(null));
      observer = new ResizeObserver(() => {
        if (!chart || !host.current) return;
        const w = host.current.clientWidth;
        const next = square ? Math.min(w, 420) : w;
        if (next && Math.abs(next - chart.width) > 1) chart.setSize({ width: next, height: square ? next : height });
      });
      observer.observe(element);
    });
    return () => { disposed = true; observer?.disconnect(); setOver(null); chart?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, theme, locale, height, square, invertY]);

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.head}>
        <span className={styles.title}>
          {description ? <TooltipTrigger delay={150}>
            <IconButton size="sm" variant="ghost" label={`About ${label}`} icon={<Info />} showTooltip={false} />
            <InfoTooltip placement="top">{description}</InfoTooltip>
          </TooltipTrigger> : null}
          {label}
        </span>
        <span className={styles.unit}>{unit}</span>
      </figcaption>
      <div className={styles.chart} role="img" aria-label={`${label} (${unit}), ${lines.length} repetitions`}>
        <div ref={host} className={styles.canvas} style={{ minHeight: square ? undefined : height }} />
        {over ? createPortal(<Tooltip tip={tip} />, over) : null}
      </div>
      <ul className={styles.legend} aria-hidden="true">
        {lines.map((line) => <li key={line.id}><i style={{ background: line.color }} />{line.label}</li>)}
      </ul>
    </figure>
  );
}
