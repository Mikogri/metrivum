import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { DataTable, type DataTableProps } from "@trainflow/ui-web";
import type { LibraryView } from "./LibraryViewToggle";
import styles from "./DataView.module.css";

export interface CardSpec {
  /** Where the card leads. The whole card is the link; there is no separate "Open" button. */
  href?: string;
  title: ReactNode;
  /** A short line under the title (username, owner, category). */
  subtitle?: ReactNode;
  /** A small icon tile (or avatar) before the title. */
  icon?: ReactNode;
  tone?: "green" | "blue" | "violet" | "orange" | "rose" | "neutral";
  /** Status or another badge, top right. */
  badge?: ReactNode;
  description?: ReactNode;
  /** Key facts in a small grid (price, mode, counts). Each list picks its own. */
  facts?: Array<{ label: ReactNode; value: ReactNode }>;
  /** Short facts at the bottom of the card. */
  meta?: ReactNode[];
  /** Extra actions; they sit above the card link so they stay clickable on their own. */
  actions?: ReactNode;
  /** For items without a page of their own: the whole card runs this instead (e.g. opens an editor). */
  onOpen?: () => void;
  /** Accessible name for `onOpen`, e.g. "Edit Squat 1RM". */
  openLabel?: string;
}

/**
 * One card in a grid: icon and title (with an optional subtitle) beside the badge, a two-line
 * description, an optional grid of facts, then meta and actions at the foot. With `href`, the title
 * link is stretched over the whole card.
 */
export function ListCard({ href, title, subtitle, icon, tone = "neutral", badge, description, facts, meta, actions, onOpen, openLabel }: CardSpec) {
  const linked = Boolean(href || onOpen);
  const items = meta?.filter(Boolean) ?? [];
  return (
    <li className={styles.item}>
    <article className={styles.card} data-link={linked ? "" : undefined}>
      <div className={styles.head}>
        {icon ? (
          <span className={styles.icon} data-tone={tone} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className={styles.heading}>
          <h3 className={styles.title}>
            {href ? (
              <RouterLink to={href} className={styles.link}>
                {title}
              </RouterLink>
            ) : onOpen ? (
              <button type="button" className={styles.link} aria-label={openLabel} onClick={onOpen}>
                {title}
              </button>
            ) : (
              title
            )}
          </h3>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </div>
      {description ? <p className={styles.description}>{description}</p> : null}
      {facts?.length ? (
        <dl className={styles.facts}>
          {facts.map((fact, i) => (
            <div key={i}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {items.length || actions || linked ? (
        <div className={styles.foot}>
          {items.length ? (
            <span className={styles.meta}>
              {items.map((item, i) => (
                <span key={i}>{item}</span>
              ))}
            </span>
          ) : null}
          {actions ? <span className={styles.actions}>{actions}</span> : null}
          {linked && !actions ? <ArrowUpRight aria-hidden="true" className={styles.arrow} /> : null}
        </div>
      ) : null}
    </article>
    </li>
  );
}

/** The same rows as a table or as cards; `view` comes from the page's list toggle. */
export function DataView<T>({ view, card, ...table }: DataTableProps<T> & { view: LibraryView; card: (row: T) => CardSpec }) {
  if (view === "list") return <DataTable {...table} />;
  return (
    <ul className={styles.grid} aria-label={table.label} data-stale={table.stale || undefined}>
      {table.rows.map((row) => (
        <ListCard key={table.rowKey(row)} {...card(row)} />
      ))}
    </ul>
  );
}

/** The card grid on its own, for pages that build their cards by hand. */
export function CardGrid({ label, stale, children }: { label: string; stale?: boolean; children: ReactNode }) {
  return (
    <ul className={styles.grid} aria-label={label} data-stale={stale || undefined}>
      {children}
    </ul>
  );
}
