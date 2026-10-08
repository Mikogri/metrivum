import styles from "./Spotlight.module.css";

/** Soft light behind page heroes. Purely decorative. */
export function Spotlight() {
  return <div className={styles.spotlight} aria-hidden="true" />;
}
