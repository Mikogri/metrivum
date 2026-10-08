import type { ReactNode } from "react";
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "../../lib/cx";
import { Tooltip, TooltipTrigger } from "../../components/Tooltip/Tooltip";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends Omit<AriaButtonProps, "className" | "children" | "aria-label"> {
  /** Required accessible name. Also used as the tooltip text. */
  label: string;
  icon: ReactNode;
  variant?: "ghost" | "secondary" | "danger";
  size?: "sm" | "md";
  /** Show the label as a tooltip on hover/focus. */
  showTooltip?: boolean;
  className?: string;
}

export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  showTooltip = true,
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <AriaButton {...props} aria-label={label} className={cx(styles.iconButton, styles[variant], styles[size], className)}>
      <span aria-hidden="true" className={styles.glyph}>
        {icon}
      </span>
    </AriaButton>
  );
  if (!showTooltip) return button;
  return (
    <TooltipTrigger>
      {button}
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  );
}
