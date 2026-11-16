import { Skeleton } from "@portable-ui/react";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./RouteSkeleton.module.css";

/**
 * Shown while the next page's code loads, so a click answers at once instead of leaving the old
 * page on screen. The editor gets its own shape (toolbar over columns); other pages a header and blocks.
 */
export function RouteSkeleton({ editor }: { editor: boolean }) {
  const m = useT();
  return (
    <div
      className={styles.skeleton}
      data-editor={editor || undefined}
      aria-busy="true"
    >
      <span className="tf-visually-hidden">{m.common.loading}</span>
      {editor ? (
        <>
          <Skeleton height="3.25rem" radius="sm" />
          <div className={styles.columns}>
            <Skeleton height="100%" />
            <Skeleton height="100%" />
            <Skeleton height="100%" />
          </div>
        </>
      ) : (
        <>
          <Skeleton height="2rem" width="40%" />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="10rem" radius="lg" />
          <Skeleton height="16rem" radius="lg" />
        </>
      )}
    </div>
  );
}
