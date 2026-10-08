import { parseDate, startOfMonth, endOfMonth, startOfWeek, toZoned, toCalendarDateTime, parseAbsolute, toCalendarDate } from "@internationalized/date";

export type CalendarView = "week" | "month" | "year";
export function daysForMonth(value: string): string[] {
  const month = parseDate(value);
  let day = startOfWeek(startOfMonth(month), "en-GB");
  const end = startOfWeek(endOfMonth(month), "en-GB").add({ days: 7 });
  const days: string[] = [];
  while (day.compare(end) < 0) { days.push(day.toString()); day = day.add({ days: 1 }); }
  return days;
}
export function visibleRange(view: CalendarView, value: string, zone: string) {
  const date = parseDate(value);
  const start = view === "year" ? date.set({ month: 1, day: 1 }) : view === "week" ? startOfWeek(date, "en-GB") : parseDate(daysForMonth(value)[0]!);
  const end = view === "year" ? start.add({ years: 1 }) : view === "week" ? start.add({ days: 7 }) : parseDate(daysForMonth(value).at(-1)!).add({ days: 1 });
  return { from: toZoned(toCalendarDateTime(start), zone).toDate().toISOString(), to: toZoned(toCalendarDateTime(end), zone).toDate().toISOString() };
}
export function localDay(instant: string, zone: string) { return toCalendarDate(parseAbsolute(instant, zone)).toString(); }
export function moveDate(value: string, view: CalendarView, amount: number) {
  return parseDate(value).add(view === "year" ? { years: amount } : view === "month" ? { months: amount } : { days: amount * 7 }).toString();
}
export function validDate(value: string | null, fallback: string) {
  try { const date = parseDate(value ?? ""); return date.year >= 2000 && date.year <= 2100 ? date.toString() : fallback; } catch { return fallback; }
}
