import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Calendar — Metrivum");

import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { today } from "@internationalized/date";
import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Button, Dialog, EmptyState, IconButton, LinkButton, PageHeader, Segment, SegmentedControl, Spinner, useMobileLayout } from "@metrivum/ui-web";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { useProfile } from "~/modules/accounts";
import { Failure, Loading, ScheduleEditorPanel, type ScheduleSeed } from "~/modules/coaching";
import { useCalendarRange, type CalendarEvent, type CalendarCheckIn } from "../api";
import { CalendarViews, onDay, type CalendarEntry } from "../CalendarViews";
import { EventEditor } from "../EventEditor";
import { EventDetail } from "../EventDetail";
import { MobileAgenda } from "../MobileAgenda";
import { moveDate, validDate, visibleRange, type CalendarView } from "../calendar-model";
import styles from "../calendar.module.css";

const KINDS = [
  ["Meeting", "Meetings"],
  ["Event", "Events"],
  ["Check-in", "Check-ins"],
] as const;

// The calendar fills the window below the app bar; only the week view and the agenda scroll inside.
export const handle = { fit: true };

export default function CalendarRoute() {
  const mobile = useMobileLayout();
  const [showOptions, setShowOptions] = useState(false);
  const { mode } = useWorkspace();
  const profile = useProfile();
  const zone = profile.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const currentDay = today(zone).toString();
  const date = validDate(params.get("date"), currentDay);
  const view = (mobile ? "month" : ["month", "week", "year"].includes(params.get("view") ?? "") ? params.get("view") : "month") as CalendarView;
  const range = visibleRange(view, date, zone);
  const events = useCalendarRange<CalendarEvent>("/api/v1/calendar/events", range, zone);
  const requests = useCalendarRange<CalendarCheckIn>("/api/v1/check-ins/calendar", range, zone, "Request");
  const planned = useCalendarRange<CalendarCheckIn>("/api/v1/check-ins/calendar", range, zone, mode === "coach" ? "Planned" : "Request");
  const [filters, setFilters] = useState<string[]>(KINDS.map(([kind]) => kind));
  const [editor, setEditor] = useState<{ kind: "Meeting" | "Event"; initial?: CalendarEvent } | null>(null);
  const detail = params.get("event") || null;
  const setDetail = (id: string | null) => {
    if (id === detail) return;
    const next = new URLSearchParams(params);
    if (id) next.set("event", id);
    else next.delete("event");
    setParams(next, { replace: id === null });
  };
  const [scheduling, setScheduling] = useState<ScheduleSeed | null>(null);
  const dirty = useRef(false);
  const { confirm, dialog } = useDiscardConfirm();
  const coach = mode === "coach";
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setParams(next);
  };
  const entries: CalendarEntry[] = [
    ...(events.data ?? []).map((e) => ({ id: e.id, title: e.title, start: e.startsAtUtc, end: e.endsAtUtc, day: e.startDate, until: e.endDateExclusive, kind: e.kind, status: e.cancelled ? "Cancelled" : (e.response ?? "Scheduled"), event: e })),
    ...[...(requests.data ?? []), ...(coach ? (planned.data ?? []) : [])].map((c) => ({ id: c.id, title: c.name, start: c.availableAtUtc, end: c.dueAtUtc, kind: "Check-in", status: c.status, checkIn: c })),
  ].filter((e) => filters.includes(e.kind));
  const open = (e: CalendarEntry) => (e.event ? setDetail(e.event.id) : navigate(e.checkIn?.requestId ? `/app/check-ins/${e.checkIn.requestId}` : `/app/check-in-schedules/${e.checkIn!.scheduleId}`));
  const agenda = entries.filter((e) => onDay(e, date, zone)).sort((a, b) => a.start.localeCompare(b.start));
  const pending = events.isPending || requests.isPending || (coach && planned.isPending);
  const fetching = events.isPlaceholderData || requests.isPlaceholderData || (coach && planned.isPlaceholderData);
  const failures = [events, requests, ...(coach ? [planned] : [])].filter((q) => q.isError);
  const label = new Intl.DateTimeFormat("en-GB", view === "year" ? { year: "numeric", timeZone: "UTC" } : { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date));
  const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date));
  const time = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(new Date(iso));
  const closeEditor = async () => {
    if (dirty.current && !(await confirm())) return;
    dirty.current = false;
    setEditor(null);
  };

  const filterControls = <div className={styles.filters} role="group" aria-label="Show">
    {KINDS.map(([kind, text]) => <button key={kind} type="button" className={styles.filter} data-kind={kind} aria-pressed={filters.includes(kind)} onClick={() => setFilters(filters.includes(kind) ? filters.filter(f => f !== kind) : [...filters, kind])}>{text}</button>)}
    <span className={styles.zone}>{zone.replace(/_/g, " ")}</span>
  </div>;

  return (
    <>
      <PageHeader
        title="Calendar"
        description={mobile ? undefined : coach ? "Your meetings, events and client check-ins, together." : "Your upcoming meetings, invitations and check-ins."}
        actions={
          mobile ? <>
            <IconButton label="Calendar filters and actions" icon={<SlidersHorizontal />} onPress={() => setShowOptions(true)} />
            {coach && <IconButton label="New meeting" icon={<Plus />} variant="secondary" onPress={() => setEditor({ kind: "Meeting" })} />}
          </> : coach ? (
            <>
              <LinkButton href="/app/check-in-schedules" iconStart={<CalendarClock />}>
                Check-in schedules
              </LinkButton>
              <Button iconStart={<CalendarPlus />} onPress={() => setEditor({ kind: "Event" })}>
                New event
              </Button>
              <Button variant="primary" iconStart={<Plus />} onPress={() => setEditor({ kind: "Meeting" })}>
                New meeting
              </Button>
            </>
          ) : null
        }
      />
      <div className={styles.layout}>
        <section className={styles.calendar} aria-label="Calendar">
          <div className={styles.toolbar}>
            <div className={styles.period}>
              <Button size="sm" variant="secondary" isDisabled={date === currentDay} onPress={() => update({ date: currentDay })}>
                Today
              </Button>
              <IconButton label="Previous period" icon={<ChevronLeft />} variant="ghost" size="sm" onPress={() => update({ date: moveDate(date, view, -1) })} />
              <IconButton label="Next period" icon={<ChevronRight />} variant="ghost" size="sm" onPress={() => update({ date: moveDate(date, view, 1) })} />
              <h2 aria-live="polite">{label}</h2>
              {fetching && !pending ? <Spinner size="sm" label="Updating calendar" /> : null}
            </div>
            {!mobile && <SegmentedControl aria-label="Calendar view" size="sm" selectedKeys={[view]} onSelectionChange={(keys) => update({ view: String([...keys][0]) })}>
              <Segment id="week">Week</Segment>
              <Segment id="month">Month</Segment>
              <Segment id="year">Year</Segment>
            </SegmentedControl>}
          </div>
          {!mobile && filterControls}
          {failures.map((q, i) => (
            <Failure key={i} error={q.error} retry={() => void q.refetch()} />
          ))}
          {pending ? <Loading /> : <div className={styles.views} data-stale={fetching || undefined}>{mobile ? <MobileAgenda entries={entries} date={date} zone={zone} open={open} /> : <CalendarViews view={view} date={date} today={currentDay} zone={zone} entries={entries} select={(day) => update({ date: day })} open={open} />}</div>}
        </section>

        {!mobile && <aside className={styles.agenda} aria-label="Selected day">
          <div className={styles.agendaHead}>
            <div>
              <h2>{dayLabel}</h2>
              <p>{date === currentDay ? "Today" : agenda.length ? `${agenda.length} ${agenda.length === 1 ? "item" : "items"}` : "Nothing planned"}</p>
            </div>
          </div>
          {!pending && !agenda.length ? (
            <EmptyState size="sm" icon={<CalendarPlus />} title="Nothing scheduled" description={coach ? "Add a meeting or plan a check-in for this day." : "Meetings and check-ins for this day show up here."} />
          ) : (
            <ul className={styles.agendaList}>
              {agenda.map((e) => (
                <li key={e.id}>
                  <button type="button" className={styles.agendaItem} onClick={() => open(e)}>
                    <span className={styles.agendaTime}>{e.day ? "All day" : time(e.start)}</span>
                    <span className={styles.agendaBody} data-kind={e.kind}>
                      <strong>{e.title}</strong>
                      <span>
                        {e.kind}
                        {e.checkIn ? ` · due ${new Date(e.end).toLocaleDateString("en-GB", { timeZone: zone, day: "numeric", month: "short" })}` : e.status !== "Scheduled" ? ` · ${e.status}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {coach ? (
            <div className={styles.agendaFooter}>
              <Button size="sm" iconStart={<Plus />} onPress={() => setEditor({ kind: "Meeting" })}>
                Meeting
              </Button>
              <Button size="sm" variant="ghost" iconStart={<CalendarClock />} onPress={() => setScheduling({ date, timeZone: zone })}>
                Schedule check-in
              </Button>
            </div>
          ) : null}
        </aside>}
      </div>
      {dialog}
      <Dialog title="Calendar filters and actions" isOpen={mobile && showOptions} onOpenChange={setShowOptions}>
        {filterControls}
        {coach && <div className={styles.mobileActions}>
          <Button variant="primary" iconStart={<Plus />} onPress={() => { setShowOptions(false); setEditor({ kind: "Meeting" }); }}>New meeting</Button>
          <Button iconStart={<CalendarPlus />} onPress={() => { setShowOptions(false); setEditor({ kind: "Event" }); }}>New event</Button>
          <Button iconStart={<CalendarClock />} onPress={() => { setShowOptions(false); setScheduling({ date, timeZone: zone }); }}>Schedule check-in</Button>
          <LinkButton href="/app/check-in-schedules" onPress={() => setShowOptions(false)}>Check-in schedules</LinkButton>
        </div>}
        <Button onPress={() => setShowOptions(false)}>Done</Button>
      </Dialog>
      <Dialog
        title={editor ? `${editor.initial ? "Edit" : "New"} ${editor.kind.toLowerCase()}` : "Event"}
        description={editor?.kind === "Meeting" ? "Invited clients get the invitation and can accept or decline." : editor ? "Something on the calendar, such as a race or a deload week." : undefined}
        size="lg"
        isOpen={editor !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) void closeEditor();
        }}
      >
        {editor ? (
          <EventEditor
            key={editor.initial?.id ?? editor.kind}
            date={date}
            zone={zone}
            kind={editor.kind}
            initial={editor.initial}
            cancel={() => void closeEditor()}
            dirtyChanged={(value) => {
              dirty.current = value;
            }}
            saved={(event) => {
              dirty.current = false;
              setEditor(null);
              setDetail(editor.initial || editor.kind !== "Meeting" ? event.id : null);
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        title="Details"
        size="lg"
        isOpen={detail !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDetail(null);
        }}
      >
        {detail ? (
          <EventDetail
            id={detail}
            close={() => setDetail(null)}
            edit={(event) => {
              setDetail(null);
              setEditor({ kind: event.kind, initial: event });
            }}
          />
        ) : null}
      </Dialog>
      <ScheduleEditorPanel isOpen={scheduling !== null} seed={scheduling ?? undefined} onClose={() => setScheduling(null)} />
    </>
  );
}
