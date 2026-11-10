import { useEffect, useState } from "react";
import styles from "./AuthWorking.module.css";

/**
 * The short wait after a sign-in link: the Metrivum mark builds itself piece by piece, a thin bar runs underneath and
 * the line below steps through what is happening. Calm, centred, and the same in every auth flow.
 */
export function AuthWorking({
  title,
  steps,
}: {
  title: string;
  steps: readonly string[];
}) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    const timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, steps.length - 1)),
      1400,
    );
    return () => window.clearInterval(timer);
  }, [steps.length]);

  return (
    <div className={styles.working} role="status" aria-live="polite">
      <div className={styles.mark} aria-hidden="true">
        <svg viewBox="413 233 706 556" focusable="false">
          <polygon
            className={styles.piece}
            style={{ "--i": 0 } as React.CSSProperties}
            points="415,235 765,497 950,365 946,505 755,650 535,478 533,787 415,695"
          />
          <polygon
            className={styles.piece}
            style={{ "--i": 1 } as React.CSSProperties}
            points="970,345 1117,235 1117,370 972,478"
          />
          <polygon
            className={styles.piece}
            style={{ "--i": 2 } as React.CSSProperties}
            points="778,682 1117,418 1117,580 868,772"
          />
        </svg>
      </div>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {steps.length ? (
          <p className={styles.step} key={step}>
            {steps[step]}
          </p>
        ) : null}
      </div>
      <div className={styles.track} aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
