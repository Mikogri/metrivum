import { describe, expect, it } from "vitest";
import type { FormulaUse, TrainingDocument } from "@metrivum/api-client-web";
import { storedDocument, storedFormula } from "./formula-values";
import { withClientVariables } from "./editor/model/inline-formula";

describe("formula storage boundary", () => {
  it("stores either a source or a manual value and rehydrates previews separately", () => {
    const formula: FormulaUse = {
      formulaId: null,
      builtIn: null,
      version: 1,
      expression: "weight * percentage",
      inputs: {
        weight: { value: 80, unit: "Kg" },
        percentage: { value: 0.8, unit: "Scalar" },
      },
      variableBindings: { weight: "weight" },
    };
    const stored = storedFormula(formula);
    expect(stored.inputs).toEqual({
      percentage: { value: 0.8, unit: "Scalar" },
    });
    expect(stored.variableBindings).toEqual({ weight: "weight" });
    expect(formula.inputs.weight?.value).toBe(80);
    expect(
      withClientVariables(stored, { weight: { value: 90, unit: "Kg" } }, true)
        ?.inputs.weight?.value,
    ).toBe(90);
    const document: TrainingDocument = {
      schemaVersion: 1,
      blocks: [
        {
          id: "block",
          name: "",
          description: "",
          cycles: [
            {
              id: "cycle",
              name: "",
              description: "",
              dayCount: 7,
              days: [
                {
                  id: "day",
                  dayNumber: 1,
                  workouts: [
                    {
                      id: "workout",
                      name: "",
                      description: "",
                      groups: [],
                      exercises: [
                        {
                          id: "instance",
                          exerciseId: "exercise",
                          comment: "",
                          sets: [
                            {
                              id: "set",
                              kind: "DropSet",
                              prescription: { loadFormula: formula },
                              segments: [
                                {
                                  id: "segment",
                                  prescription: { loadFormula: formula },
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result =
      storedDocument(document).blocks[0]!.cycles[0]!.days[0]!.workouts[0]!
        .exercises[0]!.sets[0]!;
    expect(result.prescription.loadFormula?.inputs).toEqual(stored.inputs);
    expect(result.segments?.[0]?.prescription.loadFormula?.inputs).toEqual(
      stored.inputs,
    );
  });
});
