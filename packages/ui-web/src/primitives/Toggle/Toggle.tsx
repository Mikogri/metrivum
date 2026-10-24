import type { ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import {
  Checkbox as AriaCheckbox,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
  Switch as AriaSwitch,
  ToggleButton,
  ToggleButtonGroup,
  type CheckboxProps as AriaCheckboxProps,
  type RadioGroupProps as AriaRadioGroupProps,
  type RadioProps as AriaRadioProps,
  type SwitchProps as AriaSwitchProps,
  type ToggleButtonGroupProps,
  type ToggleButtonProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { FieldFooter, FieldLabel, type FieldChromeProps } from "../Field/FieldParts";
import styles from "./Toggle.module.css";

export interface CheckboxProps extends Omit<AriaCheckboxProps, "className" | "children"> {
  children?: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function Checkbox({ children, description, className, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className={cx(styles.choice, className)}>
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className={styles.box} aria-hidden="true">
            {isIndeterminate ? <Minus /> : isSelected ? <Check /> : null}
          </span>
          {children || description ? (
            <span className={styles.choiceText}>
              {children ? <span>{children}</span> : null}
              {description ? <span className={styles.choiceDescription}>{description}</span> : null}
            </span>
          ) : null}
        </>
      )}
    </AriaCheckbox>
  );
}

export interface RadioGroupProps extends Omit<AriaRadioGroupProps, "className" | "children">, FieldChromeProps {
  children: ReactNode;
  className?: string;
}

export function RadioGroup({ label, description, errorMessage, children, className, ...props }: RadioGroupProps) {
  return (
    <AriaRadioGroup {...props} className={cx(styles.group, className)}>
      <FieldLabel label={label} isRequired={props.isRequired} />
      <div className={styles.groupItems}>{children}</div>
      <FieldFooter description={description} errorMessage={errorMessage} />
    </AriaRadioGroup>
  );
}

export interface RadioProps extends Omit<AriaRadioProps, "className" | "children"> {
  children: ReactNode;
  description?: ReactNode;
}

export function Radio({ children, description, ...props }: RadioProps) {
  return (
    <AriaRadio {...props} className={styles.choice}>
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.choiceText}>
        <span>{children}</span>
        {description ? <span className={styles.choiceDescription}>{description}</span> : null}
      </span>
    </AriaRadio>
  );
}

export interface SwitchProps extends Omit<AriaSwitchProps, "className" | "children"> {
  children?: ReactNode;
  className?: string;
}

export function Switch({ children, className, ...props }: SwitchProps) {
  return (
    <AriaSwitch {...props} className={cx(styles.switch, className)}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {children ? <span className={styles.switchLabel}>{children}</span> : null}
    </AriaSwitch>
  );
}

export interface SegmentedControlProps extends Omit<ToggleButtonGroupProps, "className" | "children" | "selectionMode"> {
  children: ReactNode;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

/** Single-choice toggle row (view modes, rating scales, filters). */
export function SegmentedControl({ children, size = "md", className, ...props }: SegmentedControlProps) {
  return (
    <ToggleButtonGroup
      {...props}
      selectionMode="single"
      disallowEmptySelection
      className={cx(styles.segmented, styles[`segmented-${size}`], className)}
    >
      {children}
    </ToggleButtonGroup>
  );
}

export interface SegmentProps extends Omit<ToggleButtonProps, "className" | "children"> {
  children: ReactNode;
}

export function Segment({ children, ...props }: SegmentProps) {
  return (
    <ToggleButton {...props} className={styles.segment}>
      {children}
    </ToggleButton>
  );
}

export interface ChipGroupProps extends Omit<ToggleButtonGroupProps, "className" | "children" | "selectionMode"> {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  /** `single` (default): one choice. `multiple`: any number of chips, e.g. weekdays or equipment. */
  selectionMode?: "single" | "multiple";
}

/**
 * A wrapping row of pill toggles (quick picks, filters). With one choice, unlike SegmentedControl, choosing the
 * selected chip again clears it, unless `disallowEmptySelection` is set.
 */
export function ChipGroup({ children, className, selectionMode = "single", ...props }: ChipGroupProps) {
  return (
    <ToggleButtonGroup {...props} selectionMode={selectionMode} className={cx(styles.chips, className)}>
      {children}
    </ToggleButtonGroup>
  );
}

export interface ChipProps extends Omit<ToggleButtonProps, "className" | "children"> {
  children: ReactNode;
}

export function Chip({ children, ...props }: ChipProps) {
  return (
    <ToggleButton {...props} className={styles.chip}>
      {children}
    </ToggleButton>
  );
}
