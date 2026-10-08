import type { ReactNode } from "react";
import { useInView } from "../../lib/useInView";
import styles from "./Bento.module.css";

export interface BentoTile {
  id: string;
  title: string;
  body: ReactNode;
  visual: ReactNode;
  /** Columns out of 12 on wide screens. */
  span: 5 | 6 | 7 | 12;
}

/** Features as a grid of tiles of different widths; each tile settles in as the grid scrolls into view. */
export function Bento({ tiles }: { tiles: BentoTile[] }) {
  const [ref, inView] = useInView<HTMLDivElement>({ margin: "0px 0px -10% 0px" });
  return (
    <div ref={ref} className={styles.grid} data-inview={inView || undefined}>
      {tiles.map((tile, i) => (
        <article key={tile.id} id={tile.id} className={styles.tile} data-span={tile.span} style={{ "--i": i } as React.CSSProperties} aria-labelledby={`${tile.id}-title`}>
          <div className={styles.copy}>
            <h3 id={`${tile.id}-title`}>{tile.title}</h3>
            <div className={styles.body}>{tile.body}</div>
          </div>
          <div className={styles.visual}>{tile.visual}</div>
        </article>
      ))}
    </div>
  );
}
