import { Check, Download, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { FileCard } from "@trainflow/ui-web";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./TransferDiagram.module.css";

const WIRES = ["M0 70 C 120 70, 120 120, 200 120", "M200 120 C 280 120, 280 60, 400 60", "M200 120 C 280 120, 280 180, 400 180"];

export function TransferDiagram() {
  const m = usePublicMessages();
  const t = m.home.transfer;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(t.steps.length);

  // Import steps light up in order, then the export side receives the files.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    setStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setStep(i);
      if (i >= t.steps.length) clearInterval(timer);
    }, 650);
    return () => clearInterval(timer);
  }, [inView, t.steps.length]);

  const done = step >= t.steps.length;
  return (
    <div ref={ref} className={styles.diagram} data-inview={inView || undefined} data-done={done || undefined}>
      <div className={styles.side}>
        <p className={styles.sideLabel}>
          <Upload aria-hidden="true" />
          {t.importLabel}
        </p>
        <FileCard name={t.files.csvIn} kind="CSV" meta={t.sourceMeta} />
        <ol className={styles.steps}>
          {t.steps.map((label, i) => (
            <li key={label} data-state={i < step ? "done" : i === step ? "active" : "pending"}>
              <span className={styles.stepDot} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ol>
      </div>

      <svg className={styles.wires} viewBox="0 0 400 240" preserveAspectRatio="none" aria-hidden="true">
        {WIRES.map((d, i) => (
          <g key={d} className={i > 0 ? styles.wireOut : undefined}>
            <path className={styles.wire} d={d} />
            <path className={styles.spark} d={d} pathLength={100} style={{ "--o": `${-i * 0.5}s` } as React.CSSProperties} />
          </g>
        ))}
      </svg>

      <div className={styles.hub} aria-hidden="true">
        <span className={styles.hubRow}>{t.hub.rows}</span>
        <span className={styles.hubRow} data-ok={done || undefined}>
          <Check />
          {t.hub.check}
        </span>
      </div>

      <div className={styles.side}>
        <p className={styles.sideLabel}>
          <Download aria-hidden="true" />
          {t.exportLabel}
        </p>
        <div className={styles.outFile} style={{ "--i": 0 } as React.CSSProperties}>
          <FileCard name={t.files.pdfOut} kind="PDF" meta={t.revisionMeta} />
        </div>
        <div className={styles.outFile} style={{ "--i": 1 } as React.CSSProperties}>
          <FileCard name={t.files.csvOut} kind="CSV" meta={t.revisionMeta} />
        </div>
      </div>
    </div>
  );
}
