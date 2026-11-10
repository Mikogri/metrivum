import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { ReactNode } from "react";
import { Skeleton } from "@metrivum/ui-web";
import styles from "./Panel.module.css";

/**
 * A titled surface for detail pages: a header row (title, optional hint, actions) over a hairline,
 * then the body. `flush` drops the body padding for tables and lists that run edge to edge.
 */
export type PanelTone =
  "green" | "blue" | "violet" | "orange" | "rose" | "neutral";

export function Panel({
  title,
  description,
  icon,
  tone = "neutral",
  actions,
  children,
  flush = false,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A small tinted icon tile before the title. */
  icon?: ReactNode;
  tone?: PanelTone;
  actions?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
  className?: string;
  id?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      className={[styles.panel, className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
      id={id}
    >
      <header className={styles.head}>
        {icon ? (
          <span className={styles.icon} data-tone={tone} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className={styles.titles}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          {description ? (
            <p className={styles.description}>{description}</p>
          ) : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </header>
      {children !== undefined && children !== null && children !== false ? (
        <div className={styles.body} data-flush={flush || undefined}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export type Fact = { label: ReactNode; value: ReactNode; key?: string };

/** Label / value pairs as quiet rows: the label on the left, the value on the right. */
export function Facts({
  items,
  columns = 1,
}: {
  items: Fact[];
  columns?: 1 | 2;
}) {
  return (
    <dl className={styles.facts} data-columns={columns}>
      {items.map((item, i) => (
        <div
          key={item.key ?? (typeof item.label === "string" ? item.label : i)}
          className={styles.fact}
        >
          <dt>{item.label}</dt>
          <dd>
            {item.value === null ||
            item.value === undefined ||
            item.value === "" ? (
              <span className={styles.empty}>—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type Stat = {
  label: ReactNode;
  value: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger";
  key?: string;
};

/** A row of headline numbers, divided by hairlines. */
export function StatStrip({ items }: { items: Stat[] }) {
  return (
    <dl className={styles.stats}>
      {items.map((item, i) => (
        <div
          key={item.key ?? (typeof item.label === "string" ? item.label : i)}
          className={styles.stat}
          data-tone={
            item.tone && item.tone !== "default" ? item.tone : undefined
          }
        >
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The stat strip's shape while its numbers load. */
export function StatStripSkeleton({
  count = 4,
  labels,
}: {
  count?: number;
  labels?: string[];
}) {
  const uiCopy = useUiCopy();

  const items = labels ?? Array.from({ length: count }, () => "");
  return (
    <div
      className={styles.stats}
      aria-busy="true"
      aria-label={uiCopy["ui"]["Loading"]}
    >
      {items.map((label, i) => (
        <div key={i} className={styles.stat}>
          {label ? (
            <span className={styles.skeletonLabel}>{label}</span>
          ) : (
            <Skeleton width="55%" height="0.75rem" />
          )}
          <Skeleton width={i % 2 ? "40%" : "50%"} height="1.5rem" />
        </div>
      ))}
    </div>
  );
}

/** A panel's shape while it loads: header, then a few lines. */
export function PanelSkeleton({
  title,
  lines = 3,
  children,
}: {
  title: ReactNode;
  lines?: number;
  children?: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-busy="true">
      <header className={styles.head}>
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
        </div>
      </header>
      <div className={styles.body}>
        {children ??
          Array.from({ length: lines }, (_, i) => (
            <Skeleton key={i} width={`${90 - i * 12}%`} height="0.875rem" />
          ))}
      </div>
    </section>
  );
}

/**
 * Grid of panels on a detail page. Panels in a row always share one height; `equal` makes every
 * row as tall as the tallest, so all panels in the grid are the same size.
 */
export function PanelGrid({
  children,
  equal = false,
}: {
  children: ReactNode;
  equal?: boolean;
}) {
  return (
    <div className={styles.grid} data-equal={equal || undefined}>
      {children}
    </div>
  );
}
