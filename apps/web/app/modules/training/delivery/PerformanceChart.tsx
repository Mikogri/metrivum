import { useLayoutEffect, useRef, useState } from "react";
import { useTween } from "~/shared/lib/useTween";
import styles from "./delivery.module.css";

export interface PerformancePoint {
  date: string;
  value: number;
  /** Opens the workout the point comes from. */
  href?: string;
}

/**
 * One exercise metric over time. Drawn at the real width of its panel, so it stretches with the
 * layout instead of scaling a fixed drawing, and its points glide when the metric or period changes.
 */
export function PerformanceChart({ points, label, height = 180 }: { points: PerformancePoint[]; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.clientWidth) setWidth(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && entry.contentRect.width && setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const drawn = useTween(points.map((point) => point.value));
  const pad = { x: 12, top: 14, bottom: 22 };
  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const start = Date.parse(points[0]!.date);
  const end = Date.parse(points.at(-1)!.date);
  const floor = height - pad.bottom;
  const x = (point: PerformancePoint) => pad.x + ((Date.parse(point.date) - start) / Math.max(86400000, end - start)) * (width - pad.x * 2);
  const y = (value: number) => floor - ((value - low) / Math.max(1, high - low)) * (floor - pad.top);
  const coords = points.map((point, i) => [x(point), y(drawn[i] ?? point.value)] as const);
  return (
    <div ref={ref} className={styles.perfChart} style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={label}>
        <line x1={pad.x} x2={width - pad.x} y1={floor} y2={floor} className={styles.axis} />
        <polyline points={coords.map(([cx, cy]) => `${cx},${cy}`).join(" ")} />
        {points.map((point, i) => {
          const dot = (
            <circle cx={coords[i]![0]} cy={coords[i]![1]} r="4">
              <title>{point.date}: {point.value}</title>
            </circle>
          );
          return point.href ? (
            <a key={point.date} href={point.href} aria-label={`View workout ${point.date}: ${point.value}`}>
              {dot}
            </a>
          ) : (
            <g key={point.date}>{dot}</g>
          );
        })}
      </svg>
    </div>
  );
}
