import type { ReactNode } from "react";
import {
  Group,
  Input,
  TextArea as AriaTextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";
import { parseDate } from "@internationalized/date";
import { cx } from "../../lib/cx";
import { DateField } from "./DateField";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";

export interface TextFieldProps extends Omit<AriaTextFieldProps, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  iconStart?: ReactNode;
  /** Trailing element inside the input shell (unit, button). */
  end?: ReactNode;
  className?: string;
}

export function TextField({
  label,
  description,
  errorMessage,
  labelAside,
  placeholder,
  size = "md",
  iconStart,
  end,
  className,
  ...props
}: TextFieldProps) {
  // Dates use the app's own calendar picker instead of the browser's native one, keeping the "yyyy-mm-dd" string API.
  if (props.type === "date") {
    let value = null;
    try { value = props.value ? parseDate(props.value) : null; } catch { /* Invalid external date values render as an empty field. */ }
    return (
      <DateField
        label={label}
        description={description}
        errorMessage={errorMessage}
        labelAside={labelAside}
        size={size}
        className={className}
        aria-label={props["aria-label"]}
        isRequired={props.isRequired}
        isDisabled={props.isDisabled}
        isReadOnly={props.isReadOnly}
        autoFocus={props.autoFocus}
        name={props.name}
        value={value}
        onChange={(date) => props.onChange?.(date ? date.toString() : "")}
      />
    );
  }
  return (
    <AriaTextField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <Group className={cx(styles.control, styles[size])}>
        {iconStart ? (
          <span className={styles.adornment} aria-hidden="true">
            {iconStart}
          </span>
        ) : null}
        <Input className={styles.input} placeholder={placeholder} />
        {end ? <span className={styles.adornment}>{end}</span> : null}
      </Group>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}

export interface TextAreaProps extends Omit<AriaTextFieldProps, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function TextArea({ label, description, errorMessage, labelAside, placeholder, rows = 4, className, ...props }: TextAreaProps) {
  return (
    <AriaTextField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <AriaTextArea className={styles.textarea} placeholder={placeholder} rows={rows} />
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTextField>
  );
}
