import type { Question } from "./form-fields";

export const equipmentValue = (label: string) => label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[_-]+/, "").slice(0, 80);

export function questionType(type: Question["type"]): Partial<Question> {
  return { type, choices: type === "SingleChoice" || type === "MultiChoice" ? [{ key: crypto.randomUUID(), label: "Option 1" }, { key: crypto.randomUUID(), label: "Option 2" }] : null,
    min: type === "Scale" ? 1 : null, max: type === "Scale" ? 10 : null,
    minLabel: null, maxLabel: null, minSelections: null, maxSelections: null, maxLength: null, unit: null, systemField: null };
}

export function profileQuestion(field: Question["systemField"]): Partial<Question> {
  if (!field) return { systemField: null };
  if (["Height", "Weight", "BodyFat", "HrMax", "SessionsPerWeek", "AvailableSessionDuration", "Sleep", "Stress"].includes(field)) return { ...questionType("Number"), systemField: field };
  if (field === "PreferredTrainingDays") return { ...questionType("MultiChoice"), systemField: field, choices: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((label, i) => ({ key: String(i + 1), label })) };
  if (field === "AvailableEquipment") return { ...questionType("MultiChoice"), systemField: field, choices: ["Dumbbells", "Barbell", "Bands", "Machines"].map((name) => ({ key: name, label: name })) };
  return { ...questionType("LongText"), systemField: field };
}
