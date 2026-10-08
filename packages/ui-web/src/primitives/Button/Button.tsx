import type { ReactNode } from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { Spinner } from "../../components/Spinner/Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface SharedButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. Decorative; the label names the action. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  className?: string;
  children?: ReactNode;
}

export interface ButtonProps extends SharedButtonProps, Omit<AriaButtonProps, "className" | "children"> {
  /** Shows a spinner, keeps the width and announces the pending state. */
  loading?: boolean;
}

function Content({ iconStart, iconEnd, children, loading }: SharedButtonProps & { loading?: boolean }) {
  return (
    <>
      <span className={styles.content} data-hidden={loading || undefined}>
        {iconStart ? <span className={styles.icon} aria-hidden="true">{iconStart}</span> : null}
        {children ? <span className={styles.label}>{children}</span> : null}
        {iconEnd ? <span className={styles.icon} aria-hidden="true">{iconEnd}</span> : null}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <Spinner size="sm" tone="current" />
        </span>
      ) : null}
    </>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  iconStart,
  iconEnd,
  block,
  loading,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      isPending={loading || props.isPending}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
    >
      <Content iconStart={iconStart} iconEnd={iconEnd} loading={loading}>
        {children}
      </Content>
    </AriaButton>
  );
}

export interface LinkButtonProps extends SharedButtonProps, Omit<AriaLinkProps, "className" | "children"> {}

/** Navigation styled as a button. Uses the router configured through RouterProvider. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  iconStart,
  iconEnd,
  block,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <AriaLink
      {...props}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, className)}
    >
      <Content iconStart={iconStart} iconEnd={iconEnd}>
        {children}
      </Content>
    </AriaLink>
  );
}
