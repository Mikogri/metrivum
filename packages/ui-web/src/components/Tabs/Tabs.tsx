import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps as AriaTabProps,
  type TabsProps as AriaTabsProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import styles from "./Tabs.module.css";

export interface TabsProps extends Omit<AriaTabsProps, "className"> {
  variant?: "underline" | "pill";
  className?: string;
}

export function Tabs({ variant = "underline", className, ...props }: TabsProps) {
  return <AriaTabs {...props} className={cx(styles.tabs, styles[variant], className)} />;
}

export function TabList<T extends object>({ className, children, ...props }: Omit<TabListProps<T>, "className"> & { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);

  // A single indicator slides between tabs, so the change reads as one movement.
  useLayoutEffect(() => {
    const list = ref.current;
    const bar = indicator.current;
    if (!list || !bar) return;
    const update = () => {
      const selected = list.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
      if (!selected) {
        bar.style.opacity = "0";
        return;
      }
      bar.style.opacity = "1";
      bar.style.width = `${selected.offsetWidth}px`;
      bar.style.height = `${selected.offsetHeight}px`;
      bar.style.transform = `translate(${selected.offsetLeft}px, ${selected.offsetTop}px)`;
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(list, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    const resize = new ResizeObserver(update);
    resize.observe(list);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, []);

  return (
    <div className={styles.listWrap}>
      <AriaTabList {...props} ref={ref} className={cx(styles.list, className)}>
        {children}
      </AriaTabList>
      <span ref={indicator} className={styles.indicator} aria-hidden="true" />
    </div>
  );
}

export interface TabProps extends Omit<AriaTabProps, "className" | "children"> {
  children: ReactNode;
  /** Small count rendered after the label, e.g. favourites. */
  count?: number;
  icon?: ReactNode;
}

export function Tab({ children, count, icon, ...props }: TabProps) {
  return (
    <AriaTab {...props} className={styles.tab}>
      {icon ? (
        <span className={styles.tabIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
      {count !== undefined ? <span className={styles.count}>{count}</span> : null}
    </AriaTab>
  );
}

export function TabPanel({ className, ...props }: Omit<TabPanelProps, "className"> & { className?: string }) {
  return <AriaTabPanel {...props} className={cx(styles.panel, className)} />;
}
