/**
 * Plain-language summary and upcoming release dates of a check-in schedule, for the editor's preview card.
 * Only a preview: the API decides the real releases (time zones, daylight saving, program cycles).
 */
export type RecurrenceDraft = {
  kind: "OneTime" | "EveryNDays" | "EveryNWeeks" | "Monthly" | "AssignedProgramCycle";
  interval: number | string;
  startDate: string;
  weekDays?: (number | string)[] | null;
  dayOfMonth?: number | string | null;
};

const DAY = 86_400_000;
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
};
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

/** The next `count` release dates on or after `today` (ISO dates), at most a year ahead. */
export function nextReleases(r: RecurrenceDraft, today: string, count = 3): string[] {
  const start = utc(r.startDate);
  const from = Math.max(start, utc(today));
  const interval = Math.max(1, Number(r.interval) || 1);
  const out: string[] = [];
  const limit = from + 366 * DAY;
  if (r.kind === "OneTime") return start >= utc(today) ? [r.startDate] : [];
  if (r.kind === "EveryNDays") {
    const steps = Math.max(0, Math.ceil((from - start) / (interval * DAY)));
    for (let t = start + steps * interval * DAY; out.length < count && t <= limit; t += interval * DAY) out.push(iso(t));
  } else if (r.kind === "EveryNWeeks") {
    const days = (r.weekDays ?? []).map(Number);
    if (!days.length) return [];
    // Weeks count from the Monday of the start week.
    const startDay = new Date(start).getUTCDay();
    const weekStart = start - ((startDay + 6) % 7) * DAY;
    for (let t = from; out.length < count && t <= limit; t += DAY) {
      const week = Math.floor((t - weekStart) / (7 * DAY));
      if (t >= start && week % interval === 0 && days.includes(new Date(t).getUTCDay())) out.push(iso(t));
    }
  } else if (r.kind === "Monthly") {
    const wanted = Math.min(31, Math.max(1, Number(r.dayOfMonth) || 1));
    const first = new Date(start);
    for (let i = 0; out.length < count && i < 60; i += interval) {
      const y = first.getUTCFullYear();
      const m = first.getUTCMonth() + i;
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const t = Date.UTC(y, m, Math.min(wanted, last));
      if (t >= from && t >= start) out.push(iso(t));
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Every 2 weeks on Mon and Thu", "Once", "Every day", "Monthly on day 15", … */
export function describeRecurrence(r: RecurrenceDraft, programName?: string, cycleDays?: number[]): string {
  const n = Math.max(1, Number(r.interval) || 1);
  switch (r.kind) {
    case "OneTime":
      return "Once";
    case "EveryNDays":
      return n === 1 ? "Every day" : `Every ${plural(n, "day", "days")}`;
    case "EveryNWeeks": {
      const days = WEEKDAY_ORDER.filter((d) => (r.weekDays ?? []).map(Number).includes(d)).map((d) => WEEKDAY_NAMES[d]!);
      const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : days[0] ?? "no day yet";
      return `${n === 1 ? "Every week" : `Every ${plural(n, "week", "weeks")}`} on ${list}`;
    }
    case "Monthly":
      return `${n === 1 ? "Every month" : `Every ${plural(n, "month", "months")}`} on day ${Number(r.dayOfMonth) || 1}`;
    case "AssignedProgramCycle":
      return `On ${cycleDays?.length ? `day ${cycleDays.sort((a, b) => a - b).join(", ")}` : "chosen days"} of each cycle${programName ? ` of ${programName}` : ""}`;
  }
}

/** 48 → "2 days", 36 → "36 hours", 168 → "1 week". */
export function describeWindow(hours: number): string {
  if (hours > 0 && hours % 168 === 0) return plural(hours / 168, "week", "weeks");
  if (hours > 0 && hours % 24 === 0) return plural(hours / 24, "day", "days");
  return plural(hours, "hour", "hours");
}
