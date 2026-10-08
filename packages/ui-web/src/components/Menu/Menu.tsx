import type { ReactNode } from "react";
import {
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Separator,
  Keyboard,
  Text,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { Popover } from "../Popover/Popover";
import styles from "./Menu.module.css";

export { MenuTrigger as DropdownMenuTrigger };

export interface DropdownMenuProps<T> extends Omit<AriaMenuProps<T>, "className"> {
  placement?: "bottom start" | "bottom end" | "top start" | "top end";
  className?: string;
}

/** Popover menu. Place inside `DropdownMenuTrigger` after the trigger button. */
export function DropdownMenu<T extends object>({ placement = "bottom end", className, ...props }: DropdownMenuProps<T>) {
  return (
    <Popover placement={placement} asDialog={false}>
      <AriaMenu {...props} className={cx(styles.menu, className)} />
    </Popover>
  );
}

export interface DropdownMenuItemProps extends Omit<AriaMenuItemProps, "className" | "children"> {
  icon?: ReactNode;
  shortcut?: string;
  description?: string;
  tone?: "default" | "danger";
  children: ReactNode;
}

export function DropdownMenuItem({ icon, shortcut, description, tone = "default", children, ...props }: DropdownMenuItemProps) {
  const textValue = props.textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <AriaMenuItem {...props} textValue={textValue} className={cx(styles.item, tone === "danger" && styles.danger)}>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.text}>
        <Text slot="label">{children}</Text>
        {description ? (
          <Text slot="description" className={styles.description}>
            {description}
          </Text>
        ) : null}
      </span>
      {shortcut ? <Keyboard className={styles.shortcut}>{shortcut}</Keyboard> : null}
    </AriaMenuItem>
  );
}

export function DropdownMenuSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <AriaMenuSection className={styles.section}>
      {title ? <Header className={styles.sectionHeader}>{title}</Header> : null}
      {children}
    </AriaMenuSection>
  );
}

export function DropdownMenuSeparator() {
  return <Separator className={styles.separator} />;
}
