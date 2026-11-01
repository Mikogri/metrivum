import { isUnavailableResource } from "~/shared/lib/ResourceError";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormulaDefinition, FormulaListItem, Unit } from "@metrivum/api-client-web";
import { UNITS } from "@metrivum/api-client-web";
import { Alert, Button, Dialog, IconButton, Option, Select, TextField, toast } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { createFormula, updateFormula } from "../api";
import { formulaQueryOptions, trainingKeys } from "../queries";
import { FormulaExpressionInput } from "./FormulaExpressionInput";
import { useClientFormulaContext } from "../editor/client-context";
import { CLIENT_VARIABLE_UNITS } from "../editor/model/inline-formula";
import { FormulaHelp } from "./FormulaHelp";
import styles from "../routes/formulas.module.css";
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,79}$/;
export function FormulaDialog({ formula, onClose }: { formula: FormulaListItem | "new" | null; onClose: () => void }) {
  const m = useT();
  const t = m.training.formulas;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const client = useClientFormulaContext();
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("");
  const [inputs, setInputs] = useState<Array<{ name: string; unit: Unit }>>([]);
  const [outputUnit, setOutputUnit] = useState<Unit>("Kg");
  const [version, setVersion] = useState(0);
  const existing = formula !== "new" ? formula : null;
  const full = useQuery({ ...formulaQueryOptions(api, a, existing ?? { id: "", version: 0 }), enabled: Boolean(existing) });
  const loading = Boolean(existing) && full.isPending;
  const loadError = existing ? full.error : null;
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (formula === "new") {
      initialized.current = true;
      setName("");
      setExpression("");
      setInputs([{ name: "base", unit: "Kg" }]);
      setOutputUnit("Kg");
      setVersion(0);
    } else if (formula && full.data) {
      initialized.current = true;
      const { data, version: v } = full.data;
      setName(data.name);
      setExpression(data.definition.expression);
      setInputs(Object.entries(data.definition.inputs).map(([n, unit]) => ({ name: n, unit })));
      setOutputUnit(data.definition.outputUnit);
      setVersion(v);
    }
  }, [formula, full.data]);

  const definition: FormulaDefinition = { expression: expression.trim().replace(/^=/, ""), inputs: Object.fromEntries(inputs.map((i) => [i.name.trim(), i.unit])), outputUnit };
  const invalidNames = inputs.some((i) => !NAME_PATTERN.test(i.name.trim())) || new Set(inputs.map((i) => i.name.trim())).size !== inputs.length;
  const save = useMutation({
    mutationFn: () => (formula === "new" ? createFormula(api, { name: name.trim(), definition }) : updateFormula(api, (formula as FormulaListItem).id, { name: name.trim(), definition }, version)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.formulas(a) });
      toast({ tone: "success", title: formula === "new" ? t.created : t.updated });
      onClose();
    },
  });

  return (
    <Dialog
      isOpen={formula !== null}
      placement="right"
      onOpenChange={(open) => !open && onClose()}
      title={formula === "new" ? t.createTitle : t.editTitle}
      description={formula === "new" ? undefined : t.editNote}
      size="lg"
      closeLabel={m.common.close}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close}>
            {m.common.cancel}
          </Button>
          <Button variant="primary" loading={save.isPending} isDisabled={loading || Boolean(loadError) || !name.trim() || !expression.trim() || invalidNames} onPress={() => save.mutate()}>
            {m.common.save}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {loadError ? <Alert tone="danger" title={isUnavailableResource(loadError) ? m.errors.byCode.RESOURCE_NOT_FOUND! : errorText(m, loadError)} /> : null}
        {save.error ? <Alert tone="danger" title={errorText(m, save.error)}>{(save.error as { problem?: { detail?: string } }).problem?.detail}</Alert> : null}
        <TextField placeholder={m.common.ph.formulaName} label={t.name} value={name} onChange={setName} isRequired autoFocus maxLength={200} />
        <FormulaExpressionInput label={t.expression} placeholder={m.common.ph.expression} value={expression} onChange={(value) => {
          setExpression(value);
          const used = new Set(value.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
          setInputs((current) => [...current, ...Object.entries({ ...Object.fromEntries(Object.entries(CLIENT_VARIABLE_UNITS).map(([name, unit]) => [name, { unit }])), ...client.variables }).filter(([alias]) => used.has(alias) && !current.some((input) => input.name === alias)).map(([alias, quantity]) => ({ name: alias, unit: quantity.unit }))]);
        }} inputNames={[...new Set([...inputs.map((input) => input.name), ...Object.keys(client.variables), ...Object.keys(CLIENT_VARIABLE_UNITS)])]} isRequired description={`base * percentage / 100 · ${t.help.hint}`} />
        <FormulaHelp />
        <fieldset className={styles.inputs}>
          <legend className={styles.legend}>{t.inputs}</legend>
          {inputs.map((input, index) => (
            <div key={index} className={styles.inputRow}>
              <TextField placeholder={m.common.ph.inputName}
                label={t.inputName}
                size="sm"
                value={input.name}
                isInvalid={!NAME_PATTERN.test(input.name.trim())}
                onChange={(value) => setInputs((list) => list.map((item, i) => (i === index ? { ...item, name: value } : item)))}
              />
              <Select label={t.inputUnit} size="sm" selectedKey={input.unit} onSelectionChange={(key) => setInputs((list) => list.map((item, i) => (i === index ? { ...item, unit: key as Unit } : item)))}>
                {UNITS.map((unit) => (
                  <Option key={unit} id={unit}>
                    {m.editor.units[unit] || unit}
                  </Option>
                ))}
              </Select>
              <IconButton label={t.removeInput(input.name)} icon={<Trash2 />} variant="danger" size="sm" onPress={() => setInputs((list) => list.filter((_, i) => i !== index))} />
            </div>
          ))}
          <Button size="sm" variant="ghost" iconStart={<Plus />} onPress={() => setInputs((list) => [...list, { name: `input${list.length + 1}`, unit: "Scalar" }])}>
            {t.addInput}
          </Button>
        </fieldset>
        <Select label={t.outputUnit} selectedKey={outputUnit} onSelectionChange={(key) => setOutputUnit(key as Unit)} className={styles.narrow}>
          {UNITS.map((unit) => (
            <Option key={unit} id={unit}>
              {m.editor.units[unit] || unit}
            </Option>
          ))}
        </Select>
      </div>
    </Dialog>
  );
}

