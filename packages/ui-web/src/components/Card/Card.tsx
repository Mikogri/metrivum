import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "li";
  padding?: "none" | "sm" | "md" | "lg";
  tone?: "default" | "raised" | "sunken" | "accent";
  /** Hover highlight for cards that contain a full-card link. */
  interactive?: boolean;
  children?: ReactNode;
}

export function Card({
  as: Component = "div",
  padding = "md",
  tone = "default",
  interactive,
  className,
  ...props
}: CardProps) {
  return (
    <Component
      {...props}
      className={cx(
        styles.card,
        styles[`pad-${padding}`],
        styles[tone],
        interactive && styles.interactive,
        className,
      )}
    />
  );
}

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cx(
        styles.separator,
        orientation === "vertical" && styles.vertical,
        className,
      )}
    />
  );
}
