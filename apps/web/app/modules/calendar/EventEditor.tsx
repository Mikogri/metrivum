import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseAbsolute, parseDate, parseDateTime, parseTime, parseZonedDateTime } from "@internationalized/date";
import { Alert, Button, Combobox, DateField, DialogFooter, Option, Switch, TextArea, TextField, TimeField } from "@metrivum/ui-web";
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
  const uiCopy = useUiCopy();

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
  const problem = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || mutation.error) problem.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error, mutation.error]);
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
        <TextField label={uiCopy["profile"]["showcase"]["fileTitle"]} placeholder={kind === "Meeting" ? uiCopy["ui"]["e.g. Monthly progress review"] : uiCopy["ui"]["e.g. Club 10K race"]} isRequired maxLength={200} value={title} onChange={edit(setTitle)} autoFocus />
        <TextArea label={uiCopy["training"]["library"]["createDialog"]["description"]} placeholder={uiCopy["ui"]["Optional, agenda or what to prepare"]} maxLength={10000} value={description} onChange={edit(setDescription)} />
      </section>

      <section className={styles.editorSection}>
        <h3>{uiCopy["ui"]["When"]}</h3>
        {kind === "Event" ? (
          <Switch isSelected={allDay} onChange={edit(setAllDay)}>

            {uiCopy["ui"]["All day"]}
          </Switch>
        ) : null}
        {allDay ? (
          <div className={styles.columns}>
            <DateField label={uiCopy["ui"]["First day"]} isRequired value={parseDate(firstDay)} onChange={(v) => { if (v) { setFirstDay(v.toString()); if (lastDay < v.toString()) setLastDay(v.toString()); mark(); } }} />
            <DateField label={uiCopy["ui"]["Last day"]} isRequired value={parseDate(lastDay)} onChange={(v) => v && edit(setLastDay)(v.toString())} />
          </div>
        ) : (
          <>
            <div className={styles.columns3}>
              <DateField label={uiCopy["ui"]["Starts"]} isRequired value={parseDate(startDate)} onChange={(v) => v && changeStart(`${v.toString()}T${start.slice(11)}`)} />
              <TimeField label={uiCopy["editor"]["panel"]["loadMin"]} isRequired hourCycle={24} value={parseTime(start.slice(11))} onChange={(v) => v && changeStart(`${startDate}T${v.toString().slice(0, 5)}`)} />
              <TimeField label={uiCopy["editor"]["panel"]["loadMax"]} isRequired hourCycle={24} value={parseTime(end.slice(11))} onChange={(v) => v && edit(setEnd)(`${endDate}T${v.toString().slice(0, 5)}`)} />
            </div>
            {endDate !== startDate ? (
              <div className={styles.columns3}>
                <DateField label={uiCopy["ui"]["Ends"]} isRequired value={parseDate(endDate)} onChange={(v) => v && edit(setEnd)(`${v.toString()}T${end.slice(11)}`)} />
              </div>
            ) : null}
          </>
        )}
        <Combobox label={uiCopy["settings"]["timeZone"]} placeholder={uiCopy["common"]["ph"]["timeZone"]} isRequired defaultItems={zones.map((z) => ({ id: z }))} selectedKey={timeZone} onSelectionChange={(key) => key && edit(setTimeZone)(String(key))}>
          {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
        </Combobox>
      </section>

      <section className={styles.editorSection}>
        <h3>{uiCopy["ui"]["Where"]}</h3>
        <div className={styles.columns}>
          <TextField label={uiCopy["dashboard"]["discovery"]["location"]} placeholder={uiCopy["ui"]["e.g. City park, gym or address"]} value={location} maxLength={500} onChange={edit(setLocation)} />
          <TextField label={uiCopy["ui"]["Meeting link"]} placeholder="https://" type="url" value={url} maxLength={2048} onChange={edit(setUrl)} />
        </div>
      </section>

      <section className={styles.editorSection}>
        <h3>{uiCopy["ui"]["Invite"]}</h3>
        <RecipientPicker
          relationships={relationships}
          groups={groups}
          hint={uiCopy["ui"]["Groups are expanded when you save: people who join a group later aren't added."]}
          onChange={(value) => {
            setRelationships(value.relationships);
            setGroups(value.groups);
            mark();
          }}
        />
      </section>

      <div ref={problem} className={styles.editorProblem}>
        {error ? <Alert tone="danger" live="assertive" title={error} /> : null}
        <MutationError error={mutation.error} />
      </div>
      <DialogFooter>
        <Button onPress={cancel}>{uiCopy["common"]["cancel"]}</Button>
        <Button variant="primary" type="submit" loading={mutation.isPending} isDisabled={!title.trim()}>
          {initial ? uiCopy["common"]["saveChanges"] : kind === "Meeting" ? uiCopy["ui"]["Create meeting"] : uiCopy["ui"]["Create event"]}
        </Button>
      </DialogFooter>
    </form>
  );
}
