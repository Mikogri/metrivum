import { useId } from "react";
import { Button, Chip, ChipGroup, NumberInput, Option, Select, TextArea } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import type { AppMessages } from "~/shared/i18n/messages/app.en";
import styles from "./ProfileDetails.module.css";

/**
 * The body and training details a coach plans with (backend: SystemFieldKey). One editor for onboarding and
 * settings, split into four groups so onboarding can ask for them one step at a time.
 */
export type Details = {
  Sex: string;
  Height: number;
  Weight: number;
  BodyFat: number;
  HrMax: number;
  Sleep: number;
  Stress: number;
  TrainingExperience: string;
  ActivityLevel: string;
  SessionsPerWeek: number;
  AvailableSessionDuration: number;
  PreferredTrainingDays: number[];
  AvailableEquipment: string[];
  InjuriesLimitationsPainNotes: string;
  AdditionalNotes: string;
};
export type DetailKey = keyof Details;
export type DetailGroup = "body" | "heart" | "training" | "health";

export const DETAIL_GROUPS: Record<DetailGroup, DetailKey[]> = {
  body: ["Sex", "Height", "Weight", "BodyFat"],
  heart: ["HrMax", "Sleep", "Stress"],
  training: ["TrainingExperience", "ActivityLevel", "SessionsPerWeek", "AvailableSessionDuration", "PreferredTrainingDays", "AvailableEquipment"],
  health: ["InjuriesLimitationsPainNotes", "AdditionalNotes"],
};

export const emptyDetails: Details = {
  Sex: "", Height: NaN, Weight: NaN, BodyFat: NaN, HrMax: NaN, Sleep: NaN, Stress: NaN, TrainingExperience: "", ActivityLevel: "",
  SessionsPerWeek: NaN, AvailableSessionDuration: NaN, PreferredTrainingDays: [], AvailableEquipment: [], InjuriesLimitationsPainNotes: "", AdditionalNotes: "",
};

const NUMBER_KEYS = new Set<DetailKey>(["Height", "Weight", "BodyFat", "HrMax", "Sleep", "Stress", "SessionsPerWeek", "AvailableSessionDuration"]);

/** Stored values (as the API returns them) to editable state. Unknown shapes are ignored. */
export function detailsFromValues(values: Record<string, unknown> | undefined): Details {
  const next: Details = { ...emptyDetails, PreferredTrainingDays: [], AvailableEquipment: [] };
  if (!values) return next;
  for (const key of Object.keys(emptyDetails) as DetailKey[]) {
    const value = values[key];
    if (value === undefined || value === null) continue;
    if (NUMBER_KEYS.has(key)) {
      if (typeof value === "number") (next[key] as number) = value;
    } else if (key === "PreferredTrainingDays") {
      if (Array.isArray(value)) next.PreferredTrainingDays = value.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7);
    } else if (key === "AvailableEquipment") {
      if (Array.isArray(value)) next.AvailableEquipment = value.filter((item): item is string => typeof item === "string");
    } else if (typeof value === "string") {
      (next[key] as string) = value;
    }
  }
  return next;
}

/**
 * Editable state to the API's values. With `clearEmpty`, an empty field is sent as null so the server removes
 * it (settings); without it, only filled fields are sent (onboarding).
 */
export function detailsToValues(details: Details, keys: DetailKey[], clearEmpty: boolean): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const key of keys) {
    const value = details[key];
    const empty = typeof value === "number" ? Number.isNaN(value) : Array.isArray(value) ? value.length === 0 : value.trim() === "";
    if (empty) {
      if (clearEmpty) values[key] = null;
    } else {
      values[key] = typeof value === "string" ? value.trim() : key === "PreferredTrainingDays" ? [...(value as number[])].sort() : value;
    }
  }
  return values;
}

/** The sensible ranges the form accepts (the API allows a wider range for unusual cases). */
const RANGES: Partial<Record<DetailKey, { min: number; max: number; integer?: boolean; message: (m: AppMessages) => string }>> = {
  Height: { min: 100, max: 250, message: (m) => m.onboarding.heightRange },
  Weight: { min: 30, max: 300, message: (m) => m.onboarding.weightRange },
  BodyFat: { min: 3, max: 60, message: (m) => m.onboarding.bodyFatRange },
  HrMax: { min: 100, max: 230, integer: true, message: (m) => m.onboarding.hrMaxRange },
  Sleep: { min: 0, max: 24, message: (m) => m.onboarding.sleepRange },
  Stress: { min: 0, max: 10, integer: true, message: (m) => m.onboarding.stressRange },
  SessionsPerWeek: { min: 0, max: 21, integer: true, message: (m) => m.onboarding.sessionsRange },
  AvailableSessionDuration: { min: 10, max: 300, integer: true, message: (m) => m.onboarding.durationRange },
};

/** Problems per field: out-of-range numbers, and missing values for the required keys. */
export function detailProblems(m: AppMessages, details: Details, keys: DetailKey[], required: DetailKey[] = []): Partial<Record<DetailKey, string>> {
  const problems: Partial<Record<DetailKey, string>> = {};
  for (const key of keys) {
    const value = details[key];
    const range = RANGES[key];
    if (typeof value === "number" && range && !Number.isNaN(value) && (value < range.min || value > range.max || (range.integer && !Number.isInteger(value)))) problems[key] = range.message(m);
    const empty = typeof value === "number" ? Number.isNaN(value) : Array.isArray(value) ? value.length === 0 : value.trim() === "";
    if (empty && required.includes(key)) problems[key] = m.auth.errors.required;
  }
  return problems;
}

/** Tanaka's formula (208 − 0.7 × age): a better population estimate than 220 − age. */
export function estimateHrMax(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/** Whole years between an ISO birth date and today. */
export function ageFrom(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** A select of fixed choices that still shows a stored value which is not one of them (e.g. saved in another language). */
function ChoiceSelect({ label, value, options, onChange, placeholder, isRequired, error }: { label: string; value: string; options: string[]; onChange: (value: string) => void; placeholder: string; isRequired?: boolean; error?: string }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Select label={label} placeholder={placeholder} selectedKey={value || null} onSelectionChange={(key) => onChange(key === null ? "" : String(key))} isRequired={isRequired} isInvalid={Boolean(error)} errorMessage={error}>
      {all.map((option) => (
        <Option key={option} id={option}>
          {option}
        </Option>
      ))}
    </Select>
  );
}

function ChipField({ label, children }: { label: string; children: (labelId: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className={styles.chipField}>
      <span id={id} className={styles.label}>
        {label}
      </span>
      {children(id)}
    </div>
  );
}

export function DetailFields({ group, value, onChange, problems = {}, required = [], age }: {
  group: DetailGroup;
  value: Details;
  onChange: (next: Details) => void;
  /** Shown only when the caller wants them (after a submit attempt, or while editing). */
  problems?: Partial<Record<DetailKey, string>>;
  required?: DetailKey[];
  /** For the heart-rate estimate. */
  age?: number | null;
}) {
  const m = useT();
  const t = m.onboarding;
  const set = <K extends DetailKey>(key: K, next: Details[K]) => onChange({ ...value, [key]: next });
  const number = (key: DetailKey, label: string, unit: string | undefined, placeholder: string, options: { fraction?: number; description?: string } = {}) => (
    <NumberInput
      label={label}
      unit={unit}
      placeholder={placeholder}
      value={value[key] as number}
      onChange={(next) => set(key, next as never)}
      minValue={0}
      formatOptions={{ maximumFractionDigits: options.fraction ?? 0 }}
      isRequired={required.includes(key)}
      isInvalid={Boolean(problems[key])}
      errorMessage={problems[key]}
      description={options.description}
    />
  );
  const u = m.profile.units;

  if (group === "body")
    return (
      <div className={styles.fields}>
        <Select label={t.sex} placeholder={t.choose} selectedKey={value.Sex || null} onSelectionChange={(key) => set("Sex", key === null ? "" : String(key))} isRequired={required.includes("Sex")} isInvalid={Boolean(problems.Sex)} errorMessage={problems.Sex}>
          {["Male", "Female", "Other"].map((key) => (
            <Option key={key} id={key}>
              {t.sexOptions[key]}
            </Option>
          ))}
        </Select>
        <div className={styles.pair}>
          {number("Height", t.height, u.cm, "175")}
          {number("Weight", t.weight, u.kg, "70", { fraction: 1 })}
        </div>
        <div className={styles.pair}>{number("BodyFat", t.bodyFat, u.percent, "18", { fraction: 1 })}</div>
      </div>
    );

  if (group === "heart") {
    const estimate = age ? estimateHrMax(age) : null;
    return (
      <div className={styles.fields}>
        <div className={styles.withAction}>
          {number("HrMax", t.hrMax, u.bpm, estimate ? String(estimate) : "190", { description: t.hrMaxHint })}
          {estimate && value.HrMax !== estimate ? (
            <Button size="sm" variant="ghost" onPress={() => set("HrMax", estimate)}>
              {t.hrMaxEstimate(estimate)}
            </Button>
          ) : null}
        </div>
        <div className={styles.pair}>
          {number("Sleep", t.sleep, u.hours, "7.5", { fraction: 1 })}
          {number("Stress", t.stress, undefined, "4", { description: t.stressHint })}
        </div>
      </div>
    );
  }

  if (group === "training")
    return (
      <div className={styles.fields}>
        <div className={styles.pair}>
          <ChoiceSelect label={t.experience} placeholder={t.choose} value={value.TrainingExperience} options={t.experienceOptions} onChange={(next) => set("TrainingExperience", next)} />
          <ChoiceSelect label={t.activity} placeholder={t.choose} value={value.ActivityLevel} options={t.activityOptions} onChange={(next) => set("ActivityLevel", next)} />
        </div>
        <div className={styles.pair}>
          {number("SessionsPerWeek", t.sessions, undefined, "3")}
          {number("AvailableSessionDuration", t.duration, u.minutes, "60")}
        </div>
        <ChipField label={t.days}>
          {(labelId) => (
            <ChipGroup aria-labelledby={labelId} selectionMode="multiple" selectedKeys={value.PreferredTrainingDays.map(String)} onSelectionChange={(keys) => set("PreferredTrainingDays", [...keys].map(Number).sort())}>
              {t.weekdays.map((day, index) => (
                <Chip key={day} id={String(index + 1)}>
                  {day}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </ChipField>
        <ChipField label={t.equipment}>
          {(labelId) => {
            const options = [...t.equipmentOptions, ...value.AvailableEquipment.filter((item) => !t.equipmentOptions.includes(item))];
            return (
              <ChipGroup aria-labelledby={labelId} selectionMode="multiple" selectedKeys={value.AvailableEquipment} onSelectionChange={(keys) => set("AvailableEquipment", options.filter((item) => keys.has(item)))}>
                {options.map((item) => (
                  <Chip key={item} id={item}>
                    {item}
                  </Chip>
                ))}
              </ChipGroup>
            );
          }}
        </ChipField>
      </div>
    );

  return (
    <div className={styles.fields}>
      <TextArea label={t.injuries} placeholder={t.injuriesPlaceholder} value={value.InjuriesLimitationsPainNotes} onChange={(next) => set("InjuriesLimitationsPainNotes", next)} maxLength={4000} />
      <TextArea label={t.notes} placeholder={t.notesPlaceholder} value={value.AdditionalNotes} onChange={(next) => set("AdditionalNotes", next)} maxLength={4000} />
    </div>
  );
}
