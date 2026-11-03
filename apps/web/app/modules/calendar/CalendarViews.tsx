import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { parseDate, parseAbsolute, startOfWeek } from "@internationalized/date";
import { daysForMonth, localDay, type CalendarView } from "./calendar-model";
import type { CalendarEvent, CalendarCheckIn } from "./api";
import styles from "./calendar.module.css";

export interface CalendarEntry { id: string; title: string; start: string; end: string; day?: string | null; until?: string | null; kind: string; status: string; event?: CalendarEvent; checkIn?: CalendarCheckIn }
export function onDay(entry: CalendarEntry, day: string, zone: string) {
  if (entry.day) return entry.day <= day && day < entry.until!;
  return localDay(entry.start, zone) <= day && localDay(new Date(new Date(entry.end).valueOf() - 1).toISOString(), zone) >= day;
}
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR = 48;
/** The all-day row fits two entries; with more, the first one shows and the rest collapse into "+N". */
const ALL_DAY_FIT = 2;
/** Shorter blocks have room for one line only: the title with the start time beside it. */
const COMPACT_MINUTES = 45;
const time = (iso: string, zone: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(iso));

export function CalendarViews({ view, date, today, zone, entries, select, open }: { view: CalendarView; date: string; today: string; zone: string; entries: CalendarEntry[]; select: (day: string) => void; open: (entry: CalendarEntry) => void }) {
  const uiCopy = useUiCopy();

  const renderMonth = (value: string, mini = false) => (
    <div className={mini ? styles.miniGrid : styles.monthGrid} role="grid" aria-label={new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value))}>
      {weekDays.map((d) => (
        <span className={styles.weekday} key={d} role="columnheader">
          {mini ? d.charAt(0) : d}
        </span>
      ))}
      {daysForMonth(value).map((day) => {
        const matches = entries.filter((e) => onDay(e, day, zone));
        const outside = day.slice(0, 7) !== value.slice(0, 7);
        if (mini)
          return (
            <button key={day} type="button" className={styles.miniDay} data-muted={outside || undefined} data-today={day === today || undefined} aria-pressed={day === date} aria-label={day} onClick={() => select(day)}>
              {Number(day.slice(-2))}
              {matches.length > 0 && !outside ? <span className={styles.dot} data-kind={matches[0]!.kind} /> : null}
            </button>
          );
        return (
          <div key={day} role="gridcell" className={styles.day} data-muted={outside || undefined} data-selected={day === date || undefined} onClick={() => select(day)}>
            <button type="button" className={styles.dayNumber} data-today={day === today || undefined} aria-label={day} aria-pressed={day === date} onClick={(event) => { event.stopPropagation(); select(day); }}>
              {Number(day.slice(-2))}
            </button>
            {matches.slice(0, 3).map((e) => (
              <button type="button" key={e.id} className={styles.entry} data-kind={e.kind} data-cancelled={e.status === "Cancelled" || undefined} onClick={(event) => { event.stopPropagation(); open(e); }} title={e.title}>
                <span className={styles.entryTime}>{e.day ? uiCopy["ui"]["All day"] : time(e.start, zone)}</span>
                <span className={styles.entryTitle}>{e.title}</span>
              </button>
            ))}
            {matches.length > 3 ? (
              <button type="button" className={styles.more} onClick={(event) => { event.stopPropagation(); select(day); }}>
                +{matches.length - 3}  {uiCopy["ui"]["more"]}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
  if (view === "year")
    return (
      <div className={styles.year}>
        {Array.from({ length: 12 }, (_, i) => {
          const value = parseDate(date).set({ month: i + 1, day: 1 }).toString();
          return (
            <section key={value} className={styles.yearMonth}>
              <h3>{new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(value))}</h3>
              {renderMonth(value, true)}
            </section>
          );
        })}
      </div>
    );
  if (view === "month") return renderMonth(date);
  const monday = startOfWeek(parseDate(date), "en-GB");
  const days = Array.from({ length: 7 }, (_, i) => monday.add({ days: i }).toString());
  return (
    <div className={styles.weekScroll}>
      <div className={styles.week}>
        <div className={styles.hours} aria-hidden="true">
          <span className={styles.hoursHead} />
          <span className={styles.hoursAllDay}>{uiCopy["ui"]["All day"]}</span>
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i}>{i ? `${String(i).padStart(2, "0")}:00` : ""}</span>
          ))}
        </div>
        {days.map((day, index) => (
          <section className={styles.weekDay} key={day} data-selected={date === day || undefined}>
            <button type="button" className={styles.weekHeading} aria-pressed={date === day} onClick={() => select(day)}>
              <span>{weekDays[index]}</span>
              <span className={styles.weekDate} data-today={day === today || undefined}>
                {Number(day.slice(-2))}
              </span>
            </button>
            {(() => {
              const allDay = entries.filter((e) => onDay(e, day, zone) && (e.day || e.checkIn));
              const shown = allDay.length > ALL_DAY_FIT ? allDay.slice(0, ALL_DAY_FIT - 1) : allDay;
              const hidden = allDay.length - shown.length;
              return <div className={styles.allDay}>
                {shown.map((e) => (
                  <button type="button" key={e.id} className={styles.entry} data-kind={e.kind} data-cancelled={e.status === "Cancelled" || undefined} onClick={() => open(e)} title={e.title}>
                    <span className={styles.entryTitle}>{e.title}</span>
                  </button>
                ))}
                {hidden > 0 ? (
                  <button type="button" className={styles.allDayMore} onClick={() => select(day)} title={allDay.slice(shown.length).map((e) => e.title).join(", ")}
                    aria-label={formatInterfaceText(uiCopy["ui"]["{0} more all-day {1} on {2}"], [hidden,hidden === 1 ? "item" : "items",day])}>
                    +{hidden}
                  </button>
                ) : null}
              </div>;
            })()}
            <div className={styles.timeLane}>
              {entries
                .filter((e) => onDay(e, day, zone) && !e.day && !e.checkIn)
                .map((e) => {
                  const start = parseAbsolute(e.start, zone);
                  const end = parseAbsolute(e.end, zone);
                  const minutes = localDay(e.start, zone) < day ? 0 : start.hour * 60 + start.minute;
                  const endMinutes = localDay(e.end, zone) > day ? 1440 : end.hour * 60 + end.minute;
                  return (
                    <button
                      type="button"
                      key={e.id}
                      className={styles.timeEntry}
                      data-kind={e.kind}
                      data-cancelled={e.status === "Cancelled" || undefined}
                      data-compact={endMinutes - minutes < COMPACT_MINUTES || undefined}
                      style={{ top: (minutes / 60) * HOUR, height: Math.max(20, ((endMinutes - minutes) / 60) * HOUR - 2) }}
                      title={`${e.title} · ${time(e.start, zone)} – ${time(e.end, zone)}`}
                      onClick={() => open(e)}
                    >
                      <span className={styles.entryTitle}>{e.title}</span>
                      <small>
                        {endMinutes - minutes < COMPACT_MINUTES ? time(e.start, zone) : `${time(e.start, zone)} – ${time(e.end, zone)}`}
                      </small>
                    </button>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
