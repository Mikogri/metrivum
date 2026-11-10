import {
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import { useLocale } from "react-aria-components";
import { Minus, Plus } from "lucide-react";
import {
  Button,
  Group,
  Input,
  NumberField as AriaNumberField,
  type NumberFieldProps as AriaNumberFieldProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import {
  FieldFooter,
  FieldLabel,
  fieldStyles as styles,
  type FieldChromeProps,
} from "./FieldParts";

export interface NumberFieldProps
  extends
    Omit<AriaNumberFieldProps, "className" | "children">,
    FieldChromeProps {
  /** Opt-in decimal editing; comma and point are accepted in every locale. */
  decimalScale?: number;
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
  decimalScale,
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
  const { locale } = useLocale();
  return (
    <AriaNumberField
      {...(decimalScale == null
        ? {}
        : {
            step: 10 ** -decimalScale,
            formatOptions: { maximumFractionDigits: decimalScale },
          })}
      {...props}
      className={cx(styles.field, className)}
    >
      <FieldLabel
        label={label}
        isRequired={props.isRequired}
        labelAside={labelAside}
      />
      <Group className={cx(styles.control, styles[size])}>
        {showSteppers ? (
          <Button
            slot="decrement"
            className={styles.stepper}
            aria-label={decrementLabel}
          >
            <Minus aria-hidden="true" />
          </Button>
        ) : null}
        <Input
          className={cx(styles.input, "tf-numeric")}
          placeholder={placeholder}
          onChangeCapture={
            decimalScale == null
              ? undefined
              : (event) => {
                  // Normalize before React Aria parses the input using the active locale.
                  const input = event.currentTarget;
                  const separator = new Intl.NumberFormat(locale)
                    .format(1.1)
                    .includes(",")
                    ? ","
                    : ".";
                  input.value = input.value.replace(/[.,]/g, separator);
                }
          }
        />
        {unit ? (
          <span className={styles.adornment} aria-hidden="true">
            {unit}
          </span>
        ) : null}
        {endSlot}
        {showSteppers ? (
          <Button
            slot="increment"
            className={styles.stepper}
            aria-label={incrementLabel}
          >
            <Plus aria-hidden="true" />
          </Button>
        ) : null}
      </Group>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaNumberField>
  );
}

/** Preserves an in-progress decimal separator while numeric consumers receive a canonical point. */
export function DecimalInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string | number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft ?? value}
      onChange={(event) => {
        const text = event.target.value;
        if (text && !/^\d*(?:[.,]\d{0,2})?$/.test(text)) return;
        setDraft(text);
        event.target.value = text.replace(",", ".");
        onChange(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        props.onBlur?.(event);
      }}
    />
  );
}
