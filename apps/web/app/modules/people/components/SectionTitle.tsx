import type { ReactNode } from "react";
import styles from "./SectionTitle.module.css";

export type Tone = "green" | "violet" | "blue" | "orange" | "rose";

/** A coloured icon chip in one of the dashboard tones. */
export function ToneIcon({
  tone,
  children,
  size = "md",
}: {
  tone: Tone;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={styles.chip}
      data-tone={tone}
      data-size={size}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

/**
 * The head of every profile card: a toned icon, the title with an optional line under it, and actions on the right.
 * One component so every card has the same spacing.
 */
export function SectionTitle({
  id,
  icon,
  tone,
  title,
  sub,
  actions,
}: {
  id: string;
  icon: ReactNode;
  tone: Tone;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.head}>
      <ToneIcon tone={tone}>{icon}</ToneIcon>
      <div className={styles.text}>
        <h2 id={id} className={styles.title}>
          {title}
        </h2>
        {sub ? <p className={styles.sub}>{sub}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
