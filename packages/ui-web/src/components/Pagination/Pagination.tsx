import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../../lib/cx";
import { Button } from "../../primitives/Button/Button";
import styles from "./Pagination.module.css";

export interface PaginationLabels {
  previous: string;
  next: string;
  /** e.g. (page, pages) => `Page ${page} of ${pages}` */
  status: (page: number, pageCount: number | null) => string;
  navigation: string;
  /** e.g. (n) => `${n} rows per page`, shown on the left when `pageSize` is set. */
  pageSize?: (size: number) => string;
}

export interface PaginationProps {
  page: number;
  /** Known total pages. `null` when the API returns no total (use `hasNextPage`). */
  pageCount: number | null;
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
  labels: PaginationLabels;
  isDisabled?: boolean;
  /** Rows per page, shown on the left. The bar only appears when there are at least two pages. */
  pageSize?: number;
  className?: string;
}

/** Page controls under the list: rows per page on the left, the pages on the right. */
export function Pagination({
  page,
  pageCount,
  hasNextPage,
  onPageChange,
  labels,
  isDisabled,
  pageSize,
  className,
}: PaginationProps) {
  const canNext = pageCount === null ? Boolean(hasNextPage) : page < pageCount;
  const canPrevious = page > 1;
  if (!canNext && !canPrevious) return null;
  return (
    <nav
      aria-label={labels.navigation}
      className={cx(styles.pagination, className)}
    >
      {pageSize ? (
        <span className={styles.size}>
          {labels.pageSize
            ? labels.pageSize(pageSize)
            : `${pageSize} rows per page`}
        </span>
      ) : null}
      <div className={styles.pages}>
        <Button
          size="sm"
          variant="ghost"
          iconStart={<ChevronLeft />}
          isDisabled={isDisabled || !canPrevious}
          onPress={() => onPageChange(page - 1)}
        >
          {labels.previous}
        </Button>
        <span className={styles.status} aria-live="polite">
          {labels.status(page, pageCount)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          iconEnd={<ChevronRight />}
          isDisabled={isDisabled || !canNext}
          onPress={() => onPageChange(page + 1)}
        >
          {labels.next}
        </Button>
      </div>
    </nav>
  );
}
