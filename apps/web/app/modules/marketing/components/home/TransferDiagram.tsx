import { ArrowRight, Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import styles from "./TransferDiagram.module.css";

/**
 * Import and export as one flow, left to right: the raw spreadsheet, what TrainFlow does with it
 * (steps, matched exercises, the check), and the files a published revision produces.
 */
export function TransferDiagram() {
  const m = usePublicMessages();
  const t = m.home.transfer;
  const [ref, inView] = useInView<HTMLDivElement>();
  const [step, setStep] = useState(t.steps.length);

  // The steps tick through once the diagram is on screen; the outputs arrive when they are done.
  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    setStep(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setStep(i);
      if (i >= t.steps.length) clearInterval(timer);
    }, 700);
    return () => clearInterval(timer);
  }, [inView, t.steps.length]);

  const done = step >= t.steps.length;
  return (
    <div ref={ref} className={styles.flow} data-done={done || undefined}>
      {/* 1 — the spreadsheet as it comes in */}
      <section className={styles.panel} aria-label={t.importLabel}>
        <header className={styles.panelHead}>
          <span className={styles.panelKind}><Upload aria-hidden="true" />{t.importLabel}</span>
          <span className={styles.fileName}><FileSpreadsheet aria-hidden="true" />{t.files.csvIn}</span>
        </header>
        <table className={styles.sheet}>
          <thead>
            <tr>{t.sheet.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
          </thead>
          <tbody>
            {t.sheet.rows.map((row, i) => (
              <tr key={row[0]} data-read={step > 0 || undefined} style={{ "--i": i } as React.CSSProperties}>
                {row.map((cell, j) => <td key={j}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.panelFoot}>{t.sourceMeta}</p>
      </section>

      <span className={styles.joint} aria-hidden="true"><ArrowRight /></span>

      {/* 2 — what happens to it */}
      <section className={styles.panel} aria-label={t.steps.join(", ")}>
        <ol className={styles.steps}>
          {t.steps.map((label, i) => (
            <li key={label} data-state={i < step ? "done" : i === step ? "active" : "pending"}>
              <span className={styles.stepMark} aria-hidden="true">{i < step ? <Check /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className={styles.mapping}>
          <p className={styles.mappingTitle}>{t.mapping.title}</p>
          {t.mapping.pairs.map(([from, to]) => (
            <p key={from} className={styles.pair} data-on={step > 1 || undefined}>
              <code>{from}</code>
              <ArrowRight aria-hidden="true" />
              <span>{to}</span>
            </p>
          ))}
        </div>
        <p className={styles.check} data-ok={done || undefined}>
          <span>{t.hub.rows}</span>
          <span className={styles.checkOk}><Check aria-hidden="true" />{t.hub.check}</span>
        </p>
      </section>

      <span className={styles.joint} aria-hidden="true"><ArrowRight /></span>

      {/* 3 — the files a revision gives back */}
      <section className={styles.panel} aria-label={t.exportLabel}>
        <header className={styles.panelHead}>
          <span className={styles.panelKind}><Download aria-hidden="true" />{t.exportLabel}</span>
          <span className={styles.fileName}>{t.outputs}</span>
        </header>
        <div className={styles.outputs}>
          <div className={styles.page} aria-label={t.files.pdfOut} role="img">
            <span className={styles.pageBadge}>PDF</span>
            <span className={styles.pageTitle}>{t.pdfTitle}</span>
            <span className={styles.pageMeta}>{t.pdfMeta}</span>
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className={styles.pageRow} style={{ "--w": `${92 - i * 9}%` } as React.CSSProperties} />)}
          </div>
          <div className={styles.files}>
            <p className={styles.file}><span className={styles.fileKind}>PDF</span><span>{t.files.pdfOut}</span></p>
            <p className={styles.file}><span className={styles.fileKind}>CSV</span><span>{t.files.csvOut}</span></p>
            <p className={styles.fileMeta}>{t.revisionMeta}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
