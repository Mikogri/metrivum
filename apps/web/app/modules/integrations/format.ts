/** Date and "time ago" formatting for the integration screens, in the app's language. */
export function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [["minute", 60], ["hour", 24], ["day", 7], ["week", 4.35], ["month", 12], ["year", Infinity]];

/** "2 hours ago" / "2 godziny temu". */
export function formatAgo(value: string, locale: string, now = Date.now()) {
  let amount = (new Date(value).getTime() - now) / 60_000;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of STEPS) {
    if (Math.abs(amount) < size) return format.format(Math.round(amount), unit);
    amount /= size;
  }
  return format.format(Math.round(amount), "year");
}
