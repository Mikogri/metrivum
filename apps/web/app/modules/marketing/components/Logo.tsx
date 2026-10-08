import styles from "./Logo.module.css";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <img
      src="/brand/trainflow-logo.png"
      alt="TrainFlow"
      // Display size, so the logo never renders at its source size (548 px) if styles are late.
      width={size === "sm" ? 103 : 126}
      height={size === "sm" ? 18 : 22}
      className={size === "sm" ? styles.sm : styles.md}
      decoding="async"
    />
  );
}
