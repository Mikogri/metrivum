import { parseDate } from "@internationalized/date";
import { Checkbox, DateField, NumberInput, Option, Select, TextArea, TextField } from "@trainflow/ui-web";
import type { Schema } from "@trainflow/api-client-web";
import styles from "./coaching.module.css";

export type Definition = Schema<"FormDefinition">;
export type Question = Schema<"FormQuestion">;
export type Answers = Record<string, string | number | boolean | string[] | null>;
export type AnswerErrors = Record<string, string>;

/**
 * What is wrong with the answers before sending: a missing required answer, a number out of range or text over its
 * limit. Keyed by question, so each message shows under its own field.
 */
export function answerErrors(definition: Definition, answers: Answers): AnswerErrors {
  const errors: AnswerErrors = {};
  for (const section of definition.sections) for (const q of section.questions) {
    const value = answers[q.key];
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "number" && Number.isNaN(value));
    if (empty) { if (q.required) errors[q.key] = "This answer is required."; continue; }
    if (typeof value === "number") {
      if (q.min != null && value < Number(q.min)) errors[q.key] = `Enter ${q.min} or more.`;
      else if (q.max != null && value > Number(q.max)) errors[q.key] = `Enter ${q.max} or less.`;
    }
    if (typeof value === "string" && q.maxLength != null && value.length > Number(q.maxLength)) errors[q.key] = `Use at most ${q.maxLength} characters.`;
    if (Array.isArray(value)) {
      if (q.minSelections != null && value.length < Number(q.minSelections)) errors[q.key] = `Choose at least ${q.minSelections}.`;
      else if (q.maxSelections != null && value.length > Number(q.maxSelections)) errors[q.key] = `Choose at most ${q.maxSelections}.`;
    }
  }
  return errors;
}

/** Moves focus to the first field with a problem, so the message under it is seen. */
export function focusFirstError(errors: AnswerErrors) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>(`[data-question="${CSS.escape(first)}"]`);
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
    field?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
  });
}

export function FormAnswerFields({ definition, answers, onChange, disabled = false, errors = {} }: { definition: Definition; answers: Answers; onChange: (answers: Answers) => void; disabled?: boolean; errors?: AnswerErrors }) {
  const set = (key: string, value: Answers[string]) => onChange({ ...answers, [key]: value });
  // Each problem shows in red under its own field.
  const invalid = (key: string) => ({ isInvalid: Boolean(errors[key]), errorMessage: errors[key] });
  return <div className={styles.stack}>{[...definition.sections].sort((a, b) => a.order - b.order).map((s) => <section className={`${styles.panel} ${styles.answerSection}`} key={s.key}>
    <header className={styles.answerHead}><h2>{s.title}</h2>{s.description && <p className={styles.muted}>{s.description}</p>}</header>
    {[...s.questions].sort((a, b) => a.order - b.order).map((q) => {
      const value = answers[q.key];
      return <div key={q.key} data-question={q.key} className={styles.question}>{field()}</div>;
      function field() {
      if (q.type === "ShortText" || q.type === "LongText") {
        const Field = q.type === "LongText" ? TextArea : TextField;
        return <Field key={q.key} {...invalid(q.key)} label={q.label} placeholder={q.type === "LongText" ? "Write your answer" : "Your answer"} description={q.helpText ?? undefined} isRequired={q.required} isDisabled={disabled} value={typeof value === "string" ? value : ""} maxLength={q.maxLength ?? undefined} onChange={(text) => set(q.key, text)} />;
      }
      if (q.type === "MultiChoice") return <fieldset key={q.key} className={styles.choiceGroup} disabled={disabled}><legend className={styles.choiceLegend}>{q.label}{q.required ? <span aria-hidden="true"> *</span> : ""}{q.helpText && <small>{q.helpText}</small>}</legend>{q.choices?.map((choice) => <Checkbox key={choice.key} isSelected={Array.isArray(value) && value.includes(choice.key)} onChange={(checked) => set(q.key, checked ? [...(Array.isArray(value) ? value : []), choice.key] : (Array.isArray(value) ? value : []).filter((v) => v !== choice.key))}>{choice.label}</Checkbox>)}{errors[q.key] ? <p className={styles.fieldError} role="alert">{errors[q.key]}</p> : null}</fieldset>;
      if (q.type === "SingleChoice" || q.type === "YesNo")
        return <Select key={q.key} {...invalid(q.key)} label={q.label} description={q.helpText ?? undefined} placeholder="Choose an answer" isRequired={q.required} isDisabled={disabled} selectedKey={value === undefined || value === null ? null : String(value)} onSelectionChange={(key) => set(q.key, q.type === "YesNo" ? key === "true" : String(key))}>
          {q.type === "YesNo" ? [<Option key="true" id="true">Yes</Option>, <Option key="false" id="false">No</Option>] : (q.choices ?? []).map((c) => <Option key={c.key} id={c.key}>{c.label}</Option>)}
        </Select>;
      if (q.type === "FileAttachment") return <p key={q.key} role="alert">Attachments are not available for this form.</p>;
      if (q.type === "Date") {
        let date: ReturnType<typeof parseDate> | null;
        try { date = typeof value === "string" && value ? parseDate(value) : null; } catch { date = null; }
        return <DateField key={q.key} {...invalid(q.key)} label={q.label} description={q.helpText ?? undefined} isRequired={q.required} isDisabled={disabled} value={date} onChange={(v) => set(q.key, v ? v.toString() : null)} />;
      }
      const scale = q.type === "Scale" ? `${q.min}: ${q.minLabel ?? "Minimum"} · ${q.max}: ${q.maxLabel ?? "Maximum"}` : "";
      return <NumberInput key={q.key} {...invalid(q.key)} label={q.label} description={[scale, q.helpText].filter(Boolean).join(" · ") || undefined} unit={q.unit ?? undefined} placeholder={q.min != null && q.max != null ? `${q.min}–${q.max}` : "0"} isRequired={q.required} isDisabled={disabled}
        minValue={q.min == null ? undefined : Number(q.min)} maxValue={q.max == null ? undefined : Number(q.max)} step={q.type === "Scale" ? 1 : undefined}
        value={typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN} onChange={(v) => set(q.key, Number.isFinite(v) ? v : null)} />;
      }
    })}
  </section>)}</div>;
}

export function AnswerReview({ definition, answers }: { definition: Definition; answers: Answers }) {
  return <div className={styles.stack}>{definition.sections.map((s) => <section key={s.key}><h3>{s.title}</h3><dl className={styles.list}>{s.questions.map((q) => {
    const value = answers[q.key];
    const display = (v: string) => q.choices?.find((c) => c.key === v)?.label ?? v;
    return <div key={q.key} className={styles.item}><dt className={styles.muted}>{q.label}</dt><dd>{value === null || value === undefined ? "Not answered" : Array.isArray(value) ? value.map(display).join(", ") : typeof value === "boolean" ? value ? "Yes" : "No" : display(String(value))}</dd></div>;
  })}</dl></section>)}</div>;
}
