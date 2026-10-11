import { ArrowLeft } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { Button as AriaButton } from "react-aria-components";
import styles from "./PageHeader.module.css";

export interface PageBack {
  label: string;
  onPress: () => void;
}

/**
 * Where "back" leads from the current page. The app shell provides it for detail pages and
 * folders, so every PageHeader shows the same back button without each page wiring it.
 */
export const PageBackContext = createContext<PageBack | null>(null);

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Breadcrumbs or a back link above the title. */
  context?: ReactNode;
  actions?: ReactNode;
  /** Status badges and similar facts. They sit on the right, before the actions, so they never add height. */
  meta?: ReactNode;
  /** Overrides the back button from PageBackContext; `false` hides it. */
  back?: PageBack | false;
  className?: string;
}

export function PageHeader({ title, description, context, actions, meta, back, className }: PageHeaderProps) {
  const fromShell = useContext(PageBackContext);
  const target = back === false ? null : (back ?? fromShell);
  return (
    <header className={cx(styles.header, className)}>
      {context ? <div className={styles.context}>{context}</div> : null}
      <div className={styles.row}>
        <div className={styles.lead} data-back={target ? "" : undefined}>
          <div className={styles.heading}>
            {target ? (
              <AriaButton aria-label={target.label} onPress={target.onPress} className={styles.back}>
                <ArrowLeft aria-hidden="true" />
              </AriaButton>
            ) : null}
            <div className={styles.titles}>
              <h1 className={styles.title}>{title}</h1>
              {description ? <p className={styles.description}>{description}</p> : null}
            </div>
          </div>
        </div>
        {meta || actions ? (
          <div className={styles.side}>
            {meta ? <div className={styles.meta}>{meta}</div> : null}
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
  className?: string;
  id?: string;
}

export function SectionHeader({ title, description, actions, level = 2, className, id }: SectionHeaderProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={cx(styles.section, className)}>
      <div className={styles.titles}>
        <Heading id={id} className={styles.sectionTitle}>
          {title}
        </Heading>
        {description ? <p className={styles.sectionDescription}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export interface ToolbarProps {
  children: ReactNode;
  className?: string;
  "aria-label": string;
}

/** Row of related controls with arrow-key friendly grouping semantics. */
export function Toolbar({ children, className, ...props }: ToolbarProps) {
  return (
    <div role="toolbar" aria-label={props["aria-label"]} className={cx(styles.toolbar, className)}>
      {children}
    </div>
  );
}
