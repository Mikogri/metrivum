import type { FormulaUse, Quantity } from "@metrivum/api-client-web";

export type InlineFormulaUse = FormulaUse & { expression?: string | null; variableBindings?: Record<string, string> | null };

export const exerciseMaxAlias = (exerciseId: string, reps = 1) => `exercise${reps}Rm_${exerciseId.replaceAll("-", "")}`;
export const CLIENT_VARIABLE_UNITS = { oneRepMax: "Kg", oneRepMax_kg: "Kg", oneRepMax_lb: "Lb", repMax: "Kg", repMax_kg: "Kg", repMax_lb: "Lb", maxTime_s: "Seconds", maxTime_min: "Minutes", hrMax: "Scalar", weight: "Kg", weight_kg: "Kg", weight_lb: "Lb", bodyWeight_kg: "Kg", bodyWeight_lb: "Lb", height: "Scalar" } as const;
export const unqualified = (name: string) => name.replace(/_(kg|lb|s|min)$/, "");
export function convertMass(value: Quantity, unit: "Kg" | "Lb"): Quantity {
  if (value.unit !== "Kg" && value.unit !== "Lb") return value;
  return { value: value.value * (value.unit === "Lb" ? .45359237 : 1) / (unit === "Lb" ? .45359237 : 1), unit };
}
export function qualifiedValue(name: string, value: Quantity): Quantity {
  if ((name.endsWith("_s") || name.endsWith("_min")) && (value.unit === "Seconds" || value.unit === "Minutes")) return { value: value.value * (value.unit === "Minutes" ? 60 : 1) / (name.endsWith("_min") ? 60 : 1), unit: name.endsWith("_min") ? "Minutes" : "Seconds" };
  return name.endsWith("_kg") ? convertMass(value, "Kg") : name.endsWith("_lb") ? convertMass(value, "Lb") : value;
}

/** Profile sources are client-wide; only strength inputs depend on the selected exercise. */
export function clientVariableSource(name: string, exerciseId?: string, reps = 1): string | undefined {
  name = unqualified(name);
  if (name === "maxTime") return exerciseId ? `exerciseTime${reps}Rm_${exerciseId.replaceAll("-", "")}` : name;
  if (name === "bodyWeight") return "weight";
  if (name === "repMax") return exerciseId ? exerciseMaxAlias(exerciseId, reps) : name;
  if (name === "oneRepMax" || name === "base1Rm") return exerciseId ? exerciseMaxAlias(exerciseId) : name === "oneRepMax" ? name : undefined;
  return ["hrMax", "weight", "bodyweight", "bodyWeight", "height"].includes(name) ? name : undefined;
}

/** A generic 1RM input is scoped to the exercise, not to a client's editable alias. */
export function exerciseBinding(text: string, variables: Record<string, Quantity>, exerciseId?: string, manual: Record<string, Quantity> = {}, reps = 1): InlineFormulaUse {
  const value = inlineBinding(text, { ...variables, ...manual });
  const names = new Set(value.expression?.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  for (const name of new Set([...Object.keys(CLIENT_VARIABLE_UNITS), ...names])) {
    if (!names.has(name) || manual[name]) continue;
    const alias = clientVariableSource(name, exerciseId, reps) ?? (variables[unqualified(name)] ? unqualified(name) : variables[name] ? name : undefined);
    if (!alias) continue;
    value.variableBindings![name] = alias;
    if (variables[alias]) value.inputs[name] = qualifiedValue(name, variables[alias]);
  }
  for (const name of Object.keys(manual)) delete value.variableBindings![name];
  return value;
}

export function librarySearch(text: string): string | null {
  return /^=?\//.test(text.trim()) ? text.trim().replace(/^=?\//, "") : null;
}

export function inlineBinding(text: string, variables: Record<string, Quantity>): InlineFormulaUse {
  const expression = text.trim().replace(/^=/, "");
  const names = new Set(expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
  const inputs = Object.fromEntries(Object.entries(variables).filter(([name]) => names.has(name)));
  return { formulaId: null, builtIn: null, version: 1, expression, inputs,
    variableBindings: Object.fromEntries(Object.keys(inputs).map((name) => [name, name])) };
}

export function formulaText(value: InlineFormulaUse | null | undefined): string {
  if (!value) return "";
  return value.expression ? `=${value.expression.replace(/^=/, "")}` : `/${value.builtIn ?? value.formulaId ?? ""}`;
}

/** Only explicit bindings follow a selected client's frozen snapshot; manual constants remain fixed. */
export function withClientVariables(value: InlineFormulaUse | null | undefined, variables: Record<string, Quantity>, selected: boolean): InlineFormulaUse | null | undefined {
  if (!value || !selected) return value;
  const inputs = { ...value.inputs };
  for (const [input, alias] of Object.entries(value.variableBindings ?? {})) {
    const source = variables[alias] ?? variables[unqualified(alias)];
    if (source) inputs[input] = qualifiedValue(input, source);
    else delete inputs[input];
  }
  // API expressions can reference snapshot variables directly without UI-created bindings.
  // Explicit/manual constants still win; only absent expression inputs are resolved here.
  for (const name of value.expression?.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? []) {
    if (inputs[name] || value.variableBindings?.[name]) continue;
    const source = variables[name] ?? variables[unqualified(name)];
    if (source) inputs[name] = qualifiedValue(name, source);
  }
  return { ...value, inputs };
}
