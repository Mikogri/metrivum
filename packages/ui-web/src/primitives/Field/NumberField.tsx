import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import {
  Button,
  Group,
  Input,
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { FieldFooter, FieldLabel, fieldStyles as styles, type FieldChromeProps } from "./FieldParts";

export interface NumberFieldProps extends Omit<AriaNumberFieldProps, "className" | "children">, FieldChromeProps {
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  /** Unit shown after the value, e.g. "kg". */
  unit?: ReactNode;
  /** An interactive element at the end of the field instead of a plain unit, e.g. a unit switch. */
  endSlot?: ReactNode;
  showSteppers?: boolean;
  incrementLabel?: string;
  decrementLabel?: string;
  className?: string;
}

/**
 * Locale-aware number input: parsing follows the active locale (2,5 in Polish is 2.5),
 * so pasted values are never silently turned into 25.
 */
export function NumberInput({
  label,
  description,
  errorMessage,
  labelAside,
  placeholder,
  size = "md",
  unit,
  endSlot,
  showSteppers = false,
  incrementLabel = "Increase",
  decrementLabel = "Decrease",
  className,
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField {...props} className={cx(styles.field, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} labelAside={labelAside} />
      <Group className={cx(styles.control, styles[size])}>
        {showSteppers ? (
          <Button slot="decrement" className={styles.stepper} aria-label={decrementLabel}>
            <Minus aria-hidden="true" />
          </Button>
        ) : null}
        <Input className={cx(styles.input, "tf-numeric")} placeholder={placeholder} />
        {unit ? (
          <span className={styles.adornment} aria-hidden="true">
            {unit}
          </span>
        ) : null}
        {endSlot}
        {showSteppers ? (
          <Button slot="increment" className={styles.stepper} aria-label={incrementLabel}>
            <Plus aria-hidden="true" />
          </Button>
        ) : null}
      </Group>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaNumberField>
  );
}
