import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useQuery } from "@tanstack/react-query";
import type { FormulaUse, Unit } from "@metrivum/api-client-web";
import {
  Combobox,
  NumberInput,
  Option,
  Select,
  Spinner,
} from "@metrivum/ui-web";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useApi } from "~/shared/session/AccountScope";
import { getFormula } from "../../api";
import { useBuiltInFormulas, useFormulaList } from "../../queries";
import {
  withClientVariables,
  type InlineFormulaUse,
} from "../model/inline-formula";
import { useFormulaEvaluation } from "./useFormulaEvaluation";
import { useClientFormulaContext } from "../client-context";
import { useAccountKey } from "~/shared/session/AccountScope";
import { formatQuantity } from "../model/notation";
import styles from "./FormulaPicker.module.css";

/**
 * Binds a load to a built-in or custom formula at a pinned version. The result shown here is
 * computed by the server; the editor never evaluates expressions itself.
 */
export function FormulaPicker({
  value,
  onChange,
  customAllowed,
  isDisabled,
}: {
  value: FormulaUse;
  onChange: (value: FormulaUse) => void;
  customAllowed: boolean;
  isDisabled: boolean;
}) {
  const m = useT();
  const t = m.editor.panel;
  const locale = useLocale();
  const api = useApi();
  const builtIns = useBuiltInFormulas();
  const custom = useFormulaList("", 1);
  const account = useAccountKey();
  const context = useClientFormulaContext();
  const resolved = withClientVariables(
    value,
    context.variables,
    Boolean(context.relationshipId) ||
      Object.keys(context.variables).length > 0,
  );
  const evaluation = useFormulaEvaluation(resolved);
  const result = evaluation.data
    ? formatQuantity(locale, evaluation.data.result)
    : null;
  const full = useQuery({
    queryKey: [
      account,
      "training",
      "formula-definition",
      value.formulaId,
      value.version,
    ],
    queryFn: ({ signal }) =>
      getFormula(api, value.formulaId!, value.version, signal),
    enabled: Boolean(value.formulaId),
    staleTime: 300_000,
  });

  const selectedKey = value.builtIn
    ? `builtin:${value.builtIn}`
    : value.formulaId
      ? `custom:${value.formulaId}`
      : null;
  const definition = value.builtIn
    ? builtIns.data?.find((f) => f.key === value.builtIn)?.definition
    : full.data?.data.definition;
  const inputs: Record<string, Unit> =
    definition?.inputs ??
    Object.fromEntries(
      Object.entries(value.inputs).map(([k, q]) => [k, q.unit]),
    );

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
          if (id.startsWith("builtin:")) {
            const builtIn = builtIns.data?.find((f) => f.key === id.slice(8));
            const defaults = Object.fromEntries(
              Object.keys(builtIn?.definition.inputs ?? {})
                .filter((name) => context.variables[name])
                .map((name) => [name, context.variables[name]!]),
            );
            onChange({
              formulaId: null,
              builtIn: id.slice(8),
              version: builtIn?.version ?? 1,
              inputs: defaults,
            });
          } else {
            const formula = custom.data?.items.find(
              (f) => f.id === id.slice(7),
            );
            onChange({
              formulaId: id.slice(7),
              builtIn: null,
              version: formula?.version ?? 1,
              inputs: {},
            });
          }
        }}
      >
        {[
          ...(builtIns.data ?? []).map((f) => ({
            id: `builtin:${f.key}`,
            label: m.training.formulas.builtInNames[f.key ?? ""] ?? f.key ?? "",
          })),
          ...(customAllowed
            ? (custom.data?.items ?? [])
                .filter((f) => !f.archived)
                .map((f) => ({
                  id: `custom:${f.id}`,
                  label: `${f.name} · v${f.version}`,
                }))
            : []),
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
            <div key={name}>
              <Select
                label={formatInterfaceText(m["ui"]["{0} source"], [name])}
                size="sm"
                selectedKey={
                  (value as InlineFormulaUse).variableBindings?.[name] ??
                  "manual"
                }
                isDisabled={isDisabled}
                onSelectionChange={(key) => {
                  const variableBindings = {
                    ...(value as InlineFormulaUse).variableBindings,
                  };
                  const nextInputs = { ...value.inputs };
                  if (key === "manual") {
                    delete variableBindings[name];
                    delete nextInputs[name];
                  } else if (key && context.variables[String(key)]) {
                    variableBindings[name] = String(key);
                    nextInputs[name] = context.variables[String(key)]!;
                  }
                  const next: InlineFormulaUse = {
                    ...value,
                    inputs: nextInputs,
                    variableBindings,
                  };
                  onChange(next);
                }}
              >
                <Option id="manual">
                  {locale === "pl" ? "Wartość własna" : "Manual value"}
                </Option>
                {Object.entries(context.variables)
                  .filter(([, quantity]) => quantity.unit === unit)
                  .map(([alias]) => (
                    <Option key={alias} id={alias}>
                      {alias}
                    </Option>
                  ))}
              </Select>
              <NumberInput
                placeholder={m.common.ph.number}
                label={name}
                size="sm"
                unit={m.editor.units[unit] || undefined}
                value={resolved?.inputs[name]?.value ?? NaN}
                isDisabled={
                  isDisabled ||
                  Boolean((value as InlineFormulaUse).variableBindings?.[name])
                }
                onChange={(next) => {
                  const nextInputs = { ...value.inputs };
                  if (Number.isNaN(next)) delete nextInputs[name];
                  else nextInputs[name] = { value: next, unit };
                  onChange({ ...value, inputs: nextInputs });
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.evaluate}>
        {evaluation.isFetching ? <Spinner size="sm" /> : null}
        {result ? (
          <span className={styles.result}>{t.evaluated(result)}</span>
        ) : null}
        {evaluation.error ? (
          <span className={styles.error}>{errorText(m, evaluation.error)}</span>
        ) : null}
      </div>
    </div>
  );
}
