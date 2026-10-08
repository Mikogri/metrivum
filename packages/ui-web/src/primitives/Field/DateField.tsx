import type { DateValue } from "@internationalized/date";
import { DateField as AriaDateField, DateInput, DateSegment, type DateFieldProps as AriaDateFieldProps } from "react-aria-components";
import { cx } from "../../lib/cx";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";
import local from "./DateField.module.css";

export interface DateFieldProps<T extends DateValue> extends Omit<AriaDateFieldProps<T>, "className" | "children">, FieldChromeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Segmented, locale-aware date input (keyboard friendly, no popup calendar). */
export function DateField<T extends DateValue>({ label, description, errorMessage, labelAside, size = "md", className, ...props }: DateFieldProps<T>) {
  return (
    <AriaDateField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <DateInput className={cx(styles.control, styles[size], local.input)}>
        {(segment) => <DateSegment segment={segment} className={local.segment} />}
      </DateInput>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaDateField>
  );
}
