import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { DataTable, type DataTableProps } from "@metrivum/ui-web";
import { useLibraryView, type LibraryView } from "./LibraryViewToggle";
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
  /** Colour marks on the card's edge (e.g. the client's groups); the labels are read out and shown as a tooltip. */
  marks?: Array<{ color: string; label: string }>;
  description?: ReactNode;
  /** Key facts in a small grid (price, mode, counts). Each list picks its own. */
  facts?: Array<{ label: ReactNode; value: ReactNode }>;
  /** Short facts at the bottom of the card. */
  meta?: ReactNode[];
  /** Extra actions; they sit above the card link so they stay clickable on their own. */
  actions?: ReactNode;
  /** A "⋯" menu in the top-right corner (above the card link). */
  menu?: ReactNode;
  /** The item's status, at the start of the footer. */
  status?: ReactNode;
  /** Labelled facts shown in the body instead of a description, two to a row. */
  details?: Array<{ label: ReactNode; value: ReactNode }>;
  /** For items without a page of their own: the whole card runs this instead (e.g. opens an editor). */
  onOpen?: () => void;
  /** Accessible name for `onOpen`, e.g. "Edit Squat 1RM". */
  openLabel?: string;
}

/**
 * One card in a grid; every card is the same size. The header is one row centred on the icon:
 * the icon or avatar, the title with its subtitle, and the status. Below it a description of up to
 * two lines, then the footer: details on one line, any actions, and the open arrow in the corner.
 * With `href`, the title link is stretched over the whole card.
 */
export function ListCard({ href, title, subtitle, icon, tone = "neutral", badge, marks, description, facts, meta, actions, menu, status, details, onOpen, openLabel }: CardSpec) {
  const linked = Boolean(href || onOpen);
  const items = meta?.filter(Boolean) ?? [];
  const markNames = marks?.map((mark) => mark.label).join(", ");
  return (
    <li className={styles.item}>
      <article className={styles.card} data-link={linked ? "" : undefined} data-details={details?.length ? "" : undefined}>
        {marks?.length ? (
          <span className={styles.marks} role="img" aria-label={markNames} title={markNames}>
            {marks.map((mark, i) => (
              <i key={i} style={{ background: mark.color }} />
            ))}
          </span>
        ) : null}
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
          {menu ? <span className={styles.menu}>{menu}</span> : null}
        </div>
        {details?.length ? (
          <dl className={styles.details}>{details.map((detail, i) => <div key={i}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
        ) : description ? <p className={styles.description}>{description}</p> : null}
        <div className={styles.foot}>
          {status ? <span className={styles.status}>{status}</span> : null}
          {facts?.length || items.length ? (
            <dl className={styles.facts}>
              {facts?.map((fact, i) => (
                <div key={i}>
                  {fact.label ? <dt>{fact.label}</dt> : null}
                  <dd>{fact.value}</dd>
                </div>
              ))}
              {items.map((item, i) => (
                <div key={`meta-${i}`}>
                  <dd>{item}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
          {linked ? <ArrowUpRight className={styles.arrow} aria-hidden="true" /> : null}
        </div>
      </article>
    </li>
  );
}

/** A quiet text link for a card's actions: no padding, only the text lightens on hover. */
export function CardAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <RouterLink to={href} className={styles.action}>
      {children}
    </RouterLink>
  );
}

/** The same rows as a table or as cards; `view` comes from the page's list toggle. */
export function DataView<T>({ view, card, ...table }: DataTableProps<T> & { view: LibraryView; card: (row: T) => CardSpec }) {
  const presentation = useLibraryView(view);
  if (presentation === "list") return <DataTable {...table} />;
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
