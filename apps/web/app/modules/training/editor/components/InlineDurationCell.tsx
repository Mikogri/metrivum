import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState, type CSSProperties } from "react";
import { Sigma } from "lucide-react";
import { ContextMenu } from "@metrivum/ui-web";
import type { FormulaUse, Quantity } from "@metrivum/api-client-web";
import { formatClock, parseClock } from "../model/workouts";
import { formulaText } from "../model/inline-formula";
import { DurationCell } from "./DurationCell";
import { InlineLoadCell } from "./InlineLoadCell";

/** Literal durations retain the segmented clock; expressions use the shared formula editor. */
export function InlineDurationCell({
  value,
  formula,
  parts = "hms",
  onChange,
  initialText,
  ...props
}: {
  value?: Quantity | null;
  formula?: FormulaUse | null;
  parts?: "hms" | "ms";
  onChange: (formula: FormulaUse | null, value: Quantity | null) => void;
  label: string;
  readOnly: boolean;
  style?: CSSProperties;
  className?: string;
  exerciseId?: string;
  maxReps?: number;
  customAllowed?: boolean;
  formulaAllowed?: boolean;
  maxEffort?: boolean;
  onMaxEffort?: (active: boolean) => void;
  initialText?: string;
  onDone?: () => void;
}) {
  const uiCopy = useUiCopy();

  const [expression, setExpression] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  if (
    props.maxEffort ||
    formula ||
    expression !== null ||
    initialText?.startsWith("=") ||
    initialText?.startsWith("/")
  ) {
    return (
      <InlineLoadCell
        {...props}
        valueKind="time"
        valueUnit={value?.unit ?? formula?.outputUnit ?? "Seconds"}
        prescription={{
          loadFormula: formula,
          load: value ? { minimum: value, maximum: value } : null,
        }}
        initialText={expression ?? initialText}
        onDone={() => {
          setExpression(null);
          props.onDone?.();
        }}
        onChange={(p) =>
          onChange(p.loadFormula ?? null, p.load?.minimum ?? null)
        }
      />
    );
  }
  return (
    <div
      style={{ ...props.style, minWidth: 0, height: "100%" }}
      data-no-drag
      onKeyDownCapture={(event) => {
        if (
          !props.readOnly &&
          (props.formulaAllowed !== false || props.onMaxEffort) &&
          (event.key === "=" || event.key === "/")
        ) {
          event.preventDefault();
          event.stopPropagation();
          setExpression(event.key);
        }
      }}
      onContextMenu={(event) => {
        if (props.readOnly || props.formulaAllowed === false) return;
        event.preventDefault();
        event.stopPropagation();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <DurationCell
        value={formatClock(value)}
        stored={value}
        parts={parts}
        label={props.label}
        readOnly={props.readOnly}
        className={props.className}
        style={{ width: "100%", height: "100%" }}
        onCommit={(text) => {
          const parsed = parseClock(text);
          if (!parsed.ok) return false;
          onChange(null, parsed.value);
          return true;
        }}
      />
      {menu ? (
        <ContextMenu
          {...menu}
          label={props.label}
          items={[
            {
              id: "formula",
              label: uiCopy["training"]["formulas"]["editTitle"],
              icon: <Sigma />,
            },
          ]}
          onClose={() => setMenu(null)}
          onAction={() => setExpression(formulaText(formula) || "=")}
        />
      ) : null}
    </div>
  );
}
