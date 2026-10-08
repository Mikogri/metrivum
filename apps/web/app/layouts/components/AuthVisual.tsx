import styles from "./AuthVisual.module.css";

// Decorative: a cycle grid whose days light up in a slow wave (no data, no text).
const ROWS = 9;
const COLS = 14;

export function AuthVisual() {
  return (
    <div className={styles.wrap}>
      <div className={styles.glow} />
      <div className={styles.grid} style={{ "--cols": COLS } as React.CSSProperties}>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const on = (row * 7 + col * 3) % 5 === 0 || (row + col) % 7 === 0;
          return <span key={i} className={styles.dot} data-on={on || undefined} style={{ "--d": row + col } as React.CSSProperties} />;
        })}
      </div>
      <img src="/brand/trainflow-mark.png" alt="" width={159} height={128} className={styles.mark} />
    </div>
  );
}
