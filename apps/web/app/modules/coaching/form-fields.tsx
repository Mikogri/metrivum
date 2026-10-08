import { parseDate } from "@internationalized/date";
import { Checkbox, DateField, NumberInput, Option, Select, TextArea, TextField } from "@trainflow/ui-web";
import type { Schema } from "@trainflow/api-client-web";
import styles from "./coaching.module.css";

export type Definition = Schema<"FormDefinition">;
export type Question = Schema<"FormQuestion">;
export type Answers = Record<string, string | number | boolean | string[] | null>;

export function FormAnswerFields({ definition, answers, onChange, disabled = false }: { definition: Definition; answers: Answers; onChange: (answers: Answers) => void; disabled?: boolean }) {
  const set = (key: string, value: Answers[string]) => onChange({ ...answers, [key]: value });
  return <div className={styles.stack}>{[...definition.sections].sort((a, b) => a.order - b.order).map((s) => <section className={styles.panel} key={s.key}>
    <h2>{s.title}</h2>{s.description && <p className={styles.muted}>{s.description}</p>}
    {[...s.questions].sort((a, b) => a.order - b.order).map((q) => {
      const value = answers[q.key];
      if (q.type === "ShortText" || q.type === "LongText") {
        const Field = q.type === "LongText" ? TextArea : TextField;
        return <Field key={q.key} label={q.label} placeholder={q.type === "LongText" ? "Write your answer" : "Your answer"} description={q.helpText ?? undefined} isRequired={q.required} isDisabled={disabled} value={typeof value === "string" ? value : ""} maxLength={q.maxLength ?? undefined} onChange={(text) => set(q.key, text)} />;
      }
      if (q.type === "MultiChoice") return <fieldset key={q.key} className={styles.form} disabled={disabled}><legend>{q.label}{q.required ? " *" : ""}</legend>{q.helpText && <p className={styles.muted}>{q.helpText}</p>}{q.choices?.map((choice) => <Checkbox key={choice.key} isSelected={Array.isArray(value) && value.includes(choice.key)} onChange={(checked) => set(q.key, checked ? [...(Array.isArray(value) ? value : []), choice.key] : (Array.isArray(value) ? value : []).filter((v) => v !== choice.key))}>{choice.label}</Checkbox>)}</fieldset>;
      if (q.type === "SingleChoice" || q.type === "YesNo")
        return <Select key={q.key} label={q.label} description={q.helpText ?? undefined} placeholder="Choose an answer" isRequired={q.required} isDisabled={disabled} selectedKey={value === undefined || value === null ? null : String(value)} onSelectionChange={(key) => set(q.key, q.type === "YesNo" ? key === "true" : String(key))}>
          {q.type === "YesNo" ? [<Option key="true" id="true">Yes</Option>, <Option key="false" id="false">No</Option>] : (q.choices ?? []).map((c) => <Option key={c.key} id={c.key}>{c.label}</Option>)}
        </Select>;
      if (q.type === "FileAttachment") return <p key={q.key} role="alert">Attachments are not available for this form.</p>;
      if (q.type === "Date") {
        let date: ReturnType<typeof parseDate> | null;
        try { date = typeof value === "string" && value ? parseDate(value) : null; } catch { date = null; }
        return <DateField key={q.key} label={q.label} description={q.helpText ?? undefined} isRequired={q.required} isDisabled={disabled} value={date} onChange={(v) => set(q.key, v ? v.toString() : null)} />;
      }
      const scale = q.type === "Scale" ? `${q.min}: ${q.minLabel ?? "Minimum"} · ${q.max}: ${q.maxLabel ?? "Maximum"}` : "";
      return <NumberInput key={q.key} label={q.label} description={[scale, q.helpText].filter(Boolean).join(" · ") || undefined} unit={q.unit ?? undefined} placeholder={q.min != null && q.max != null ? `${q.min}–${q.max}` : "0"} isRequired={q.required} isDisabled={disabled}
        minValue={q.min == null ? undefined : Number(q.min)} maxValue={q.max == null ? undefined : Number(q.max)} step={q.type === "Scale" ? 1 : undefined}
        value={typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN} onChange={(v) => set(q.key, Number.isFinite(v) ? v : null)} />;
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
