import styles from "./coaching.module.css";

type Tone = "green" | "blue" | "violet" | "orange" | "rose" | "neutral";

/** Each offer type has its own colour, the same everywhere it shows. */
const looks: Record<string, { tone: Tone; color: string }> = {
  strength: { tone: "rose", color: "var(--tf-color-danger)" },
  hypertrophy: { tone: "violet", color: "var(--tf-color-violet)" },
  endurance: { tone: "blue", color: "var(--tf-color-info)" },
  "general-fitness": { tone: "green", color: "var(--tf-color-accent)" },
  conditioning: { tone: "orange", color: "var(--tf-color-warning)" },
};

/** "general-fitness" reads as "General fitness". */
export const categoryName = (key: string) => key.split("-").map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)).join(" ");

export const categoryTone = (key?: string | null): Tone => (key && looks[key]?.tone) || "neutral";

/** The offer type as a colour dot with its name. */
export function CategoryTag({ category }: { category?: string | null }) {
  if (!category) return null;
  return (
    <span className={styles.categoryTag}>
      <i style={{ background: looks[category]?.color ?? "var(--tf-color-text-tertiary)" }} aria-hidden="true" />
      {categoryName(category)}
    </span>
  );
}
