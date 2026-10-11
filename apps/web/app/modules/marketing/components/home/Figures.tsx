import styles from "./Figures.module.css";

// Training days of a 10-day cycle, repeated over three cycles.
const TRAINING = [0, 2, 3, 5, 7];

/**
 * Small drawings for the three pillars under the statement, each taken from the product itself:
 * a cycle map (training and rest days), a top set with its back-offs, and a file going in and out.
 */
export function Figure({ kind }: { kind: "cycle" | "sets" | "files" }) {
  return (
    <svg viewBox="0 0 240 120" className={styles.figure} aria-hidden="true" focusable="false">
      {kind === "cycle"
        ? [0, 1, 2].map((row) =>
            Array.from({ length: 10 }, (_, day) => (
              <circle
                key={`${row}-${day}`}
                cx={12 + day * 24}
                cy={28 + row * 32}
                r={6}
                className={TRAINING.includes(day) ? styles.on : styles.off}
              />
            )),
          )
        : null}
      {kind === "sets" ? (
        <>
          <path d="M0,108H240" className={styles.line} />
          <rect x="8" y="14" width="44" height="94" rx="3" className={styles.on} />
          {[68, 124, 180].map((x) => (
            <rect key={x} x={x} y="42" width="44" height="66" rx="3" className={styles.off} />
          ))}
          <path d="M30,6H202V34M90,6V34M146,6V34" className={styles.dash} />
        </>
      ) : null}
      {kind === "files" ? (
        <>
          <path d="M14,24H52L66,38V96H14Z M52,24V38H66" className={styles.off} />
          <path d="M174,24H212L226,38V96H174Z M212,24V38H226" className={styles.on} />
          <path d="M82,60H158M148,50L158,60L148,70" className={styles.line} />
          <path d="M24,56H56M24,68H56M24,80H44" className={styles.dash} />
          <path d="M184,56H216M184,68H216M184,80H204" className={styles.dash} />
        </>
      ) : null}
    </svg>
  );
}
