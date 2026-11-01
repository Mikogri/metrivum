import { CalendarClock } from "lucide-react";
import { EmptyState } from "@metrivum/ui-web";
import { daysForMonth } from "./calendar-model";
import { onDay, type CalendarEntry } from "./CalendarViews";
import styles from "./calendar.module.css";

export function MobileAgenda({ entries, date, zone, open }: { entries: CalendarEntry[]; date: string; zone: string; open: (entry: CalendarEntry) => void }) {
  const days = daysForMonth(date).filter(day => day.slice(0, 7) === date.slice(0, 7));
  const month = entries.filter(entry => days.some(day => onDay(entry, day, zone)))
    .sort((a, b) => (a.day ?? a.start).localeCompare(b.day ?? b.start));
  const day = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const when = (entry: CalendarEntry) => {
    if (entry.day && entry.until) {
      const lastDay = new Date(Date.parse(`${entry.until}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      return `${day(entry.day)}${lastDay !== entry.day ? ` – ${day(lastDay)}` : ""} · All day`;
    }
    const start = new Date(entry.start).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: zone });
    const end = new Date(entry.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone });
    return `${start} – ${end}`;
  };
  return month.length ? (
    <ul className={styles.mobileAgenda} aria-label="This month's agenda">
      {month.map(entry => <li key={`${entry.kind}-${entry.id}`}>
        <button type="button" className={styles.agendaItem} onClick={() => open(entry)}>
          <span className={styles.agendaBody} data-kind={entry.kind}>
            <strong>{entry.title}</strong>
            <span>{when(entry)}</span>
            <span>{entry.kind}{entry.status !== "Scheduled" ? ` · ${entry.status}` : ""}{entry.checkIn ? ` · due ${new Date(entry.end).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: zone })}` : ""}</span>
          </span>
        </button>
      </li>)}
    </ul>
  ) : <EmptyState icon={<CalendarClock />} title="Nothing planned this month" description="Try another month or change your filters. Meetings, events and check-ins appear here." />;
}
