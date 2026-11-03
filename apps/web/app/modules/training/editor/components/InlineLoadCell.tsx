import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { X, Save, Trash2, Variable, Undo2, Maximize2, CircleAlert, CircleCheck } from "lucide-react";
import { Select, Option, Dialog, overlayPosition, overlayViewport } from "@metrivum/ui-web";
import { useCellValidation } from "../cell-validation";
import { useEffect, useLayoutEffect, useEffectEvent, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Prescription, Quantity, Unit } from "@metrivum/api-client-web";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { ApiError } from "~/shared/http/errors";
import { errorText } from "~/shared/lib/errorText";
import { useAccountContext } from "~/shared/session/AccountScope";
import { storedFormula } from "../../formula-values";
import { getFormula } from "../../api";
import { useBuiltInFormulas, useFormulaList } from "../../queries";
import { FORMULA_FUNCTIONS, functionLabel, FormulaExpressionInput } from "../../components/FormulaExpressionInput";
import { useClientFormulaContext } from "../client-context";
import { convertMass, unqualified, formulaText, exerciseBinding, exerciseMaxAlias, clientVariableSource, CLIENT_VARIABLE_UNITS, librarySearch, withClientVariables, type InlineFormulaUse } from "../model/inline-formula";
import { editText, formatLoad, formatQuantity, parseEffort, parseLoad, parseDuration, parseReps } from "../model/notation";
import { useFormulaEvaluation } from "./useFormulaEvaluation";
import { FormulaMark } from "../../components/FormulaMark";
import styles from "./InlineLoadCell.module.css";

type Props = {
  exerciseId?: string;
  maxReps?: number;
  valueKind?: "mass" | "scalar" | "time";
  valueUnit?: Unit;
  onUnitChange?: (unit: Unit) => void;
  constraints?: { min: number; max: number; integer?: boolean };
  allowRange?: boolean;
  prescription: Prescription;
  onChange: (value: Prescription) => void;
  readOnly: boolean;
  label: string;
  style?: CSSProperties;
  className?: string;
  initialText?: string;
  onDone?: () => void;
  customAllowed?: boolean;
  formulaAllowed?: boolean;
  effortAsLoad?: boolean;
  fallbackValue?: string;
  required?: boolean;
};
/** Labels for the formula picker's groups. */
function kindLabel(kind: "variable" | "function" | "builtIn" | "custom", locale: string) {
  const pl = locale === "pl";
  return kind === "variable" ? (pl ? "Dane klienta" : "Client data") : kind === "function" ? (pl ? "Funkcje" : "Functions") : kind === "builtIn" ? (pl ? "Wbudowane formuły" : "Built-in formulas") : pl ? "Twoje formuły" : "Your formulas";
}
/** "base1Rm" reads as "Base 1RM". */
const humanName = (name: string) => name.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/\b1 ?rm\b/gi, "1RM").replace(/^./, (c) => c.toUpperCase());
const unitLabel = (unit: Unit) => ({ Scalar: "", Kg: "kg", Lb: "lb", Seconds: "s", Minutes: "min", Meters: "m", Kilometers: "km", Percent: "%" })[unit] ?? unit;

function convertQuantity(value: Quantity, unit: Unit): Quantity {
  if (unit === "Kg" || unit === "Lb") return convertMass(value, unit);
  if ((value.unit === "Seconds" || value.unit === "Minutes") && (unit === "Seconds" || unit === "Minutes")) return { value: value.value * (value.unit === "Minutes" ? 60 : 1) / (unit === "Minutes" ? 60 : 1), unit };
  return value;
}

type Choice = { key: string; label: string; kind: "variable" | "function" | "builtIn" | "custom"; version?: number; inputs?: Record<string, Unit> };

export function InlineLoadCell({ exerciseId, prescription, onChange, readOnly, label, style, className, initialText, onDone, customAllowed = false, formulaAllowed = true, effortAsLoad = false, fallbackValue, required = false, maxReps, valueKind = "mass", valueUnit, onUnitChange, constraints, allowRange = true }: Props) {
  const uiCopy = useUiCopy();

  const m = useT();
  const locale = useLocale();
  const { api, lifecycle } = useAccountContext();
  const context = useClientFormulaContext();
  const exerciseReps = maxReps ?? (exerciseId ? context.exerciseMaxReps?.[exerciseId] ?? Number(prescription.loadFormula?.variableBindings?.repMax?.match(/^exercise(\d+)Rm_/)?.[1] ?? 1) : 1);
  const [text, setText] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, Quantity>>({});
  const [binding, setBinding] = useState<InlineFormulaUse | null>(null);
  const [parameters, setParameters] = useState<Record<string, Unit>>({});
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [unitOverride, setUnitOverride] = useState<Unit | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [placement, setPlacement] = useState({ left: 8, top: 8 });
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [manualInputs, setManualInputs] = useState<string[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const request = useRef(0);
  const completed = useRef(true);
  const changed = useRef(false);
  const cell = useRef<HTMLDivElement>(null);
  const auxiliary = useRef<HTMLDivElement>(null);
  const suggestions = useRef<HTMLDivElement>(null);
  const listId = useId();
  const original = prescription.loadFormula as InlineFormulaUse | null | undefined;
  const saved = original?.variableBindings?.repMax && exerciseId && context.exerciseMaxReps?.[exerciseId]
    ? { ...original, variableBindings: { ...original.variableBindings, repMax: exerciseMaxAlias(exerciseId, exerciseReps) } } : original;
  const effortMode = effortAsLoad && !prescription.load && !saved && prescription.loadPercent == null ? prescription.rpe != null ? "RPE" : prescription.rir != null ? "RIR" : null : null;
  const hasUnitSelect = valueKind !== "scalar" && !readOnly && !effortMode && prescription.loadPercent == null;
  const withoutUnit = (value: string) => hasUnitSelect && !value.startsWith("=") ? value.replace(/\s+(kg|lb|s|min)\b/g, "") : value;
  const raw = formulaText(saved) || (effortMode ? `${effortMode} ${prescription.rpe ?? prescription.rir}` : withoutUnit(fallbackValue || editText(locale, "load", prescription)));
  const search = text !== null && !dismissed && formulaAllowed ? librarySearch(text) : null;
  const builtIns = useBuiltInFormulas();
  const functionSearch = text !== null && !dismissed && formulaAllowed ? /^=([A-Za-z_][A-Za-z0-9_ -]*|)$/.exec(text)?.[1] ?? null : null;
  const library = useFormulaList(functionSearch ?? "", 1, 50);
  const prefix = (search ?? functionSearch ?? "").toLowerCase();
  const allVariableNames = [...new Set([...Object.keys(CLIENT_VARIABLE_UNITS).filter(name => !(CLIENT_VARIABLE_UNITS[name as keyof typeof CLIENT_VARIABLE_UNITS] === "Kg" && !name.endsWith("_kg") || ["weight_kg", "weight_lb"].includes(name))).filter(name => unqualified(name) === "oneRepMax" ? Boolean(exerciseId) : unqualified(name) === "repMax" ? Boolean(exerciseId && (maxReps || context.exerciseMaxReps?.[exerciseId])) : true), ...Object.keys(context.variables).filter(name => !/^exercise(?:Time)?\d+Rm_/.test(name) && !["weight", "bodyweight", "bodyWeight"].includes(name)).flatMap(name => context.variables[name]?.unit === "Kg" || context.variables[name]?.unit === "Lb" ? [`${name}_kg`, `${name}_lb`] : [name])])];
  const variableNames = allVariableNames.filter(name => valueKind === "mass" || !["Kg", "Lb"].includes(CLIENT_VARIABLE_UNITS[name as keyof typeof CLIENT_VARIABLE_UNITS] ?? context.variables[name]?.unit));
  const options: Choice[] = [
    ...(search !== null ? variableNames : []).filter((name) => name.toLowerCase().startsWith(prefix)).slice(0, 6).map((name): Choice => ({ key: `v:${name}`, label: name.replace(/^bodyWeight_/, "Body weight "), kind: "variable" })),
    ...(functionSearch !== null ? FORMULA_FUNCTIONS : []).filter((name) => name.toLowerCase().startsWith(prefix)).map((name): Choice => ({ key: `f:${name}`, label: `${functionLabel(name)}(…)`, kind: "function" })),
    ...(functionSearch !== null ? builtIns.data ?? [] : []).filter(f => valueKind === "mass" || f.definition.outputUnit === (valueKind === "time" ? "Seconds" : "Scalar")).filter((f) => (m.training.formulas.builtInNames[f.key ?? ""] ?? f.key ?? "").toLowerCase().includes(prefix)).map((f): Choice => ({ key: `b:${f.key}`, label: m.training.formulas.builtInNames[f.key ?? ""] ?? f.key ?? "", kind: "builtIn", version: f.version, inputs: f.definition.inputs })),
    ...(customAllowed && functionSearch !== null ? library.data?.items ?? [] : []).filter((f) => !f.archived && f.name.toLowerCase().includes(prefix)).slice(0, 12).map((f): Choice => ({ key: `c:${f.id}`, label: f.name, kind: "custom", version: f.version })),
  ];
  const draft = binding ?? (text?.startsWith("=") && search === null && formulaAllowed ? exerciseBinding(text, { ...(saved?.inputs ?? {}), ...context.variables }, exerciseId, manual, exerciseReps) : null);
  const resolved = withClientVariables(text !== null ? draft : saved, context.variables, Boolean(context.relationshipId) || Object.keys(context.variables).length > 0);
  const missing = Object.keys(resolved?.variableBindings ?? {}).filter(name => !resolved?.inputs[name]);
  const showOptions = !dismissed && (search !== null || functionSearch !== null && options.length > 0);
  const unit: Unit = unitOverride ?? valueUnit ?? (prescription.loadUnit === "Lb" || prescription.load?.minimum.unit === "Lb" && !prescription.loadUnit ? "Lb" : valueKind === "time" ? "Seconds" : valueKind === "scalar" ? "Scalar" : "Kg");
  const evaluation = useFormulaEvaluation(missing.length || showOptions ? null : resolved ? { ...resolved, outputUnit: unit } : null);
  const evaluationError = evaluation.error instanceof ApiError && evaluation.error.status === 400 && evaluation.error.problem?.detail ? evaluation.error.problem.detail : evaluation.error ? errorText(m, evaluation.error) : null;
  const result = evaluation.data ? formatQuantity(locale, convertQuantity(evaluation.data.result, unit)) : null;
  const displayWithUnit = saved && missing.length ? formulaText(saved) : saved ? result ?? (evaluation.error ? formulaText(saved) : "…") : fallbackValue ?? (valueKind === "mass" ? formatLoad(locale, prescription) : prescription.load ? formatQuantity(locale, prescription.load.minimum) : "");

  const display = withoutUnit(displayWithUnit);

  const focusInput = (position?: number) => { const generation = request.current; requestAnimationFrame(() => {
    if (completed.current || request.current !== generation || !lifecycle.isCurrent()) return;
    const input = expanded ? auxiliary.current?.querySelector("textarea") : cell.current?.querySelector("input");
    input?.focus();
    if (position !== undefined) input?.setSelectionRange(position, position);
  }); };
  const begin = (initial: string) => {
    if (readOnly) return;
    request.current++;
    completed.current = false;
    changed.current = initial !== raw;
    setRect(cell.current?.getBoundingClientRect() ?? null);
    setSourcesOpen(false);
    setExpanded(false);
    setText(initial);
    setManual(Object.fromEntries(Object.entries(saved?.inputs ?? {}).filter(([name]) => !saved?.variableBindings?.[name])));
    setBinding(initial === raw && !saved?.expression ? withClientVariables(saved, context.variables, Boolean(context.relationshipId) || Object.keys(context.variables).length > 0) ?? null : null);
    setError("");

    setParameters(saved?.builtIn ? builtIns.data?.find(item => item.key === saved.builtIn)?.definition.inputs ?? {} : Object.fromEntries(Object.entries(saved?.inputs ?? {}).map(([name, q]) => [name, q.unit])));
    setDismissed(Boolean(initial === raw && saved && !saved.expression));
    if (initial === raw && saved?.builtIn) setText(`=${m.training.formulas.builtInNames[saved.builtIn] ?? saved.builtIn}`);
    if (initial === raw && saved?.formulaId) {
      const generation = request.current;
      void getFormula(api, saved.formulaId, saved.version).then(({ data }) => {
        if (!lifecycle.isCurrent() || request.current !== generation) return;
        setText(`=${data.name}`);
        setParameters(data.definition.inputs);
      }).catch((e: unknown) => {
        if (lifecycle.isCurrent() && request.current === generation) setError(errorText(m, e));
      });
    }
  };
  useEffect(() => () => { request.current++; completed.current = true; }, []);
  const finishSelection = useEffectEvent(() => onDone?.());
  const relationship = useRef(context.relationshipId);
  useEffect(() => {
    request.current++;
    completed.current = true;
    setText(null);

    if (relationship.current !== context.relationshipId) { relationship.current = context.relationshipId; finishSelection(); }
  }, [context.relationshipId]);
  // Grid typing supplies only the initial keystroke; subsequent edits belong to this cell.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (initialText !== undefined) { begin(initialText); focusInput(initialText.length); } }, [initialText]);
  const editing = text !== null;
  useEffect(() => {
    if (!editing) return;
    const reposition = () => setRect(cell.current?.getBoundingClientRect() ?? null);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
  }, [editing]);
  const cancel = () => {
    completed.current = true;
    request.current++;
    setText(null);
    setSourcesOpen(false);
    setExpanded(false);
    setBinding(null);
    setManualInputs([]);
    setManual({});
    setParameters({});
    setError("");
    setDismissed(false);
    setActive(0);
    changed.current = false;

    cell.current?.querySelector("input")?.blur();
    onDone?.();
  };
  const commitFormula = (value: InlineFormulaUse) => {
    if (completed.current || !lifecycle.isCurrent()) return;
    const next: Prescription = { ...prescription, loadFormula: storedFormula({ ...value, ...(valueKind === "mass" ? {} : { outputUnit: unit }) }) };
    delete next.load; delete next.loadPercent; delete next.baseValue;
    completed.current = true;
    onChange(next);
    cancel();
  };
  const keepVariables = () => {
    if (!draft) { cancel(); return; }
    if (draft.expression) {
      commitFormula(exerciseBinding(draft.expression, context.variables, exerciseId, {}, exerciseReps));
    } else {
      const inputs = { ...draft.inputs };
      for (const name of Object.keys(draft.variableBindings ?? {})) delete inputs[name];
      commitFormula({ ...draft, inputs });
    }
  };
  const closeOptions = () => {
    if (draft) finish();
    else cancel();
  };
  const finish = () => {
    if (text === null || completed.current) return;
    if (!changed.current) { cancel(); return; }
    if (!formulaAllowed && (/^\s*[=/]/.test(text))) { setError(m.editor.panel.advancedLocked); return; }
    const next: Prescription = { ...prescription };
    if (draft && search === null) {
      next.loadFormula = storedFormula({ ...draft, ...(valueKind === "mass" ? {} : { outputUnit: unit }) });
      delete next.load; delete next.loadPercent; delete next.baseValue;
    } else if (valueKind !== "mass") {
      const parsed = valueKind === "time" ? parseDuration(locale, /^[\d.,\s]+$/.test(text) && unit === "Minutes" ? `${text} min` : text) : null;
      const range = valueKind === "scalar" ? parseReps(text) : null;
      const number = valueKind === "scalar" ? range?.ok ? range.value?.minimum : NaN : parsed?.ok && parsed.value ? convertQuantity(parsed.value, unit).value : NaN;
      if (text.trim() && (!Number.isFinite(number) || number == null || number < 0 || constraints && (number < constraints.min || number > constraints.max || constraints.integer && !Number.isInteger(number)) || !allowRange && range?.ok && range.value?.minimum !== range.value?.maximum)) {
        commitFormula(exerciseBinding(`=${text}`, context.variables, exerciseId, manual, exerciseReps)); return;
      }
      delete next.loadFormula;
      next.load = text.trim() && number != null ? { minimum: { value: number, unit }, maximum: { value: range?.ok ? range.value?.maximum ?? number : number, unit } } : null;
    } else if (/^\s*(RPE|RIR)\b/i.test(text) || (effortMode && /^[\d.,\s]*$/.test(text))) {
      const parsed = parseEffort(locale, /^\s*(RPE|RIR)\b/i.test(text) ? text : text.trim() ? `${effortMode} ${text}` : "");
      if (!parsed.ok) { setError(m.errors.byCode.VALIDATION_FAILED ?? "Invalid effort"); return; }
      Object.assign(next, parsed.value);
      delete next.load; delete next.loadPercent; delete next.loadFormula; delete next.baseValue;
    } else {
      const parsed = parseLoad(locale, text, unit === "Lb" ? "Lb" : "Kg");
      if (!parsed.ok) {
        // Keep malformed Load text in the draft; Apply remains the semantic validation boundary.
        commitFormula(exerciseBinding(`=${text}`, context.variables, exerciseId, manual, exerciseReps));
        return;
      }
      delete next.loadFormula;
      if (parsed.value.kind === "absolute") { next.load = parsed.value.load; next.loadUnit = parsed.value.load.minimum.unit; delete next.loadPercent; delete next.baseValue; }
      else if (parsed.value.kind === "percent") { next.loadPercent = parsed.value.percent; delete next.load; }
      else { delete next.load; delete next.loadPercent; delete next.baseValue; }
      if (effortMode) { next.rpe = null; next.rir = null; }
    }
    if (!lifecycle.isCurrent()) return;
    completed.current = true;
    onChange(next);
    cancel();
  };

  const flushEdit = useEffectEvent(() => { if (editing) finish(); });
  useEffect(() => {
    const flush = () => flushEdit();
    window.addEventListener("training:commit-cell", flush);
    return () => window.removeEventListener("training:commit-cell", flush);
  }, []);

  const choose = async (option: Choice) => {
    const generation = ++request.current;
    changed.current = true;

    setError("");
    if (option.kind === "variable" || option.kind === "function") {
      const next = option.kind === "variable" ? `=${option.key.slice(2)}` : `=${option.key.slice(2)}()`;
      setText(next); setBinding(null); setDismissed(true);
      focusInput(option.kind === "function" ? next.length - 1 : next.length);
      return;
    }
    try {
      const definition = option.kind === "builtIn" ? { inputs: option.inputs ?? {} } : (await getFormula(api, option.key.slice(2), option.version)).data.definition;
      if (!lifecycle.isCurrent() || generation !== request.current) return;
      const inputs = Object.fromEntries(Object.keys(definition.inputs).filter((name) => context.variables[name]).map((name) => [name, context.variables[name]!])) as Record<string, Quantity>;
      const variableBindings = Object.fromEntries(Object.keys(inputs).map((name) => [name, name]));
      for (const name of Object.keys(definition.inputs)) { const alias = clientVariableSource(name, exerciseId, exerciseReps); if (!alias) continue; variableBindings[name] = alias; if (context.variables[alias]) inputs[name] = context.variables[alias]; }
      setBinding({ formulaId: option.kind === "custom" ? option.key.slice(2) : null, builtIn: option.kind === "builtIn" ? option.key.slice(2) : null, version: option.version ?? 1, inputs, variableBindings });
      setParameters(definition.inputs); setText(`=${option.label}`); setDismissed(true);
      focusInput(option.label.length + 1);
    } catch (e) { if (lifecycle.isCurrent() && generation === request.current) setError(errorText(m, e)); }
  };
  const popupVisible = editing && (showOptions || sourcesOpen) && !expanded;
  useLayoutEffect(() => {
    if (!popupVisible || !rect) return;
    const element = auxiliary.current ?? suggestions.current;
    if (!element) return;
    const measure = () => setPlacement(overlayPosition(rect, { width: element.offsetWidth, height: element.scrollHeight + 2 }, overlayViewport(cell.current)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [popupVisible, rect, sourcesOpen, showOptions]);
  const viewport = typeof window === "undefined" ? { width: 1024, height: 768 } : overlayViewport(cell.current);
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const popupWidth = Math.min(Math.max(rect?.width ?? 0, sourcesOpen ? 440 : 320), viewportWidth - 16);
  const popupStyle: CSSProperties = { position: "fixed", ...placement, width: "max-content", minWidth: popupWidth, maxWidth: viewportWidth - 16, maxHeight: viewportHeight - 16, overflowY: "auto", zIndex: 1000 };
  const portalSuggestions = (list: ReactNode) => createPortal(<div ref={suggestions} className={styles.suggestions} style={popupStyle} data-no-drag onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>{list}</div>, document.body);
  const hasParameters = Boolean(binding && dismissed);
  const linked = Boolean(Object.keys((editing ? draft : saved)?.variableBindings ?? {}).length);
  const manualNames = binding ? [] : [...new Set([...Object.keys(draft?.inputs ?? {}), ...Object.keys(draft?.variableBindings ?? {})])];
  const markedVariable = linked && !(editing ? draft : saved)?.builtIn && !(editing ? draft : saved)?.formulaId;
  const quantity = evaluation.data?.result ?? prescription.load?.minimum;
  const quantityNumber = quantity ? quantity.value * (valueKind === "time" && quantity.unit === "Minutes" ? 60 : 1) : null;
  const constraintError = quantityNumber != null && constraints && (quantityNumber < constraints.min || quantityNumber > constraints.max || constraints.integer && !Number.isInteger(quantityNumber)) ? `${label} must be ${constraints.integer ? "a whole number" : "a value"} from ${constraints.min} to ${constraints.max}.` : null;
  const invalid = Boolean(constraintError || error || evaluation.error || required && (!saved && !prescription.load && !text?.trim() || prescription.load?.minimum.value === 0 || Boolean(saved && evaluation.data && evaluation.data.result.value <= 0)));
  const validationReason = constraintError || error || evaluationError || (required && !prescription.load && !saved ? "Enter a positive load or a formula; blank values cannot be applied." : "The formula must produce a valid positive load.");
  const validationId = useCellValidation(invalid, label, validationReason);
  const invalidText = locale === "pl" ? "Niepoprawny format" : "Invalid format";

  const inspector = (
        <div ref={auxiliary} className={styles.auxiliary} data-expanded={expanded || undefined} style={expanded ? undefined : popupStyle} data-no-drag onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); cancel(); } }}>
          {expanded ? <FormulaExpressionInput label={label} value={text ?? raw} inputNames={variableNames} onChange={value => { changed.current = true; setText(value); setBinding(null); setDismissed(false); setError(""); }} /> : null}
          <div className={styles.popupHeader}>{showOptions ? <span className={styles.group}>{kindLabel(options[0]?.kind ?? "function", locale)}</span> : <span className={styles.popupTitle}><FormulaMark size="sm" />{locale === "pl" ? "Dane formuły" : "Formula data"}</span>}{!expanded ? <button type="button" className={styles.closeOptions} aria-label={uiCopy["ui"]["Expand formula editor"]} onPointerDown={event => event.preventDefault()} onClick={() => { setExpanded(true); setSourcesOpen(true); }}><Maximize2 aria-hidden="true" /></button> : null}<button type="button" className={styles.closeOptions} aria-label={uiCopy["ui"]["Close variable options"]} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={closeOptions}><X aria-hidden="true" /></button></div>
          {showOptions ? <>
            <ul id={listId} className={styles.options} role="listbox" aria-label={m.editor.panel.formula}>
              {options.map((option, i) => <li key={option.key}>
                {i > 0 && options[i - 1]!.kind !== option.kind ? <span className={styles.group} aria-hidden="true">{kindLabel(option.kind, locale)}</span> : null}
                <button type="button" role="option" id={`${listId}-${i}`} aria-selected={active === i} data-kind={option.kind}
                  onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onPointerMove={() => setActive(i)} onClick={() => void choose(option)}>{option.label}{option.kind === "variable" && clientVariableSource(option.key.slice(2), exerciseId, exerciseReps) ? <small aria-hidden="true"> · {(option.key === "v:oneRepMax" || option.key === "v:repMax") ? (locale === "pl" ? "Wybrane ćwiczenie" : "Selected exercise") : (locale === "pl" ? "Profil klienta" : "Client profile")}</small> : null}</button>
              </li>)}
              {!options.length ? <li className={styles.empty}>{locale === "pl" ? "Nic nie pasuje" : uiCopy["training"]["library"]["noResultsTitle"]}</li> : null}
            </ul>
            <p className={styles.keys} aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> {locale === "pl" ? "wybierz" : "choose"} <kbd>Enter</kbd> {locale === "pl" ? "wstaw" : "insert"} <kbd>Esc</kbd> {locale === "pl" ? "anuluj" : "cancel"}</p>
          </> : null}
          {!draft ? <p className={styles.sourceNote}>{locale === "pl" ? "Wpisane ręcznie" : "Entered manually"}</p> : null}
          {!draft && effortAsLoad ? <div className={styles.loadModes} aria-label={uiCopy["ui"]["Load format"]}>{["kg", "lb", "%", "RPE", "RIR"].map(mode => <button key={mode} type="button" onPointerDown={event => event.preventDefault()} onClick={() => {
            changed.current = true;
            const value = (text ?? "").match(/[\d.,]+/)?.[0] ?? "";
            setText(mode === "RPE" || mode === "RIR" ? `${mode} ${value}` : `${value}${mode === "%" ? "%" : ` ${mode}`}`);
            setError(""); focusInput();
          }}>{mode}</button>)}</div> : null}
          {binding && dismissed ? <p className={styles.heading}>{(text ?? "").replace(/^\//, "")}<span>{locale === "pl" ? "Formuła" : uiCopy["editor"]["panel"]["formula"]}</span></p> : null}
          {binding && dismissed ? <div className={styles.parameters}>{Object.entries(parameters).map(([name, unit]) => <label key={name}><span className={styles.paramName}>{humanName(name)}{binding.builtIn === "percentage-1rm" && name === "percentage" ? <em>%</em> : unitLabel(unit) ? <em>{unitLabel(unit)}</em> : null}</span>
            <span className={styles.paramRow}><Select size="sm" aria-label={`${name} ${locale === "pl" ? "źródło" : "source"}`} selectedKey={binding.variableBindings?.[name] ?? "manual"} onSelectionChange={(key) => {
              changed.current = true;
              const alias = key === "manual" ? "" : String(key); const inputs = { ...binding.inputs }; const variableBindings = { ...binding.variableBindings };
              if (alias) { variableBindings[name] = alias; if (context.variables[alias]) inputs[name] = context.variables[alias]; else delete inputs[name]; } else { delete variableBindings[name]; delete inputs[name]; }
              setBinding({ ...binding, inputs, variableBindings });
            }}><Option id="manual">{locale === "pl" ? "Wartość własna" : "Manual value"}</Option>{exerciseId && unit === "Kg" ? <Option id={exerciseMaxAlias(exerciseId)}>oneRepMax</Option> : null}{Object.entries(context.variables).filter(([alias, quantity]) => quantity.unit === unit && !/^exercise(?:Time)?\d+Rm_/.test(alias)).map(([alias]) => <Option key={alias} id={alias}>{alias}</Option>)}</Select>
            <input aria-label={formatInterfaceText(uiCopy["ui"]["{0} value"], [name])} inputMode="decimal" type="number" disabled={Boolean(binding.variableBindings?.[name])} value={binding.inputs[name] ? Number((binding.inputs[name].value * (binding.builtIn === "percentage-1rm" && name === "percentage" ? 100 : 1)).toPrecision(12)) : ""} onChange={(event) => {
              changed.current = true;
              const inputs = { ...binding.inputs }; if (event.target.value === "") delete inputs[name]; else inputs[name] = { value: Number(event.target.value) / (binding.builtIn === "percentage-1rm" && name === "percentage" ? 100 : 1), unit }; setBinding({ ...binding, inputs });
            }} placeholder="0" /></span>
          </label>)}</div> : null}
          {draft?.expression && !expanded ? <code className={styles.expression}>{text ?? raw}</code> : null}
          {draft?.expression && manualNames.length ? (() => {
            const waiting = manualNames.filter(name => { const alias = draft?.variableBindings?.[name] ?? clientVariableSource(name, exerciseId, exerciseReps) ?? name; return !context.variables[alias] && !manual[name]; }).length;
            return <p className={styles.status} data-state={waiting ? "waiting" : "ready"}>{waiting ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}{waiting
              ? (locale === "pl" ? `Brakuje ${waiting} ${waiting === 1 ? "wartości" : "wartości"}. Wpisz ją ręcznie albo zostaw zmienną, aż klient poda dane.` : `${waiting} ${waiting === 1 ? "value is" : "values are"} missing. Enter ${waiting === 1 ? "it" : "them"} here, or keep the variable until the client's data arrives.`)
              : (locale === "pl" ? "Wszystkie dane są dostępne." : "All data is available.")}</p>;
          })() : draft?.expression ? <p className={styles.sourceNote}>{locale === "pl" ? "Wpisane wyrażenie, bez zmiennych" : "A plain expression, no variables"}</p> : null}
          {manualNames.length ? <div className={styles.parameters}>{manualNames.map(name => {
            const alias = draft?.variableBindings?.[name] ?? clientVariableSource(name, exerciseId, exerciseReps) ?? name;
            const available = context.variables[alias];
            const own = Boolean(manual[name]) || manualInputs.includes(name);
            const unit = CLIENT_VARIABLE_UNITS[name as keyof typeof CLIENT_VARIABLE_UNITS] ?? available?.unit ?? saved?.inputs[name]?.unit ?? "Kg";
            return <label key={name} className={styles.source} data-state={own ? "manual" : available ? "ready" : "waiting"}><span className={styles.paramName}>{humanName(name)}<em>{unitLabel(unit)}</em><i className={styles.sourceState}>{own ? (locale === "pl" ? "ręcznie" : "manual") : available ? (locale === "pl" ? "dostępne" : "available") : (locale === "pl" ? "brak danych" : "no data yet")}</i></span>
              <span className={styles.paramRow}><Select size="sm" aria-label={formatInterfaceText(uiCopy["ui"]["{0} source"], [name])} selectedKey={own ? "manual" : "variable"} onSelectionChange={key => {
                changed.current = true;
                setManualInputs(current => key === "manual" ? [...new Set([...current, name])] : current.filter(item => item !== name));
                if (key !== "manual") { const next = { ...manual }; delete next[name]; setManual(next); }
              }}><Option id="variable">{available ? (context.blockSources?.includes(alias) ? (locale === "pl" ? "Z tabeli bloku" : "From block table") : (locale === "pl" ? "Z zawodnika" : "From athlete")) : (locale === "pl" ? "Zmienna — oczekuje na dane" : "Variable — waiting for data")}</Option><Option id="manual">{locale === "pl" ? "Wpisane ręcznie" : "Entered manually"}</Option></Select>
              <input aria-label={formatInterfaceText(uiCopy["ui"]["{0} manual value"], [name])} inputMode="decimal" type="number" min="0" value={manual[name]?.value ?? (available && !own ? available.value : "")} disabled={Boolean(available) && !own} onChange={event => {
                changed.current = true;
                const next = { ...manual };
                if (event.target.value !== "") next[name] = { value: Number(event.target.value), unit }; else delete next[name];
                setManual(next); setManualInputs(current => [...new Set([...current, name])]);
              }} placeholder={locale === "pl" ? "Wartość" : uiCopy["editor"]["sheet"]["loadValue"]} /></span>
            </label>;
          })}</div> : null}
          {hasParameters ? <p className={styles.result} aria-live="polite" data-state={evaluationError ? "error" : result ? "ok" : "pending"}>
            <span>{locale === "pl" ? "Wynik" : uiCopy["video"]["detail"]["result"]}</span>
            <strong>{result ?? (evaluationError ? invalidText : "…")}</strong>
          </p> : null}
          {!showOptions || expanded ? <div className={styles.actions}>
            {(linked || manualNames.length > 0) ? <button type="button" className={styles.ghost} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={keepVariables}><Variable aria-hidden="true" />{locale === "pl" ? "Zostaw zmienną" : "Keep variable"}</button> : null}
            <button type="button" className={styles.ghost} onPointerDown={event => event.preventDefault()} onClick={() => { onChange({ ...prescription, load: null, loadFormula: null, loadPercent: null, baseValue: null, rpe: null, rir: null }); cancel(); }}><Trash2 aria-hidden="true" />{locale === "pl" ? "Wyczyść" : uiCopy["editor"]["sheet"]["clear"]}</button>
            <span className={styles.spacer} />
            <button type="button" className={styles.ghost} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={cancel}><Undo2 aria-hidden="true" />{m.common.cancel}</button>
            <button type="button" className={styles.primary} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={finish}><Save aria-hidden="true" />{m.common.save}</button>
          </div> : null}
        </div>
  );

  return (
    <div ref={cell} className={`${styles.cell} ${className ?? ""}`} style={style} data-no-drag data-inline-formula data-inline-load={valueKind === "mass" || undefined} data-validation-id={validationId} data-expression={editing || Boolean(saved) || !display.trim() || undefined} data-unit-select={hasUnitSelect || undefined} data-linked={markedVariable || undefined} data-invalid={invalid || undefined} title={invalid ? `${label}: ${validationReason}` : undefined} onMouseDown={(event) => event.stopPropagation()} onBlur={(event) => {
      if (expanded) return;
      const target = event.relatedTarget as Node | null;
      if (target instanceof Element && target.closest('[role="listbox"], [role="option"]')) return;
      // Portalled controls belong to this editor even though they are outside its DOM cell.
      if (target && (cell.current?.contains(target) || auxiliary.current?.contains(target) || suggestions.current?.contains(target))) return;
      if (target) { finish(); return; }
      if (sourcesOpen || showOptions || expanded) return;
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (editing && !cell.current?.contains(focused) && !auxiliary.current?.contains(focused) && !suggestions.current?.contains(focused)) finish();
      });
    }} onContextMenu={event => {
      if (readOnly) return;
      event.preventDefault(); event.stopPropagation(); if (!editing) begin(raw); setDismissed(true); setSourcesOpen(true);
    }} onKeyDown={(event) => event.stopPropagation()}>
      {markedVariable ? <span role="img" aria-label={uiCopy["ui"]["Linked variable"]} title={missing.length ? (locale === "pl" ? "Aktywna zmienna — oczekuje na dane" : "Active variable — waiting for data") : (locale === "pl" ? "Zmienna powiązana z danymi klienta" : "Variable linked to client data")} className={styles.linked} data-waiting={missing.length > 0 || undefined}><FormulaMark size="sm" /></span> : null}
      {/* A formula that still waits for values says so on the cell: an amber pill that opens its data. */}
      {!editing && saved && missing.length && !readOnly ? <button type="button" className={styles.needsData} data-no-drag
        aria-label={locale === "pl" ? `Uzupełnij dane formuły (${missing.length})` : `Fill in formula data (${missing.length})`}
        title={locale === "pl" ? "Formuła czeka na dane — kliknij, aby je uzupełnić" : "The formula is waiting for data — click to fill it in"}
        onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
        onClick={event => { event.stopPropagation(); begin(raw); setDismissed(true); setSourcesOpen(true); }}>
        ƒ
      </button> : null}
      <FormulaExpressionInput compact label={label} value={text ?? display} isDisabled={readOnly} inputNames={formulaAllowed && editing ? variableNames : []}
        suppressSuggestions={!editing || !formulaAllowed || !text?.startsWith("=") || showOptions || dismissed} externalSuggestions={{ listId, open: showOptions, activeId: showOptions && options[active] ? `${listId}-${active}` : undefined }}
        onFocus={() => { if (!editing) begin(raw); }} renderSuggestions={portalSuggestions}
        onChange={(value) => { request.current++; changed.current = true; setText(value); setBinding(null); setDismissed(false); setActive(0); setError(""); }}
        onKeyDown={(event) => {
          if (showOptions && options.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault(); setActive((i) => (i + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length); }
          else if (event.key === "Enter") { event.preventDefault(); if (showOptions && options[active]) void choose(options[active]!); else finish(); }
          else if (event.key === "Escape") { event.preventDefault(); cancel(); }
        }} />
      {editing && (showOptions || sourcesOpen || expanded) ? expanded ? <Dialog isOpen title={locale === "pl" ? `Formuła · ${label}` : `Formula · ${label}`} description={locale === "pl" ? "Edytuj formułę i uzupełnij dane, z których korzysta." : "Edit the formula and fill in the data it uses."} size="lg" placement="right" onOpenChange={open => { if (!open) cancel(); }}>{inspector}</Dialog> : createPortal(inspector, document.body) : null}
      {hasUnitSelect ? <Select className={styles.unitSelect} aria-label={formatInterfaceText(uiCopy["ui"]["{0} unit"], [label])} data-no-drag selectedKey={unit} onSelectionChange={key => {
        if (onUnitChange) { setUnitOverride(key as Unit); onUnitChange(key as Unit); return; }
        const selected = key as "Kg" | "Lb";
        onChange({ ...prescription, loadUnit: selected, load: prescription.load ? { minimum: convertMass(prescription.load.minimum, selected), maximum: convertMass(prescription.load.maximum, selected) } : prescription.load });
      }}>{valueKind === "time" ? <><Option id="Seconds">s</Option><Option id="Minutes">min</Option></> : <><Option id="Kg">kg</Option><Option id="Lb">lb</Option></>}</Select> : null}
      {editing && draft && !showOptions && !sourcesOpen ? <button type="button" className={styles.more} data-waiting={missing.length > 0 || undefined} aria-label={uiCopy["ui"]["Formula data sources"]} onPointerDown={event => event.preventDefault()} onClick={() => setSourcesOpen(true)}>ƒ</button> : null}


    </div>
  );
}

