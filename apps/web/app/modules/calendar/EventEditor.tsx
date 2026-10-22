import { useCallback, useMemo, useState } from "react";
import { parseAbsolute, parseDate, parseDateTime, parseTime, parseZonedDateTime } from "@internationalized/date";
import { Alert, Button, Combobox, DateField, DialogFooter, Option, Switch, TextArea, TextField, TimeField } from "@trainflow/ui-web";
import { MutationError, RecipientPicker, useCoachingMutation } from "~/modules/coaching";
import { timeZones } from "~/modules/accounts";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import type { CalendarEvent } from "./api";
import styles from "./calendar.module.css";

const plusDays = (day: string, n: number) => parseDate(day).add({ days: n }).toString();

/** Meeting / event form for the side panel: when, where, who. Ends with Cancel / Save. */
export function EventEditor({
  date,
  zone,
  kind,
  initial,
  saved,
  cancel,
  dirtyChanged,
}: {
  date: string;
  zone: string;
  kind: "Meeting" | "Event";
  initial?: CalendarEvent;
  saved: (event: CalendarEvent) => void;
  cancel: () => void;
  dirtyChanged: (dirty: boolean) => void;
}) {
  const zones = useMemo(() => timeZones(), []);
  const local = (value: string) => parseAbsolute(value, initial?.timeZone ?? zone).toString().slice(0, 16);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? zone);
  const [allDay, setAllDay] = useState(Boolean(initial?.startDate));
  const [start, setStart] = useState(initial && !initial.startDate ? local(initial.startsAtUtc) : `${date}T09:00`);
  const [end, setEnd] = useState(initial && !initial.startDate ? local(initial.endsAtUtc) : `${date}T10:00`);
  const [firstDay, setFirstDay] = useState(initial?.startDate ?? date);
  // Shown inclusive; the API takes the exclusive end date.
  const [lastDay, setLastDay] = useState(initial?.endDateExclusive ? plusDays(initial.endDateExclusive, -1) : date);
  const [location, setLocation] = useState(initial?.location ?? "");
  const [url, setUrl] = useState(initial?.meetingUrl ?? "");
  const [relationships, setRelationships] = useState(initial?.attendees?.map((a) => a.relationshipId) ?? []);
  const [groups, setGroups] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const mark = () => {
    setDirty(true);
    dirtyChanged(true);
  };
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      mark();
    };
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const mutation = useCoachingMutation<CalendarEvent>((e) => {
    setDirty(false);
    dirtyChanged(false);
    saved(e);
  });

  // Moving the start keeps the meeting's length.
  const changeStart = (next: string) => {
    const minutes = Math.round((Date.parse(`${end}:00Z`) - Date.parse(`${start}:00Z`)) / 60000);
    setStart(next);
    setEnd(parseDateTime(next).add({ minutes: minutes > 0 ? minutes : 60 }).toString().slice(0, 16));
    mark();
  };
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);

  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        try {
          const startsAtUtc = allDay ? null : parseZonedDateTime(`${start}[${timeZone}]`, "reject").toDate().toISOString();
          const endsAtUtc = allDay ? null : parseZonedDateTime(`${end}[${timeZone}]`, "reject").toDate().toISOString();
          if (allDay ? lastDay < firstDay : endsAtUtc! <= startsAtUtc!) {
            setError("The end must come after the start.");
            return;
          }
          mutation.mutate({
            method: initial ? "PATCH" : "POST",
            path: `/api/v1/calendar/events${initial ? `/${initial.id}` : ""}`,
            ifMatch: initial?.version,
            json: {
              kind,
              title: title.trim(),
              description,
              timeZone,
              startsAtUtc,
              endsAtUtc,
              startDate: allDay ? firstDay : null,
              endDateExclusive: allDay ? plusDays(lastDay, 1) : null,
              location: location || null,
              meetingUrl: url || null,
              relationshipIds: relationships,
              groupIds: groups,
            },
          });
        } catch {
          setError("This local time is skipped or repeated by a daylight-saving change. Pick another time or time zone.");
        }
      }}
    >
      <section className={styles.editorSection}>
        <TextField label="Title" placeholder={kind === "Meeting" ? "e.g. Monthly progress review" : "e.g. Club 10K race"} isRequired maxLength={200} value={title} onChange={edit(setTitle)} autoFocus />
        <TextArea label="Description" placeholder="Optional, agenda or what to prepare" maxLength={10000} value={description} onChange={edit(setDescription)} />
      </section>

      <section className={styles.editorSection}>
        <h3>When</h3>
        {kind === "Event" ? (
          <Switch isSelected={allDay} onChange={edit(setAllDay)}>
            All day
          </Switch>
        ) : null}
        {allDay ? (
          <div className={styles.columns}>
            <DateField label="First day" isRequired value={parseDate(firstDay)} onChange={(v) => { if (v) { setFirstDay(v.toString()); if (lastDay < v.toString()) setLastDay(v.toString()); mark(); } }} />
            <DateField label="Last day" isRequired value={parseDate(lastDay)} onChange={(v) => v && edit(setLastDay)(v.toString())} />
          </div>
        ) : (
          <>
            <div className={styles.columns3}>
              <DateField label="Starts" isRequired value={parseDate(startDate)} onChange={(v) => v && changeStart(`${v.toString()}T${start.slice(11)}`)} />
              <TimeField label="From" isRequired hourCycle={24} value={parseTime(start.slice(11))} onChange={(v) => v && changeStart(`${startDate}T${v.toString().slice(0, 5)}`)} />
              <TimeField label="To" isRequired hourCycle={24} value={parseTime(end.slice(11))} onChange={(v) => v && edit(setEnd)(`${endDate}T${v.toString().slice(0, 5)}`)} />
            </div>
            {endDate !== startDate ? (
              <div className={styles.columns3}>
                <DateField label="Ends" isRequired value={parseDate(endDate)} onChange={(v) => v && edit(setEnd)(`${v.toString()}T${end.slice(11)}`)} />
              </div>
            ) : null}
          </>
        )}
        <Combobox label="Time zone" placeholder="Search time zones" isRequired defaultItems={zones.map((z) => ({ id: z }))} selectedKey={timeZone} onSelectionChange={(key) => key && edit(setTimeZone)(String(key))}>
          {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
        </Combobox>
      </section>

      <section className={styles.editorSection}>
        <h3>Where</h3>
        <div className={styles.columns}>
          <TextField label="Location" placeholder="e.g. City park, gym or address" value={location} maxLength={500} onChange={edit(setLocation)} />
          <TextField label="Meeting link" placeholder="https://" type="url" value={url} maxLength={2048} onChange={edit(setUrl)} />
        </div>
      </section>

      <section className={styles.editorSection}>
        <h3>Invite</h3>
        <RecipientPicker
          relationships={relationships}
          groups={groups}
          hint="Groups are expanded when you save: people who join a group later aren't added."
          onChange={(value) => {
            setRelationships(value.relationships);
            setGroups(value.groups);
            mark();
          }}
        />
      </section>

      {error ? (
        <Alert tone="danger" live="assertive" title={error} />
      ) : null}
      <MutationError error={mutation.error} />
      <DialogFooter>
        <Button onPress={cancel}>Cancel</Button>
        <Button variant="primary" type="submit" loading={mutation.isPending} isDisabled={!title.trim()}>
          {initial ? "Save changes" : kind === "Meeting" ? "Create meeting" : "Create event"}
        </Button>
      </DialogFooter>
    </form>
  );
}
