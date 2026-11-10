import {
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import styles from "./Link.module.css";

export interface LinkProps extends Omit<AriaLinkProps, "className"> {
  tone?: "default" | "subtle" | "accent";
  /** Underline is useful inside prose; navigation links leave it off. */
  underline?: boolean;
  className?: string;
}

export function Link({
  tone = "default",
  underline = false,
  className,
  ...props
}: LinkProps) {
  return (
    <AriaLink
      {...props}
      className={cx(
        styles.link,
        styles[tone],
        underline && styles.underline,
        className,
      )}
    />
  );
}
