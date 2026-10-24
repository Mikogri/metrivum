import { privateMeta } from "~/shared/i18n/site";

export const meta = ({ location }: { location: { pathname: string } }) =>
  privateMeta(`${location.pathname.endsWith("/new") ? "New check-in schedule" : "Check-in schedule"} — Metrivum`);

import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { CalendarClock, Info, Users } from "lucide-react";
import { parseDate } from "@internationalized/date";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, Chip, ChipGroup, Combobox, DateField, Dialog, DialogFooter, LinkButton, NumberInput, Option, PageHeader, Segment, SegmentedControl, Select, TextArea, TextField, toast } from "@trainflow/ui-web";
import { useDangerConfirm, useDiscardConfirm } from "~/shared/lib/useConfirm";
import { RequireFeature } from "~/shared/access";
import { timeZones } from "~/modules/accounts";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import { DraftNavigationGuard, EditableResource, Failure, Loading, MutationError, StatusBadge } from "../components";
import { RecipientPicker } from "../recipients";
import styles from "../coaching.module.css";
import sched from "./schedule.module.css";
import { describeRecurrence, describeWindow, nextReleases } from "../schedule-summary";

type Schedule = Schema<"ScheduleDto">;
type Kind = Schedule["recurrence"]["kind"];
const KINDS: { id: Kind; label: string; explanation: string; unit?: [string, string] }[] = [
  { id: "OneTime", label: "Once", explanation: "Send one check-in on the selected date." },
  { id: "EveryNDays", label: "Daily", explanation: "Repeat every selected number of calendar days, starting on the start date.", unit: ["day", "days"] },
  { id: "EveryNWeeks", label: "Weekly", explanation: "Send on selected weekdays in every selected number of weeks.", unit: ["week", "weeks"] },
  { id: "AssignedProgramCycle", label: "Program cycle", explanation: "Send on selected day numbers in each actual assigned program cycle. Dates and time zone follow the assignment. Ends with the assigned program; it does not restart the program." },
  { id: "Monthly", label: "Monthly", explanation: "Send on the chosen day of the month; shorter months use their final day.", unit: ["month", "months"] },
];
// Monday first on screen; the API numbers days from Sunday (0).
const WEEK = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]] as const;

/** Opening values when the editor is used as a side panel (e.g. from the calendar). */
export interface ScheduleSeed { date?: string; timeZone?: string; relationshipId?: string }

function Editor({ initial, onDirtyChange, panel }: { initial?: Schedule; onDirtyChange?: (dirty: boolean) => void; panel?: { seed?: ScheduleSeed; close: () => void } }) {
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const params = panel ? new URLSearchParams(Object.entries(panel.seed ?? {}).filter(([, v]) => v) as [string, string][]) : urlParams;
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") ? params.get("date")! : null;
  const zones = useMemo(() => timeZones(), []);
  const [current, setCurrent] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [formId, setFormId] = useState(initial?.formTemplateId ?? "");
  const [zone, setZone] = useState(initial?.timeZone ?? params.get("timeZone") ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [recurrence, setRecurrence] = useState<Schedule["recurrence"]>(
    initial?.recurrence ?? { kind: selectedDate ? "OneTime" : "EveryNWeeks", interval: 1, startDate: selectedDate ?? new Date().toLocaleDateString("en-CA"), releaseTime: "09:00:00", weekDays: selectedDate ? null : [1], dayOfMonth: null },
  );
  const [hours, setHours] = useState(Number(initial?.responseWindowHours ?? 48));
  const [relationships, setRelationships] = useState(initial?.relationshipIds ?? (params.get("relationshipId") ? [params.get("relationshipId")!] : []));
  const [groups, setGroups] = useState(initial?.groupIds ?? []);
  const assignments = useCoachingQuery<Schema<"AssignedProgramCycles">[]>("/api/v1/check-ins/assigned-programs", { relationshipId: relationships[0] }, relationships.length === 1 && groups.length === 0);
  const programs = assignments.data ?? [];
  const assignment = programs.find((p) => p.assignmentId === recurrence.assignmentId);
  const cycleDays = (recurrence.cycleDays ?? []).map(Number);
  const cycleLength = assignment?.cycles.length ? Math.min(...assignment.cycles.map((c) => Number(c.dayCount))) : 0;
  const [dirty, setDirtyState] = useState(false);
  const setDirty = (value: boolean) => {
    setDirtyState(value);
    onDirtyChange?.(value);
  };
  const forms = useCoachingQuery<Page<Schema<"FormTemplateDto">>>("/api/v1/forms", { purpose: "CheckIn", pageSize: 100 });
  const mutation = useCoachingMutation<Schedule>((value) => {
    flushSync(() => {
      setCurrent(value);
      setDirty(false);
    });
    if (panel) {
      toast({ tone: "success", title: current ? "Schedule saved" : "Check-in schedule created" });
      panel.close();
    } else if (!current) navigate(`/app/check-in-schedules/${value.id}`, { replace: true });
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const available = forms.data?.items.filter((f) => f.currentPublishedVersionId) ?? [];
  const selectedForm = formId || (available.length === 1 ? available[0]!.id : "");
  const locked = current?.status === "Ended" || mutation.isPending;
  const kind = KINDS.find((k) => k.id === recurrence.kind)!;
  const interval = Number(recurrence.interval);
  const change = (value: Partial<Schedule["recurrence"]>) => {
    setRecurrence({ ...recurrence, ...value });
    setDirty(true);
  };
  const days = (recurrence.weekDays ?? []).map(Number);
  const ready = Boolean(name.trim() && selectedForm && relationships.length + groups.length && /^([01]\d|2[0-3]):[0-5]\d:00$/.test(recurrence.releaseTime) && (recurrence.kind !== "EveryNWeeks" || days.length) && (recurrence.kind !== "AssignedProgramCycle" || (relationships.length === 1 && groups.length === 0 && assignment && cycleDays.length && cycleDays.every((d) => d <= cycleLength))));

  return (
    <>
      {panel ? null : (
        <>
          <PageHeader
            title={initial ? name || "Check-in schedule" : "New check-in schedule"}
            description="Each release uses the form's current published version. Requests already sent keep their questions."
            meta={current && <StatusBadge status={current.status} />}
          />
          <DraftNavigationGuard dirty={dirty} />
        </>
      )}
      {confirmDialog}
      <form
        className={styles.page}
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            method: current ? "PATCH" : "POST",
            path: `/api/v1/check-ins/schedules${current ? `/${current.id}` : ""}`,
            ifMatch: current?.version,
            json: { formTemplateId: selectedForm, name: name.trim(), description, timeZone: recurrence.kind === "AssignedProgramCycle" ? assignment!.timeZone : zone, recurrence, responseWindowHours: hours, relationshipIds: relationships, groupIds: groups },
          });
        }}
      >
        <MutationError error={mutation.error} />
        {current?.status === "Active" && current.recurrence.kind === "AssignedProgramCycle" && !current.nextAvailableAtUtc && !current.lastFailure && <Alert title="No upcoming release">This schedule stays linked to the assignment. It waits for an active assigned program with remaining cycle dates; it does not restart the program.</Alert>}
        {current?.lastFailure ? (
          <Alert tone="warning" title="The last release could not be completed">
            {current.lastFailure} {current.retryAtUtc && `Next try: ${new Date(current.retryAtUtc).toLocaleString()}`}
          </Alert>
        ) : null}

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2><span className={sched.stepNo}>1</span>Details</h2>
            <p>What clients see in their check-in list.</p>
          </header>
          <div className={styles.sectionBody}>
            <TextField label="Name" placeholder="e.g. Monday check-in" isRequired maxLength={200} value={name} isDisabled={locked} onChange={(v) => { setName(v); setDirty(true); }} />
            <TextArea label="Description" placeholder="Optional, a sentence about what to report" value={description} isDisabled={locked} onChange={(v) => { setDescription(v); setDirty(true); }} />
            {forms.isError ? (
              <Failure error={forms.error} retry={() => void forms.refetch()} />
            ) : (
              <Select
                label="Check-in form"
                placeholder={forms.isPending ? "Loading forms…" : "Choose a published form"}
                isRequired
                isDisabled={locked || !available.length}
                selectedKey={selectedForm || null}
                onSelectionChange={(key) => { setFormId(String(key)); setDirty(true); }}
              >
                {[...(formId && !available.some((f) => f.id === formId) ? [{ id: formId, name: "Current linked form" }] : []), ...available].map((f) => (
                  <Option key={f.id} id={f.id}>{f.name}</Option>
                ))}
              </Select>
            )}
            {!forms.isPending && !available.length && !formId ? (
              <Alert title="Publish a check-in form first" actions={<LinkButton href="/app/forms?purpose=CheckIn" size="sm">Open forms</LinkButton>}>
                A schedule sends a published form.
              </Alert>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2><span className={sched.stepNo}>2</span>When</h2>
            <p>Release time in the chosen time zone. Clients answer within the response window.</p>
          </header>
          <div className={styles.sectionBody}>
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Repeats</span>
              <SegmentedControl
                aria-label="Repeats"
                isDisabled={locked}
                selectedKeys={[recurrence.kind]}
                onSelectionChange={(keys) => {
                  const next = [...keys][0] as Kind;
                  change({ kind: next, assignmentId: next === "AssignedProgramCycle" && programs.length === 1 ? programs[0]!.assignmentId : null, cycleDays: next === "AssignedProgramCycle" ? [1] : null, interval: 1, weekDays: next === "EveryNWeeks" ? (days.length ? days : [1]) : null, dayOfMonth: next === "Monthly" ? 1 : null });
                }}
              >
                {KINDS.map((k) => (
                  <Segment key={k.id} id={k.id} isDisabled={k.id === "AssignedProgramCycle" && !programs.length}>{k.label}</Segment>
                ))}
              </SegmentedControl>
              <p className={sched.explain}><Info aria-hidden="true" />{kind.explanation}</p>
              {!programs.length && <p className={sched.note}>Program cycle needs one client with an active assigned program.</p>}
              {assignments.isError && <Failure error={assignments.error} retry={() => void assignments.refetch()} />}
              {recurrence.kind === "AssignedProgramCycle" && <>
                <Select label="Assigned program" isRequired isDisabled={locked} selectedKey={recurrence.assignmentId ?? null} onSelectionChange={(id) => change({ assignmentId: String(id), cycleDays: [1] })}>
                  {programs.map((p) => <Option key={p.assignmentId} id={p.assignmentId}>{p.programName}</Option>)}
                </Select>
                <p className={sched.note}>Day 1 starts on the assignment date. Choose days within each actual cycle; this schedule ends with the assigned program.</p>
                <div className={styles.weekdays} role="group" aria-label="Program cycle days">{Array.from({ length: cycleLength }, (_, i) => i + 1).map((day) => <button key={day} type="button" className={styles.weekday} aria-pressed={cycleDays.includes(day)} disabled={locked} onClick={() => change({ cycleDays: cycleDays.includes(day) ? cycleDays.filter((d) => d !== day) : [...cycleDays, day] })}>Day {day}</button>)}</div>
                {assignment && <p className={sched.note}>Assignment time zone: {assignment.timeZone}. For cycles of different lengths, choose days present in every cycle.</p>}
              </>}
            </div>
            <div className={styles.columns}>
              <div className={sched.field}>
                <DateField label={recurrence.kind === "OneTime" ? "Date" : "Starts on"} isRequired isDisabled={locked} value={parseDate(recurrence.startDate)} onChange={(v) => v && change({ startDate: v.toString() })} />
                <p className={sched.note}>{recurrence.kind === "OneTime" ? "The day the check-in is sent." : "The first possible release day."}</p>
              </div>
              <div className={sched.field}>
                <TextField label="Release time" type="time" isRequired isDisabled={locked} value={recurrence.releaseTime.slice(0, 5)} onChange={(v) => change({ releaseTime: v ? `${v}:00` : "" })} />
                <p className={sched.note}>Local time in the selected time zone when the form opens.</p>
              </div>
            </div>
            {kind.unit ? (
              <div className={styles.columns}>
                <NumberInput label="Every" placeholder="1" isRequired isDisabled={locked} minValue={1} maxValue={365} step={1} value={interval} unit={interval === 1 ? kind.unit[0] : kind.unit[1]} onChange={(v) => change({ interval: Number.isFinite(v) ? v : 1 })} />
                {recurrence.kind === "Monthly" ? (
                  <div className={sched.field}>
                    <NumberInput label="Day of the month" placeholder="1" isRequired isDisabled={locked} minValue={1} maxValue={31} step={1} value={Number(recurrence.dayOfMonth ?? 1)} onChange={(v) => change({ dayOfMonth: Number.isFinite(v) ? v : 1 })} />
                    <p className={sched.note}>Shorter months use their last day.</p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {recurrence.kind === "EveryNWeeks" ? (
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>On</span>
                <div className={styles.weekdays} role="group" aria-label="Weekdays">
                  {WEEK.map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      className={styles.weekday}
                      aria-pressed={days.includes(value)}
                      disabled={locked}
                      onClick={() => change({ weekDays: days.includes(value) ? days.filter((d) => d !== value) : [...days, value] })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className={styles.columns}>
              <div className={sched.field}>
                <Combobox
                  label="Time zone"
                  placeholder="Search time zones"
                  isRequired
                  isDisabled={locked || recurrence.kind === "AssignedProgramCycle"}
                  defaultItems={zones.map((z) => ({ id: z }))}
                  selectedKey={recurrence.kind === "AssignedProgramCycle" ? assignment?.timeZone ?? zone : zone}
                  onSelectionChange={(key) => { if (key) { setZone(String(key)); setDirty(true); } }}
                >
                  {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
                </Combobox>
                <p className={sched.note}>Release times use this zone. Clocks changing for daylight saving keep the same local time.</p>
              </div>
              <div className={sched.field}>
                <NumberInput label="Response window" placeholder="48" isRequired isDisabled={locked} minValue={1} maxValue={8760} step={1} value={hours} unit={hours === 1 ? "hour" : "hours"} onChange={(v) => { setHours(Number.isFinite(v) ? v : 48); setDirty(true); }} />
                <p className={sched.note}>Hours after release to answer on time. Requests already sent keep their deadlines.</p>
              </div>
            </div>
            <div className={sched.quick}>
              <span className={styles.fieldLabel}>Quick response window</span>
              <ChipGroup aria-label="Quick response window" selectedKeys={[String(hours)]} onSelectionChange={(keys) => { const next = Number([...keys][0]); if (next) { setHours(next); setDirty(true); } }} isDisabled={locked}>
                {[24, 48, 72, 168].map((h) => <Chip key={h} id={String(h)}>{describeWindow(h)}</Chip>)}
              </ChipGroup>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2><span className={sched.stepNo}>3</span>Recipients</h2>
            <p>Only active clients get requests. Group members are resolved at each release; anyone selected twice gets one request.</p>
          </header>
          <div className={styles.sectionBody}>
            <RecipientPicker
              relationships={relationships}
              groups={groups}
              disabled={locked}
              onChange={(value) => {
                setRelationships(value.relationships);
                if (recurrence.kind === "AssignedProgramCycle") change({ assignmentId: null, cycleDays: [] });
                setGroups(value.groups);
                setDirty(true);
              }}
            />
          </div>
        </section>

        <SchedulePreview
          recurrence={recurrence}
          time={recurrence.releaseTime.slice(0, 5)}
          zone={recurrence.kind === "AssignedProgramCycle" ? assignment?.timeZone ?? zone : zone}
          hours={hours}
          clients={relationships.length}
          groups={groups.length}
          programName={assignment?.programName}
          cycleDays={cycleDays}
        />

        {/* In the side panel the actions are the dialog's own footer: fixed at the bottom edge, opaque and
            edge to edge, so the form never shows through or scrolls past it. */}
        {panel ? (
          <DialogFooter>
          <Button onPress={() => (panel ? panel.close() : navigate("/app/check-in-schedules"))}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={locked || !ready}>
            {current ? "Save changes" : "Create schedule"}
          </Button>
          </DialogFooter>
        ) : (
        <div className={styles.formActions}>
          {current && current.status !== "Ended" ? (
            <div className={styles.actions}>
              {[current.status === "Paused" ? "resume" : "pause", "end"].map((action) => (
                <Button key={action} variant={action === "end" ? "danger-ghost" : "secondary"} isDisabled={locked || dirty} onPress={async () => { if (action === "end" && !(await ask({ title: "End this schedule?", body: "No further check-ins are released. Requests already sent stay available to clients and in the history.", confirmLabel: "End schedule", cancelLabel: "Keep schedule" }))) return; mutation.mutate({ method: "POST", path: `/api/v1/check-ins/schedules/${current.id}/${action}`, ifMatch: current.version }); }}>
                  {action === "end" ? "End schedule" : action === "pause" ? "Pause" : "Resume"}
                </Button>
              ))}
              <LinkButton href={`/app/check-ins?scheduleId=${current.id}`} variant="ghost">View requests</LinkButton>
            </div>
          ) : null}
          <span className={styles.spacer} />
          <Button onPress={() => navigate("/app/check-in-schedules")}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending} isDisabled={locked || !ready}>
            {current ? "Save changes" : "Create schedule"}
          </Button>
        </div>
        )}
      </form>
    </>
  );
}

/** What the schedule will do, in words, with the next release dates: updates as the form changes. */
function SchedulePreview({ recurrence, time, zone, hours, clients, groups, programName, cycleDays }: {
  recurrence: Schedule["recurrence"]; time: string; zone: string; hours: number; clients: number; groups: number; programName?: string; cycleDays: number[];
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const draft = { ...recurrence, interval: Number(recurrence.interval), weekDays: recurrence.weekDays?.map(Number) ?? null, dayOfMonth: recurrence.dayOfMonth == null ? null : Number(recurrence.dayOfMonth) };
  const upcoming = recurrence.kind === "AssignedProgramCycle" ? [] : nextReleases(draft, today, 4);
  const date = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  const who = [clients ? `${clients} ${clients === 1 ? "client" : "clients"}` : "", groups ? `${groups} ${groups === 1 ? "group" : "groups"}` : ""].filter(Boolean).join(" and ") || "no one yet";
  return (
    <section className={sched.preview} aria-label="Schedule preview">
      <div className={sched.previewMain}>
        <span className={sched.previewIcon} aria-hidden="true"><CalendarClock /></span>
        <div className={sched.previewText}>
          <strong>{describeRecurrence(draft, programName, cycleDays)} at {time || "--:--"}</strong>
          <span>{zone.replace(/_/g, " ")} · {describeWindow(hours)} to answer</span>
        </div>
        <span className={sched.previewWho}><Users aria-hidden="true" />{who}</span>
      </div>
      {recurrence.kind === "AssignedProgramCycle" ? (
        <p className={sched.note}>Dates follow the assigned program's cycles.</p>
      ) : upcoming.length ? (
        <ol className={sched.upcoming} aria-label="Next releases">
          {upcoming.map((value) => <li key={value}>{date(value)}</li>)}
        </ol>
      ) : (
        <p className={sched.note}>No upcoming release: check the start date{recurrence.kind === "EveryNWeeks" ? " and weekdays" : ""}.</p>
      )}
    </section>
  );
}

function Detail() {
  const { scheduleId } = useParams();
  const query = useCoachingQuery<Schedule>(`/api/v1/check-ins/schedules/${scheduleId}`, undefined, Boolean(scheduleId));
  if (!scheduleId) return <Editor />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} retry={() => void query.refetch()} />;
  return <EditableResource value={query.data}>{(value, onDirtyChange) => <Editor key={`${value.id}:${value.version}`} initial={value} onDirtyChange={onDirtyChange} />}</EditableResource>;
}

export default function ScheduleRoute() {
  return (
    <RequireFeature feature="checkins.schedules.manage">
      <Detail />
    </RequireFeature>
  );
}

/**
 * New check-in schedule in a wide panel sliding in from the right (used by the calendar). Closing
 * with unsaved changes asks first.
 */
export function ScheduleEditorPanel({ seed, isOpen, onClose }: { seed?: ScheduleSeed; isOpen: boolean; onClose: () => void }) {
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog } = useDiscardConfirm();
  const close = async () => {
    if (dirty && !(await confirm())) return;
    setDirty(false);
    onClose();
  };
  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) void close(); }}
        placement="right"
        size="xl"
        title="New check-in schedule"
        description="Each release uses the form's current published version. Requests already sent keep their questions."
      >
        {isOpen ? <Editor key={`${seed?.date ?? ""}:${seed?.timeZone ?? ""}`} onDirtyChange={setDirty} panel={{ seed, close: () => { setDirty(false); onClose(); } }} /> : null}
      </Dialog>
      {dialog}
    </>
  );
}
