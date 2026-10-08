import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormAnswerFields, type Answers, type Definition } from "./form-fields";
import { equipmentValue, profileQuestion, questionType } from "./form-model";

const definition: Definition = { sections: [{ key: "about", title: "About you", order: 0, questions: [
  { key: "pain", label: "Any pain?", type: "YesNo", required: true, order: 0 },
  { key: "load", label: "Load", type: "Number", required: true, order: 1, min: 0, max: 200 },
] }] };

function AnswerForm() {
  const [answers, setAnswers] = useState<Answers>({ pain: false, load: 0 });
  return <><FormAnswerFields definition={definition} answers={answers} onChange={setAnswers} /><output data-testid="answers">{JSON.stringify(answers)}</output></>;
}

describe("typed form answers", () => {
  it("preserves false and zero and writes numeric answers as numbers", async () => {
    render(<AnswerForm />);
    expect(screen.getByRole("button", { name: /Any pain/ })).toHaveTextContent("No");
    const number = screen.getByRole("textbox", { name: /Load/ });
    expect(number).toHaveValue("0");
    await userEvent.clear(number); await userEvent.type(number, "12"); await userEvent.tab();
    expect(JSON.parse(screen.getByTestId("answers").textContent!)).toEqual({ pain: false, load: 12 });
  });
  it("removes incompatible configuration when a scale becomes text", () => {
    expect(questionType("ShortText")).toMatchObject({ min: null, max: null, minLabel: null, unit: null, choices: null });
  });
  it("maps training days to stable ISO weekday keys", () => {
    expect(profileQuestion("PreferredTrainingDays").choices?.map((x) => x.key)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(profileQuestion("Height").type).toBe("Number");
  });
  it("maps equipment to shared names rather than form-specific identifiers", () => {
    const first = profileQuestion("AvailableEquipment").choices;
    expect(first).toEqual(profileQuestion("AvailableEquipment").choices);
    expect(first?.every((choice) => choice.key === choice.label)).toBe(true);
    expect(first?.map((choice) => choice.key)).toContain("Dumbbells");
  });
  it("keeps custom equipment values readable and valid as stable form keys", () => {
    expect(equipmentValue("Resistance bands")).toBe("Resistance_bands");
    expect(equipmentValue("  / Ławka + weights  ")).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
    expect(equipmentValue("a".repeat(100))).toHaveLength(80);
  });
});
