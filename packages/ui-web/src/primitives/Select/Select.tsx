import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  Button,
  ComboBox as AriaComboBox,
  Group,
  Input,
  ListBox,
  ListBoxItem,
  Select as AriaSelect,
  SelectValue,
  type ComboBoxProps as AriaComboBoxProps,
  type ListBoxItemProps,
  type SelectProps as AriaSelectProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { Popover } from "../../components/Popover/Popover";
import { FieldFooter, FieldLabel, fieldStyles, type FieldChromeProps } from "../Field/FieldParts";
import styles from "./Select.module.css";

export interface SelectProps<T extends object>
  extends Omit<AriaSelectProps<T>, "className" | "children">, FieldChromeProps {
  items?: Iterable<T>;
  children: ReactNode | ((item: T) => ReactNode);
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Select<T extends object>({
  label,
  description,
  errorMessage,
  labelAside,
  items,
  children,
  size = "md",
  className,
  ...props
}: SelectProps<T>) {
  return (
    <AriaSelect {...props} className={cx(fieldStyles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <Button className={cx(fieldStyles.control, fieldStyles[size], styles.trigger)}>
        <SelectValue className={styles.value} />
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </Button>
      <FieldFooter description={description} errorMessage={errorMessage} />
      <Popover width="trigger" asDialog={false} placement="bottom start">
        <ListBox items={items} className={styles.listbox}>
          {children}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}

export interface ComboboxProps<T extends object>
  extends Omit<AriaComboBoxProps<T>, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  children: ReactNode | ((item: T) => ReactNode);
  size?: "sm" | "md" | "lg";
  /** Rendered inside the list when no option matches. */
  emptyState?: ReactNode;
  className?: string;
}

export function Combobox<T extends object>({
  label,
  description,
  errorMessage,
  labelAside,
  placeholder,
  children,
  size = "md",
  emptyState,
  className,
  ...props
}: ComboboxProps<T>) {
  return (
    <AriaComboBox {...props} className={cx(fieldStyles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <Group className={cx(fieldStyles.control, fieldStyles[size])}>
        <Input className={fieldStyles.input} placeholder={placeholder} />
        <Button className={fieldStyles.stepper}>
          <ChevronsUpDown aria-hidden="true" />
        </Button>
      </Group>
      <FieldFooter description={description} errorMessage={errorMessage} />
      <Popover width="trigger" asDialog={false} placement="bottom start">
        <ListBox className={styles.listbox} renderEmptyState={emptyState ? () => <div className={styles.empty}>{emptyState}</div> : undefined}>
          {children}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

export interface OptionProps extends Omit<ListBoxItemProps, "className" | "children"> {
  children: ReactNode;
  description?: ReactNode;
}

export function Option({ children, description, ...props }: OptionProps) {
  const textValue = props.textValue ?? (typeof children === "string" ? children : undefined);
  return (
    <ListBoxItem {...props} textValue={textValue} className={styles.option}>
      {({ isSelected }) => (
        <>
          <span className={styles.optionText}>
            <span>{children}</span>
            {description ? <span className={styles.optionDescription}>{description}</span> : null}
          </span>
          {isSelected ? <Check aria-hidden="true" className={styles.check} /> : null}
        </>
      )}
    </ListBoxItem>
  );
}
