import { Dialog, Popover as AriaPopover, type PopoverProps as AriaPopoverProps } from "react-aria-components";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Popover.module.css";

export interface PopoverProps extends Omit<AriaPopoverProps, "className" | "children"> {
  children: ReactNode;
  className?: string;
  /** Wraps content in a non-modal dialog; disable for menus/listboxes that manage focus themselves. */
  asDialog?: boolean;
  "aria-label"?: string;
  width?: "trigger" | "auto" | "sm" | "md" | "lg";
}

export function Popover({ children, className, asDialog = true, width = "auto", offset = 6, ...props }: PopoverProps) {
  return (
    <AriaPopover {...props} offset={offset} className={cx(styles.popover, styles[`width-${width}`], className)}>
      {asDialog ? (
        <Dialog className={styles.dialog} aria-label={props["aria-label"]}>
          {children}
        </Dialog>
      ) : (
        children
      )}
    </AriaPopover>
  );
}
