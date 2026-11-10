import {
  Focusable,
  OverlayArrow,
  Tooltip as AriaTooltip,
  TooltipTrigger as AriaTooltipTrigger,
  type TooltipProps as AriaTooltipProps,
  type TooltipTriggerComponentProps,
} from "react-aria-components";
import type { ReactElement, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Tooltip.module.css";

export function TooltipTrigger({
  delay = 500,
  closeDelay = 80,
  ...props
}: TooltipTriggerComponentProps) {
  // React Aria warms up after the first tooltip: neighbours open instantly.
  return (
    <AriaTooltipTrigger delay={delay} closeDelay={closeDelay} {...props} />
  );
}

export interface TooltipProps extends Omit<
  AriaTooltipProps,
  "className" | "children"
> {
  children: ReactNode;
  className?: string;
}

export function Tooltip({
  children,
  className,
  offset = 8,
  ...props
}: TooltipProps) {
  return (
    <AriaTooltip
      {...props}
      offset={offset}
      className={cx(styles.tooltip, className)}
    >
      <OverlayArrow className={styles.arrow}>
        <svg width={8} height={8} viewBox="0 0 8 8">
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      {children}
    </AriaTooltip>
  );
}

/**
 * A tooltip for any focusable element (a link, a plain button): `<Hint label="Clients"><a … /></Hint>`.
 * Use it instead of the browser's `title`. With `disabled` the child renders untouched.
 */
export function Hint({
  label,
  placement = "top",
  delay,
  disabled,
  children,
}: {
  label: ReactNode;
  placement?: TooltipProps["placement"];
  delay?: number;
  disabled?: boolean;
  children: ReactElement;
}) {
  if (disabled || !label) return children;
  return (
    <TooltipTrigger delay={delay}>
      <Focusable>{children as never}</Focusable>
      <Tooltip placement={placement}>{label}</Tooltip>
    </TooltipTrigger>
  );
}
