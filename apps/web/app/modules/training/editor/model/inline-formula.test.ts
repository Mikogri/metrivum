import { describe, expect, it } from "vitest";
import { inlineBinding, exerciseBinding, exerciseMaxAlias, clientVariableSource, formulaText, librarySearch, withClientVariables } from "./inline-formula";

describe("inline formula notation", () => {
  it("keeps HR max and profile sources client-wide with or without an exercise", () => {
    const variables = { hrMax: { value: 190, unit: "Scalar" as const }, weight: { value: 80, unit: "Kg" as const } };
    for (const exercise of [undefined, "bench", "squat"]) {
      expect(clientVariableSource("hrMax", exercise)).toBe("hrMax");
      const bound = exerciseBinding("=hrMax * weight", variables, exercise);
      expect(bound.variableBindings).toEqual({ hrMax: "hrMax", weight: "weight" });
      expect(bound.inputs).toEqual(variables);
      expect(exerciseBinding("=hrMax * .8", {}, exercise).variableBindings).toEqual({ hrMax: "hrMax" });
    }
    expect(clientVariableSource("oneRepMax", "bench")).not.toBe(clientVariableSource("oneRepMax", "squat"));
  });
  it("keeps an exercise-scoped 1RM missing until real data or a manual value is supplied", () => {
    const id = "30000000-0000-4000-8000-000000000081";
    const alias = exerciseMaxAlias(id);
    const pending = exerciseBinding("=oneRepMax * 80%", {}, id);
    expect(pending.variableBindings).toEqual({ oneRepMax: alias });
    expect(pending.inputs).toEqual({});
    expect(exerciseBinding("=oneRepMax * 80%", { [alias]: { value: 100, unit: "Kg" } }, id).inputs.oneRepMax?.value).toBe(100);
    const manual = exerciseBinding("=oneRepMax * 80%", {}, id, { oneRepMax: { value: 90, unit: "Kg" } });
    expect(manual.inputs.oneRepMax?.value).toBe(90);
    expect(manual.variableBindings).toEqual({});
    expect(exerciseMaxAlias("40000000-0000-4000-8000-000000000081")).not.toBe(alias);
  });
  it("opens the library only for a leading slash", () => {
    expect(librarySearch("/percent")).toBe("percent");
    expect(librarySearch("=/percent")).toBe("percent");
    expect(librarySearch("=80/2")).toBeNull();
  });
  it("captures only referenced snapshot values without inventing missing inputs", () => {
    const weight = { value: 80, unit: "Kg" as const };
    expect(inlineBinding("=weight * 0.8 + missing", { weight, height: { value: 180, unit: "Scalar" } }).inputs).toEqual({ weight });
    expect(inlineBinding("=80 * -(.5 + .2)", {}).expression).toBe("80 * -(.5 + .2)");
  });
  it("retains the editable expression", () => {
    expect(formulaText(inlineBinding("=80/2", {}))).toBe("=80/2");
  });
  it("uses the selected frozen client snapshot only for bound values", () => {
    const value = { ...inlineBinding("=weight * factor", { weight: { value: 80, unit: "Kg" } }), inputs: { weight: { value: 80, unit: "Kg" as const }, factor: { value: .8, unit: "Scalar" as const } } };
    expect(withClientVariables(value, { weight: { value: 90, unit: "Kg" } }, true)?.inputs).toEqual({ weight: { value: 90, unit: "Kg" }, factor: { value: .8, unit: "Scalar" } });
    expect(withClientVariables(value, {}, true)?.inputs).toEqual({ factor: { value: .8, unit: "Scalar" } });
    expect(withClientVariables(value, {}, false)).toBe(value);
  });
});

describe("unit-qualified sources", () => {
  it("binds the explicit unit to the same exercise and converts preview inputs", () => {
    const alias = exerciseMaxAlias("bench");
    const vars = { [alias]: { value: 100, unit: "Kg" as const } };
    const formula = exerciseBinding("=ROUND_TO_STEP_LOWER(oneRepMax_lb, 2.5)", vars, "bench");
    expect(formula.variableBindings).toEqual({ oneRepMax_lb: alias });
    expect(formula.inputs.oneRepMax_lb?.unit).toBe("Lb");
    expect(formula.inputs.oneRepMax_lb?.value).toBeCloseTo(220.462262, 5);
    expect(withClientVariables(formula, vars, true)?.inputs.oneRepMax_lb?.unit).toBe("Lb");
    expect(vars[alias]?.value).toBe(100);
  });
});


it("uses the existing profile source for the renamed, unit-qualified body weight", () => {
  const formula = exerciseBinding("=bodyWeight_lb * .8", { weight: { value: 100, unit: "Kg" } });
  expect(formula.variableBindings).toEqual({ bodyWeight_lb: "weight" });
  expect(formula.inputs.bodyWeight_lb?.unit).toBe("Lb");
  expect(formula.inputs.bodyWeight_lb?.value).toBeCloseTo(220.462262, 5);
});

it("resolves API-created implicit snapshot inputs and qualified binding aliases without changing manual inputs", () => {
  const use = { formulaId: null, builtIn: null, version: 1, expression: "weight_kg * factor", inputs: { factor: { value: .8, unit: "Scalar" as const } }, variableBindings: {} };
  const variables = { weight: { value: 100, unit: "Kg" as const } };
  expect(withClientVariables(use, variables, true)?.inputs).toEqual({ weight_kg: variables.weight, factor: use.inputs.factor });
  expect(use.inputs).not.toHaveProperty("weight_kg");
  const bound = { ...use, expression: "base1Rm * factor", variableBindings: { base1Rm: "weight_kg" } };
  expect(withClientVariables(bound, variables, true)?.inputs.base1Rm).toEqual(variables.weight);
  const manual = { ...use, inputs: { ...use.inputs, weight_kg: { value: 80, unit: "Kg" as const } } };
  expect(withClientVariables(manual, variables, true)?.inputs.weight_kg?.value).toBe(80);
});
