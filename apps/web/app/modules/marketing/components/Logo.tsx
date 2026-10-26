import { BrandMark } from "~/shared/ui/BrandMark";
import styles from "./Logo.module.css";

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={size === "sm" ? styles.sm : styles.md}>
      <BrandMark />
      <span>Metrivum</span>
    </span>
  );
}
