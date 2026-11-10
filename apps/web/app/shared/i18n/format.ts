import { intlLocale, type Locale } from "./locale";

const numberCache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions = {}) {
  const key = `${locale}:${JSON.stringify(options)}`;
  let format = numberCache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(intlLocale(locale), options);
    numberCache.set(key, format);
  }
  return format;
}

export function formatNumber(
  locale: Locale,
  value: number,
  maximumFractionDigits = 2,
) {
  return numberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatBytes(locale: Locale, bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${formatNumber(locale, value, unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatDate(
  locale: Locale,
  iso: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  timeZone?: string,
) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...options,
    timeZone,
  }).format(new Date(iso));
}

export function formatDateTime(locale: Locale, iso: string, timeZone?: string) {
  return formatDate(
    locale,
    iso,
    { dateStyle: "medium", timeStyle: "short" },
    timeZone,
  );
}

/** "2 hours ago" style label; falls back to a date after a week. */
export function formatRelative(locale: Locale, iso: string, now = Date.now()) {
  const diffSeconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  if (abs < 60) return rtf.format(diffSeconds, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 7 * 86400)
    return rtf.format(Math.round(diffSeconds / 86400), "day");
  return formatDate(locale, iso);
}

/**
 * Parses user-typed decimals for the active locale. "2,5" in Polish is 2.5, never 25.
 * Grouping separators are only accepted in the locale's own grouping position.
 */
export function parseLocaleNumber(
  locale: Locale,
  input: string,
): number | null {
  // Spaces (incl. no-break and narrow no-break spaces) are grouping separators in Polish and harmless in English.
  const compact = input.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (compact === "") return null;
  let normalized: string;
  if (locale === "pl") {
    // Polish decimal comma; a lone "." is also accepted as a decimal point when pasting.
    if (compact.includes(",") && compact.includes(".")) return null;
    normalized = compact.replace(",", ".");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) {
    normalized = compact.replace(/,/g, "");
  } else if (compact.includes(",")) {
    // "2,5" in English is ambiguous: refuse instead of silently reading 25.
    return null;
  } else {
    normalized = compact;
  }
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
