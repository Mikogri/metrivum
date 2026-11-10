import styles from "./FormulaMark.module.css";

/**
 * The formula mark used across the editor and the formula library: an italic ƒ in a small square
 * with a fill and a border. `waiting` turns it amber (the formula still needs data).
 */
export function FormulaMark({
  size = "md",
  tone = "neutral",
  className,
}: {
  size?: "sm" | "md" | "lg";
  tone?: "neutral" | "accent" | "waiting";
  className?: string;
}) {
  return (
    <span
      className={`${styles.mark} ${className ?? ""}`}
      data-size={size}
      data-tone={tone}
      aria-hidden="true"
    >
      ƒ
    </span>
  );
}
