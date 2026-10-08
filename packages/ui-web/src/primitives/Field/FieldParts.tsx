import type { ReactNode } from "react";
import { FieldError, Label, Text, type ValidationResult } from "react-aria-components";
import styles from "./Field.module.css";

export interface FieldChromeProps {
  label?: ReactNode;
  description?: ReactNode;
  errorMessage?: string | ((validation: ValidationResult) => string);
  isRequired?: boolean;
  /** Extra element next to the label (e.g. counter or help link). */
  labelAside?: ReactNode;
}

export function FieldLabel({ label, isRequired, labelAside }: Pick<FieldChromeProps, "label" | "isRequired" | "labelAside">) {
  if (!label && !labelAside) return null;
  return (
    <div className={styles.labelRow}>
      {label ? (
        <Label className={styles.label}>
          {label}
          {isRequired ? (
            <span className={styles.required} aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
      ) : (
        <span />
      )}
      {labelAside}
    </div>
  );
}

export function FieldFooter({ description, errorMessage }: Pick<FieldChromeProps, "description" | "errorMessage">) {
  return (
    <>
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
    </>
  );
}

export { styles as fieldStyles };
