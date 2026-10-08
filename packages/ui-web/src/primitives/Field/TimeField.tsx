import { DateInput, DateSegment, TimeField as AriaTimeField, type TimeFieldProps as AriaTimeFieldProps, type TimeValue } from "react-aria-components";
import { cx } from "../../lib/cx";
import local from "./DateField.module.css";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";

export interface TimeFieldProps<T extends TimeValue> extends Omit<AriaTimeFieldProps<T>, "className" | "children">, FieldChromeProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Segmented, locale-aware time input (hours and minutes by default). */
export function TimeField<T extends TimeValue>({ label, description, errorMessage, labelAside, size = "md", className, ...props }: TimeFieldProps<T>) {
  return (
    <AriaTimeField shouldForceLeadingZeros {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <DateInput className={cx(styles.control, styles[size], local.input)}>
        {(segment) => <DateSegment segment={segment} className={local.segment} />}
      </DateInput>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaTimeField>
  );
}
