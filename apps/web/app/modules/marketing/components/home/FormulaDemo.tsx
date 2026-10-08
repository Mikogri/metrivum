import { FunctionSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { prefersReducedMotion, useInView } from "../../lib/useInView";
import { usePublicMessages } from "../../messages";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { formatNumber } from "~/shared/i18n/format";
import styles from "./FormulaDemo.module.css";

const EXPRESSION = "base1Rm * percentage";

export function FormulaDemo() {
  const m = usePublicMessages();
  const f = m.home.formulas;
  const locale = useLocale();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [typed, setTyped] = useState(EXPRESSION.length);
  const [result, setResult] = useState(119);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) return;
    setTyped(0);
    setResult(0);
    let i = 0;
    const typing = setInterval(() => {
      i++;
      setTyped(i);
      if (i >= EXPRESSION.length) {
        clearInterval(typing);
        // Count up to the server-side style result once the expression is complete.
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / 700);
          const eased = 1 - Math.pow(1 - t, 3);
          setResult(Math.round(119 * eased * 10) / 10);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, 55);
    return () => clearInterval(typing);
  }, [inView]);

  const done = typed >= EXPRESSION.length;
  return (
    <div ref={ref} className={styles.card}>
      <div className={styles.editor}>
        <div className={styles.editorHead}>
          <FunctionSquare aria-hidden="true" />
          <span>percentage-1rm · v1</span>
        </div>
        <p className={styles.code} aria-label={EXPRESSION}>
          <span aria-hidden="true">{EXPRESSION.slice(0, typed)}</span>
          <span className={styles.caret} data-done={done || undefined} aria-hidden="true" />
        </p>
        <dl className={styles.io}>
          <div>
            <dt>{f.inputs}</dt>
            <dd>
              <span className={styles.chip}>base1Rm = {formatNumber(locale, 140)} kg</span>
              <span className={styles.chip}>percentage = {formatNumber(locale, 0.85)}</span>
            </dd>
          </div>
          <div>
            <dt>{f.result}</dt>
            <dd className={styles.result} data-done={done || undefined}>
              {formatNumber(locale, result, 1)} kg
            </dd>
          </div>
        </dl>
      </div>
      <div className={styles.builtIns}>
        <p className={styles.builtInsTitle}>{f.builtIns}</p>
        <ul role="list">
          {f.builtInNames.map((name, i) => (
            <li key={name} style={{ "--i": i } as React.CSSProperties} data-inview={inView || undefined}>
              {name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
