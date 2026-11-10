const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** How long ago a date was, in the largest fitting unit: "today", "12 days ago", "3 months ago", "2 years ago". */
export function elapsed(iso: string, now = Date.now()) {
  const days = Math.max(
    0,
    Math.floor((now - new Date(iso).getTime()) / 86_400_000),
  );
  if (days < 31) return format.format(-days, "day");
  if (days < 365) return format.format(-Math.floor(days / 30.44), "month");
  return format.format(-Math.floor(days / 365.25), "year");
}
