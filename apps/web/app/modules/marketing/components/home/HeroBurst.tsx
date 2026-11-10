import { useEffect, useRef } from "react";
import styles from "./HeroBurst.module.css";

const STRANDS = 46;
const W = 1440;
const H = 900;

type Strand = { d: string; width: number; opacity: number };

/**
 * One bundle of light fibres: they rise from the lower left, pinch together behind the headline and
 * fan out to the right edge, twisting as they pass the pinch (the end offsets flip sign).
 */
const strands: Strand[] = Array.from({ length: STRANDS }, (_, i) => {
  const t = (i / (STRANDS - 1)) * 2 - 1;
  const wobble = Math.sin(i * 1.7) * 34;
  const p0: [number, number] = [-90 + t * 50, 990 + t * 70];
  const p1: [number, number] = [320 + t * 30, 800 + t * 22];
  const p2: [number, number] = [780 + t * 18, 560 - t * 70];
  const p3: [number, number] = [W + 100, 440 + t * 600 + wobble];
  const d = `M${p0[0].toFixed(1)},${p0[1].toFixed(1)}C${p1[0].toFixed(1)},${p1[1].toFixed(1)},${p2[0].toFixed(1)},${p2[1].toFixed(1)},${p3[0].toFixed(1)},${p3[1].toFixed(1)}`;
  return {
    d,
    width: i % 5 === 0 ? 1.3 : i % 2 ? 0.55 : 0.8,
    opacity: 0.35 + ((i * 37) % 60) / 100,
  };
});

/** Strands that carry a spark, spread across the bundle. */
const sparks = strands.filter((_, i) => i % 4 === 1);

/**
 * The hero's light: a static bundle of fine fibres that draws itself in once, with sparks running
 * along a few of them. Sparks pause while the hero is off screen, so scrolling the page stays cheap.
 */
export function HeroBurst() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    const observer = new IntersectionObserver(([entry]) => {
      svg.toggleAttribute("data-paused", !entry?.isIntersecting);
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={styles.burst} aria-hidden="true">
      <span className={styles.bloom} />
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className={styles.svg}
      >
        <defs>
          <linearGradient
            id="burst-fibre"
            x1="0"
            x2={W}
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#d6f36b" stopOpacity="0" />
            <stop offset="0.22" stopColor="#d6f36b" stopOpacity="0.8" />
            <stop offset="0.48" stopColor="#f3ffbf" />
            <stop offset="0.72" stopColor="#b9e85a" stopOpacity="0.75" />
            <stop offset="0.9" stopColor="#74c4cf" stopOpacity="0.45" />
            <stop offset="1" stopColor="#74c4cf" stopOpacity="0" />
          </linearGradient>
          <filter id="burst-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g filter="url(#burst-glow)" opacity={0.3}>
          {strands.map((s, i) =>
            i % 3 === 0 ? (
              <path
                key={i}
                d={s.d}
                stroke="url(#burst-fibre)"
                strokeWidth={3}
                fill="none"
              />
            ) : null,
          )}
        </g>
        <g className={styles.fibres}>
          {strands.map((s, i) => (
            <path
              key={i}
              d={s.d}
              pathLength={1}
              stroke="url(#burst-fibre)"
              strokeWidth={s.width}
              strokeOpacity={s.opacity}
              fill="none"
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </g>
        <g className={styles.sparks}>
          {sparks.map((s, i) => (
            <g
              key={i}
              style={
                {
                  "--d": `${11 + ((i * 2.3) % 7)}s`,
                  "--o": `${-((i * 4.1) % 15)}s`,
                } as React.CSSProperties
              }
            >
              <path d={s.d} pathLength={1000} className={styles.halo} />
              <path d={s.d} pathLength={1000} className={styles.core} />
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
