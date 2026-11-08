import type { CSSProperties } from "react";
import type { Prescription, Quantity } from "@metrivum/api-client-web";
import { formatReps } from "../model/notation";
import { InlineDurationCell } from "./InlineDurationCell";
import { InlineLoadCell } from "./InlineLoadCell";

export type FormulaField = "Sets" | "Reps" | "WorkTime" | "Rest";
/** Adapts field storage to the shared expression editor; no mass units leak into count/time cells. */
export function InlinePrescriptionCell({ field, prescription, count, onChange, maximum = false, onMaximumChange, ...props }: {
  field: FormulaField; prescription: Prescription; count?: number;
  onChange: (formula: NonNullable<Prescription["fieldFormulas"]>[string] | null, value: Quantity | null, maximum?: number) => void;
  maximum?: boolean; onMaximumChange?: (active: boolean) => void;
  initialText?: string; onDone?: () => void; label: string; readOnly: boolean; exerciseId?: string; style?: CSSProperties; className?: string; formulaAllowed?: boolean; customAllowed?: boolean;
}) {
  const time = field === "WorkTime" || field === "Rest";
  const literal = field === "Sets" ? count == null ? null : { value: count, unit: "Scalar" as const }
    : field === "Reps" ? prescription.reps ? { value: prescription.reps.minimum, unit: "Scalar" as const } : null
    : field === "WorkTime" ? prescription.workTime : prescription.rest;
  if (time) return <InlineDurationCell {...props} maxEffort={field === "WorkTime" && prescription.workTimeMax === true} onMaxEffort={field === "WorkTime" ? onMaximumChange : undefined} parts={field === "Rest" ? "ms" : "hms"} value={literal} formula={prescription.fieldFormulas?.[field]} onChange={onChange} />;
  return <InlineLoadCell {...props} maxEffort={maximum} onMaxEffort={field === "Reps" ? onMaximumChange : undefined} valueKind={time ? "time" : "scalar"} valueUnit={literal?.unit ?? prescription.fieldFormulas?.[field]?.outputUnit ?? (time ? "Seconds" : "Scalar")}
    constraints={time ? { min: 0, max: 86400 } : { min: 1, max: field === "Sets" ? 50 : 10000, integer: true }} allowRange={field === "Reps"}
    prescription={{ loadFormula: prescription.fieldFormulas?.[field], load: literal ? { minimum: literal, maximum: field === "Reps" && prescription.reps ? { ...literal, value: prescription.reps.maximum } : literal } : null }}
    fallbackValue={field === "Reps" && !prescription.fieldFormulas?.Reps ? formatReps(prescription.reps) : undefined}
    onUnitChange={unit => {
      if (!literal) return;
      const value = { value: literal.value * (literal.unit === "Minutes" ? 60 : 1) / (unit === "Minutes" ? 60 : 1), unit };
      onChange(prescription.fieldFormulas?.[field] ?? null, value);
    }}
    onChange={value => onChange(value.loadFormula ?? null, value.load?.minimum ?? null, value.load?.maximum.value)} />;
}
