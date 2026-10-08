import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { FormulaUse, Unit } from "@trainflow/api-client-web";
import { Button, Combobox, NumberInput, Option, Spinner } from "@trainflow/ui-web";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useApi } from "~/shared/session/AccountScope";
import { evaluateFormula } from "../../api";
import { useBuiltInFormulas, useFormulaList } from "../../queries";
import { formatQuantity } from "../model/notation";
import styles from "./FormulaPicker.module.css";

/**
 * Binds a load to a built-in or custom formula at a pinned version. The result shown here is
 * computed by the server; the editor never evaluates expressions itself.
 */
export function FormulaPicker({ value, onChange, customAllowed, isDisabled }: { value: FormulaUse; onChange: (value: FormulaUse) => void; customAllowed: boolean; isDisabled: boolean }) {
  const m = useT();
  const t = m.editor.panel;
  const locale = useLocale();
  const api = useApi();
  const builtIns = useBuiltInFormulas();
  const custom = useFormulaList("", 1);
  const [result, setResult] = useState<string | null>(null);
  const evaluate = useMutation({
    mutationFn: () => evaluateFormula(api, value),
    onSuccess: (evaluation) => setResult(formatQuantity(locale, evaluation.result)),
  });

  const selectedKey = value.builtIn ? `builtin:${value.builtIn}` : value.formulaId ? `custom:${value.formulaId}` : null;
  const definition = value.builtIn ? builtIns.data?.find((f) => f.key === value.builtIn)?.definition : undefined;
  const inputs: Record<string, Unit> = definition?.inputs ?? Object.fromEntries(Object.entries(value.inputs).map(([k, q]) => [k, q.unit]));

  return (
    <div className={styles.picker}>
      <Combobox
        label={t.formula}
        size="sm"
        placeholder={m.common.ph.search}
        emptyState={m.common.noResults}
        menuTrigger="focus"
        selectedKey={selectedKey}
        isDisabled={isDisabled}
        onSelectionChange={(key) => {
          if (key === null) return;
          const id = String(key);
          setResult(null);
          if (id.startsWith("builtin:")) {
            const builtIn = builtIns.data?.find((f) => f.key === id.slice(8));
            const defaults = Object.fromEntries(Object.entries(builtIn?.definition.inputs ?? {}).map(([name, unit]) => [name, { value: 0, unit }]));
            onChange({ formulaId: null, builtIn: id.slice(8), version: builtIn?.version ?? 1, inputs: defaults });
          } else {
            const formula = custom.data?.items.find((f) => f.id === id.slice(7));
            onChange({ formulaId: id.slice(7), builtIn: null, version: formula?.version ?? 1, inputs: {} });
          }
        }}
      >
        {[
          ...(builtIns.data ?? []).map((f) => ({ id: `builtin:${f.key}`, label: m.training.formulas.builtInNames[f.key ?? ""] ?? f.key ?? "" })),
          ...(customAllowed ? (custom.data?.items ?? []).filter((f) => !f.archived).map((f) => ({ id: `custom:${f.id}`, label: `${f.name} · v${f.version}` })) : []),
        ].map((option) => (
          <Option key={option.id} id={option.id}>
            {option.label}
          </Option>
        ))}
      </Combobox>
      <p className={styles.version}>{t.formulaVersion(value.version)}</p>
      {Object.keys(inputs).length ? (
        <div className={styles.inputs}>
          <span className={styles.label}>{t.formulaInputs}</span>
          {Object.entries(inputs).map(([name, unit]) => (
            <NumberInput placeholder={m.common.ph.number}
              key={name}
              label={name}
              size="sm"
              unit={m.editor.units[unit] || undefined}
              value={value.inputs[name]?.value ?? NaN}
              isDisabled={isDisabled}
              onChange={(next) => {
                setResult(null);
                onChange({ ...value, inputs: { ...value.inputs, [name]: { value: Number.isNaN(next) ? 0 : next, unit } } });
              }}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.evaluate}>
        <Button size="sm" onPress={() => evaluate.mutate()} isDisabled={!selectedKey} loading={evaluate.isPending}>
          {t.evaluate}
        </Button>
        {evaluate.isPending ? <Spinner size="sm" /> : null}
        {result ? <span className={styles.result}>{t.evaluated(result)}</span> : null}
        {evaluate.error ? <span className={styles.error}>{errorText(m, evaluate.error)}</span> : null}
      </div>
    </div>
  );
}
