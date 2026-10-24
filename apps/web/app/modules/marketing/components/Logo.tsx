import styles from "./Logo.module.css";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={size === "sm" ? styles.sm : styles.md}>
      <img src="/brand/trainflow-mark.png" alt="" width={159} height={128} />
      <span>Metrivum</span>
    </span>
  );
}
