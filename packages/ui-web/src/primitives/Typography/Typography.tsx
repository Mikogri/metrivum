import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { Heading as AriaHeading, Label as AriaLabel, type LabelProps } from "react-aria-components";
import { cx } from "../../lib/cx";
import styles from "./Typography.module.css";

type TextTone = "default" | "secondary" | "tertiary" | "accent" | "danger" | "warning";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  size?: "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
  tone?: TextTone;
  weight?: "regular" | "medium" | "semibold";
  numeric?: boolean;
  truncate?: boolean;
  children?: ReactNode;
}

export function Text({
  as: Component = "p",
  size = "md",
  tone = "default",
  weight = "regular",
  numeric,
  truncate,
  className,
  ...props
}: TextProps) {
  return (
    <Component
      {...props}
      className={cx(
        styles.text,
        styles[`size-${size}`],
        styles[`tone-${tone}`],
        styles[`weight-${weight}`],
        numeric && styles.numeric,
        truncate && styles.truncate,
        className,
      )}
    />
  );
}

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Visual size, independent of the document outline level. */
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "display" | "hero";
  /** Display type uses the brand face; app type stays in the UI face. */
  family?: "ui" | "display";
  children?: ReactNode;
}

export function Heading({ level = 2, size = "md", family = "ui", className, ...props }: HeadingProps) {
  return (
    <AriaHeading
      level={level}
      {...props}
      className={cx(styles.heading, styles[`heading-${size}`], family === "display" && styles.display, className)}
    />
  );
}

export function Label({ className, ...props }: LabelProps) {
  return <AriaLabel {...props} className={cx(styles.label, className)} />;
}

export function Caption({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx(styles.caption, className)} />;
}
