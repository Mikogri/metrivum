import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
  Link,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
  "aria-label"?: string;
}

export function Breadcrumbs({ items, className, ...props }: BreadcrumbsProps) {
  return (
    <AriaBreadcrumbs
      items={items}
      className={cx(styles.breadcrumbs, className)}
      aria-label={props["aria-label"]}
    >
      {(item) => (
        <AriaBreadcrumb id={item.id} className={styles.crumb}>
          <Link href={item.href} className={styles.link}>
            {item.label}
          </Link>
          <ChevronRight aria-hidden="true" className={styles.separator} />
        </AriaBreadcrumb>
      )}
    </AriaBreadcrumbs>
  );
}
