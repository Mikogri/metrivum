import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { parseDate, parseTime } from "@internationalized/date";
import type { Schema } from "@trainflow/api-client-web";
import { Alert, Button, Combobox, DateField, LinkButton, NumberInput, Option, PageHeader, Segment, SegmentedControl, Select, TextArea, TextField, TimeField } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { timeZones } from "~/modules/accounts";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import { DraftNavigationGuard, EditableResource, Failure, Loading, MutationError, StatusBadge } from "../components";
import { RecipientPicker } from "../recipients";
import styles from "../coaching.module.css";

type Schedule = Schema<"ScheduleDto">;
type Kind = Schedule["recurrence"]["kind"];
const KINDS: { id: Kind; label: string; unit?: [string, string] }[] = [
  { id: "OneTime", label: "Once" },
  { id: "EveryNDays", label: "Daily", unit: ["day", "days"] },
  { id: "EveryNWeeks", label: "Weekly", unit: ["week", "weeks"] },
  { id: "Monthly", label: "Monthly", unit: ["month", "months"] },
];
// Monday first on screen; the API numbers days from Sunday (0).
const WEEK = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]] as const;

function Editor({ initial, onDirtyChange }: { initial?: Schedule; onDirtyChange?: (dirty: boolean) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
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
  const [relationships, setRelationships] = useState(initial?.relationshipIds ?? []);
  const [groups, setGroups] = useState(initial?.groupIds ?? []);
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
    if (!current) navigate(`/app/check-in-schedules/${value.id}`, { replace: true });
  });
  useUnsavedWorkGuard(useCallback(() => dirty, [dirty]));
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
  const ready = Boolean(name.trim() && selectedForm && relationships.length + groups.length && (recurrence.kind !== "EveryNWeeks" || days.length));

  return (
    <>
      <PageHeader
        title={initial ? name || "Check-in schedule" : "New check-in schedule"}
        description="Each release uses the form's current published version. Requests already sent keep their questions."
        actions={current && <StatusBadge status={current.status} />}
      />
      <DraftNavigationGuard dirty={dirty} />
      <form
        className={styles.page}
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({
            method: current ? "PATCH" : "POST",
            path: `/api/v1/check-ins/schedules${current ? `/${current.id}` : ""}`,
            ifMatch: current?.version,
            json: { formTemplateId: selectedForm, name: name.trim(), description, timeZone: zone, recurrence, responseWindowHours: hours, relationshipIds: relationships, groupIds: groups },
          });
        }}
      >
        <MutationError error={mutation.error} />
        {current?.lastFailure ? (
          <Alert tone="warning" title="The last release could not be completed">
            {current.lastFailure} {current.retryAtUtc && `Next try: ${new Date(current.retryAtUtc).toLocaleString()}`}
          </Alert>
        ) : null}

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2>Details</h2>
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
            <h2>When</h2>
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
                  change({ kind: next, interval: 1, weekDays: next === "EveryNWeeks" ? (days.length ? days : [1]) : null, dayOfMonth: next === "Monthly" ? 1 : null });
                }}
              >
                {KINDS.map((k) => (
                  <Segment key={k.id} id={k.id}>{k.label}</Segment>
                ))}
              </SegmentedControl>
            </div>
            <div className={styles.columns}>
              <DateField label={recurrence.kind === "OneTime" ? "Date" : "Starts on"} isRequired isDisabled={locked} value={parseDate(recurrence.startDate)} onChange={(v) => v && change({ startDate: v.toString() })} />
              <TimeField label="Release time" isRequired isDisabled={locked} hourCycle={24} value={parseTime(recurrence.releaseTime)} onChange={(v) => v && change({ releaseTime: `${v.toString().slice(0, 5)}:00` })} />
            </div>
            {kind.unit ? (
              <div className={styles.columns}>
                <NumberInput label="Every" isRequired isDisabled={locked} minValue={1} maxValue={365} step={1} value={interval} unit={interval === 1 ? kind.unit[0] : kind.unit[1]} onChange={(v) => change({ interval: Number.isFinite(v) ? v : 1 })} />
                {recurrence.kind === "Monthly" ? (
                  <NumberInput label="Day of the month" description="Shorter months use their last day." isRequired isDisabled={locked} minValue={1} maxValue={31} step={1} value={Number(recurrence.dayOfMonth ?? 1)} onChange={(v) => change({ dayOfMonth: Number.isFinite(v) ? v : 1 })} />
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
              <Combobox
                label="Time zone"
                placeholder="Search time zones"
                isRequired
                isDisabled={locked}
                defaultItems={zones.map((z) => ({ id: z }))}
                selectedKey={zone}
                onSelectionChange={(key) => { if (key) { setZone(String(key)); setDirty(true); } }}
              >
                {(item: { id: string }) => <Option id={item.id}>{item.id.replace(/_/g, " ")}</Option>}
              </Combobox>
              <NumberInput label="Response window" isRequired isDisabled={locked} minValue={1} maxValue={8760} step={1} value={hours} unit={hours === 1 ? "hour" : "hours"} onChange={(v) => { setHours(Number.isFinite(v) ? v : 48); setDirty(true); }} />
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2>Recipients</h2>
            <p>Only active clients get requests. Group members are resolved at each release; anyone selected twice gets one request.</p>
          </header>
          <div className={styles.sectionBody}>
            <RecipientPicker
              relationships={relationships}
              groups={groups}
              disabled={locked}
              onChange={(value) => {
                setRelationships(value.relationships);
                setGroups(value.groups);
                setDirty(true);
              }}
            />
          </div>
        </section>

        <div className={styles.formActions}>
          {current && current.status !== "Ended" ? (
            <div className={styles.actions}>
              {[current.status === "Paused" ? "resume" : "pause", "end"].map((action) => (
                <Button key={action} variant={action === "end" ? "ghost" : "secondary"} isDisabled={locked || dirty} onPress={() => mutation.mutate({ method: "POST", path: `/api/v1/check-ins/schedules/${current.id}/${action}`, ifMatch: current.version })}>
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
      </form>
    </>
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
