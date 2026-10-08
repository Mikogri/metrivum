import { Copy, FunctionSquare, History, Table2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "../../lib/useInView";
import { useSpringTilt } from "../../lib/useSpringTilt";
import { usePublicMessages } from "../../messages";
import styles from "./HeroSheet.module.css";

// Cells the "editing cursor" visits, as [row, column]. Columns: 0 exercise … 5 rest.
const CURSOR_PATH: Array<[number, number]> = [
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [2, 3],
  [2, 4],
  [3, 2],
  [3, 5],
  [4, 2],
  [0, 3],
];

export function HeroSheet({ flat = false }: { flat?: boolean }) {
  const m = usePublicMessages();
  const sheet = m.home.sheet;
  const tiltRef = useSpringTilt<HTMLDivElement>("", flat ? 0 : 4);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  // The cursor hops between cells like someone editing; each landing re-types that cell.
  useEffect(() => {
    const body = bodyRef.current;
    const ring = ringRef.current;
    if (!body || !ring || prefersReducedMotion()) return;
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;
    const move = () => {
      const [row, col] = CURSOR_PATH[index % CURSOR_PATH.length]!;
      const cell = body.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
      if (cell) {
        ring.style.opacity = "1";
        ring.style.width = `${cell.offsetWidth}px`;
        ring.style.height = `${cell.offsetHeight}px`;
        ring.style.transform = `translate(${cell.offsetLeft}px, ${cell.offsetTop}px)`;
        cell.removeAttribute("data-typed");
        // Force reflow so the re-type animation restarts on the same cell.
        void cell.offsetWidth;
        cell.setAttribute("data-typed", "");
      }
      index++;
      timer = setTimeout(move, 1500);
    };
    timer = setTimeout(move, 2600);
    return () => clearTimeout(timer);
  }, []);

  const columns = [sheet.columns.exercise, sheet.columns.set, sheet.columns.reps, sheet.columns.load, sheet.columns.effort, sheet.columns.rest];

  return (
    <div className={styles.stage} data-flat={flat || undefined}>
      <div className={styles.scroll}>
        <div className={styles.enter}>
          <div ref={tiltRef} className={styles.sheet} aria-hidden="true">
            {/* Window bar: where you are, in mono, and the save state. */}
            <div className={styles.toolbar}>
              <div className={styles.crumbs}>
                <span className={styles.program}>{sheet.program}</span>
                <span className={styles.slash}>/</span>
                <span>{sheet.cycle}</span>
                <span className={styles.slash}>/</span>
                <span>{sheet.day}</span>
                <span className={styles.slash}>/</span>
                <span className={styles.workout}>{sheet.workout}</span>
              </div>
              <span className={styles.saved}>
                <i />
                {sheet.saved}
              </span>
            </div>
            <div className={styles.workspace}>
              <div className={styles.rail}>
                {[
                  [Table2, sheet.tools.sheet],
                  [FunctionSquare, sheet.tools.formulas],
                  [Copy, sheet.tools.copy],
                  [History, sheet.tools.history],
                ].map(([Icon, label], i) => {
                  const Glyph = Icon as typeof Table2;
                  return (
                    <span key={String(label)} className={styles.tool} data-active={i === 0 || undefined} title={String(label)}>
                      <Glyph />
                    </span>
                  );
                })}
              </div>
            <div className={styles.table}>
              <div className={styles.headRow}>
                {columns.map((column) => (
                  <span key={column} className={styles.headCell}>
                    {column}
                  </span>
                ))}
              </div>
              <div ref={bodyRef} className={styles.body}>
                {sheet.rows.map((row, r) => (
                  <div key={r} className={styles.row} style={{ "--r": r } as React.CSSProperties} data-kind={r === 0 ? "top" : r === 1 ? "backoff" : undefined}>
                    {[row.exercise, row.set, row.reps, row.load, row.effort, row.rest].map((value, c) => (
                      <span key={c} className={styles.cell} data-cell={`${r}-${c}`} data-col={c}>
                        <span className={styles.value}>{value}</span>
                      </span>
                    ))}
                  </div>
                ))}
                <span ref={ringRef} className={styles.ring} />
              </div>
            </div>
            </div>
            {/* Recent edits, listed like a run log. */}
            <div className={styles.log}>
              <span className={styles.logTitle}>{sheet.recentTitle}</span>
              {sheet.recent.map((item, i) => (
                <span key={item.what} className={styles.logRow} style={{ "--r": i } as React.CSSProperties}>
                  <i data-first={i === 0 || undefined} />
                  <span className={styles.logWhat}>{item.what}</span>
                  <span className={styles.logValue}>{item.value}</span>
                  <span className={styles.logWhen}>{item.when}</span>
                </span>
              ))}
            </div>
            <div className={styles.formula}>
              <FunctionSquare />
              <code className={styles.expression}>{sheet.formula}</code>
              <span className={styles.result}>{sheet.formulaResult}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
