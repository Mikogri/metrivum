import type { Prescription, Quantity, QuantityRange, Unit } from "@metrivum/api-client-web";
import { formatNumber, parseLocaleNumber } from "~/shared/i18n/format";
import type { Locale } from "~/shared/i18n/locale";

/**
 * Short notation used in grid cells. Parsing returns typed prescription fields; it never stores
 * free text in numeric fields. Anything it can't parse is reported, not guessed.
 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false };

const RANGE_SPLIT = /\s*(?:-|–|—|\.\.)\s*/;

export function parseReps(input: string): ParseResult<Prescription["reps"]> {
  const text = input.trim();
  if (!text) return { ok: true, value: null };
  const parts = text.split(RANGE_SPLIT);
  if (parts.length > 2 || parts.some((p) => !/^\d{1,5}$/.test(p))) return { ok: false };
  const min = Number(parts[0]);
  const max = Number(parts[1] ?? parts[0]);
  if (min < 1 || max < min || max > 10000) return { ok: false };
  return { ok: true, value: { minimum: min, maximum: max } };
}

const MASS_UNITS: Record<string, Unit> = { kg: "Kg", kgs: "Kg", lb: "Lb", lbs: "Lb" };

export type LoadParse =
  | { kind: "none" }
  | { kind: "absolute"; load: QuantityRange }
  | { kind: "percent"; percent: number };

export function parseLoad(locale: Locale, input: string, defaultUnit: Unit = "Kg"): ParseResult<LoadParse> {
  const text = input.trim().toLowerCase();
  if (!text) return { ok: true, value: { kind: "none" } };
  const percent = /^(.+?)\s*%$/.exec(text);
  if (percent) {
    const value = parseLocaleNumber(locale, percent[1]!);
    if (value === null || value <= 0 || value > 1000) return { ok: false };
    return { ok: true, value: { kind: "percent", percent: value } };
  }
  const unitMatch = /\s*(kgs?|lbs?)$/.exec(text);
  const unit = unitMatch ? MASS_UNITS[unitMatch[1]!]! : defaultUnit;
  const body = unitMatch ? text.slice(0, unitMatch.index) : text;
  // Only split on a dash that separates two numbers, so "-5" is rejected rather than misread.
  const parts = body.split(/\s*(?:–|—|\.\.|(?<=\d)\s*-\s*(?=\d))\s*/);
  if (parts.length > 2) return { ok: false };
  const values = parts.map((p) => parseLocaleNumber(locale, p));
  if (values.some((v) => v === null || v < 0 || v > 1_000_000_000)) return { ok: false };
  const min = values[0]!;
  const max = values[1] ?? min;
  if (max! < min!) return { ok: false };
  return { ok: true, value: { kind: "absolute", load: { minimum: { value: min!, unit }, maximum: { value: max!, unit } } } };
}

export type EffortParse = { rpe: number | null; rir: number | null };

export function parseEffort(locale: Locale, input: string): ParseResult<EffortParse> {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { ok: true, value: { rpe: null, rir: null } };
  // "8", "@8", "RPE 8", "8 rpe" → RPE; "RIR 2", "r2", "2 rir" → RIR.
  let match = /^(?:rpe ?|@ ?)?([\d.,]+)(?: ?rpe)?$/.exec(text);
  let kind: "rpe" | "rir" = "rpe";
  if (!match) {
    match = /^(?:rir ?|r ?)([\d.,]+)$/.exec(text) ?? /^([\d.,]+) ?rir$/.exec(text);
    kind = "rir";
  }
  if (!match) return { ok: false };
  const value = parseLocaleNumber(locale, match[1]!);
  if (value === null) return { ok: false };
  if (kind === "rir") return value < 0 || value > 100 ? { ok: false } : { ok: true, value: { rpe: null, rir: value } };
  return value < 0 || value > 10 ? { ok: false } : { ok: true, value: { rpe: value, rir: null } };
}

export function parseDuration(locale: Locale, input: string): ParseResult<Quantity | null> {
  const text = input.trim().toLowerCase();
  if (!text) return { ok: true, value: null };
  const clock = /^(?:(\d{1,3}):)?(\d{1,3}):([0-5]\d)$/.exec(text);
  if (clock && (clock[1] === undefined || Number(clock[2]) < 60)) return { ok: true, value: { value: Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]), unit: "Seconds" } };
  const match = /^([\d.,]+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|')?$/.exec(text);
  if (!match) return { ok: false };
  const value = parseLocaleNumber(locale, match[1]!);
  if (value === null || value < 0 || value > 1_000_000_000) return { ok: false };
  const minutes = match[2] && /^(m|min|mins|minutes?|')$/.test(match[2]);
  return { ok: true, value: { value, unit: minutes ? "Minutes" : "Seconds" } };
}

export function parseDistance(locale: Locale, input: string): ParseResult<Quantity | null> {
  const text = input.trim().toLowerCase();
  if (!text) return { ok: true, value: null };
  const match = /^([\d.,]+)\s*(m|km)?$/.exec(text);
  if (!match) return { ok: false };
  const value = parseLocaleNumber(locale, match[1]!);
  if (value === null || value < 0) return { ok: false };
  return { ok: true, value: { value, unit: match[2] === "km" ? "Kilometers" : "Meters" } };
}

export const TEMPO_PATTERN = /^(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)-(?:\d{1,2}|X)$/;

export function parseTempo(input: string): ParseResult<string | null> {
  const text = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!text) return { ok: true, value: null };
  return TEMPO_PATTERN.test(text) ? { ok: true, value: text } : { ok: false };
}

// Formatting --------------------------------------------------------------------------------------

const UNIT_LABEL: Record<Unit, string> = { Scalar: "", Kg: "kg", Lb: "lb", Seconds: "s", Minutes: "min", Meters: "m", Kilometers: "km", Percent: "%" };

export function formatQuantity(locale: Locale, quantity: Quantity): string {
  const label = UNIT_LABEL[quantity.unit];
  return label ? `${formatNumber(locale, quantity.value)} ${label}` : formatNumber(locale, quantity.value);
}

export function formatReps(reps: Prescription["reps"]): string {
  if (!reps) return "";
  return reps.minimum === reps.maximum ? String(reps.minimum) : `${reps.minimum}–${reps.maximum}`;
}

export function formatLoad(locale: Locale, p: Prescription, formulaLabel?: (key: string) => string): string {
  if (p.load) {
    const { minimum, maximum } = p.load;
    if (minimum.value === maximum.value && minimum.unit === maximum.unit) return formatQuantity(locale, minimum);
    return minimum.unit === maximum.unit
      ? `${formatNumber(locale, minimum.value)}–${formatNumber(locale, maximum.value)} ${UNIT_LABEL[minimum.unit]}`
      : `${formatQuantity(locale, minimum)}–${formatQuantity(locale, maximum)}`;
  }
  if (p.loadPercent !== null && p.loadPercent !== undefined) {
    const base = p.baseValue ? ` · ${formatQuantity(locale, p.baseValue)}` : "";
    return `${formatNumber(locale, p.loadPercent)}%${base}`;
  }
  if (p.loadFormula) {
    const name = p.loadFormula.builtIn ? (formulaLabel?.(p.loadFormula.builtIn) ?? p.loadFormula.builtIn) : "ƒ";
    return `ƒ ${name}`;
  }
  return "";
}

export function formatEffort(locale: Locale, p: Prescription): string {
  if (p.rpe !== null && p.rpe !== undefined) return `RPE ${formatNumber(locale, p.rpe, 1)}`;
  if (p.rir !== null && p.rir !== undefined) return `RIR ${formatNumber(locale, p.rir, 1)}`;
  return "";
}

export function formatDuration(locale: Locale, quantity: Quantity | null | undefined): string {
  return quantity ? formatQuantity(locale, quantity) : "";
}

/** Editable text for a cell (what the input starts with when editing). */
export function editText(locale: Locale, column: string, p: Prescription): string {
  switch (column) {
    case "reps":
      return formatReps(p.reps);
    case "load":
      if (p.loadPercent !== null && p.loadPercent !== undefined) return `${formatNumber(locale, p.loadPercent)}%`;
      return p.load ? formatLoad(locale, p) : "";
    case "effort":
      return formatEffort(locale, p);
    case "rest":
      return formatDuration(locale, p.rest);
    case "tempo":
      return p.tempo ?? "";
    case "notes":
      return p.comment ?? "";
    default:
      return "";
  }
}
