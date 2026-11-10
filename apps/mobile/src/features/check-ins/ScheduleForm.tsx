import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { NativeDateField } from "../training/NativeDateField";
import { useState } from "react";
import { Alert, View } from "react-native";
import type { Schema } from "@metrivum/api-client-web";
import {
  Button,
  IconButton,
  Chip,
  Field,
  ErrorState,
  SelectField,
  Text,
  useTheme,
} from "@metrivum/ui-mobile";
import {
  useApiMutation,
  useApiQuery,
} from "../../infrastructure/networking/queries";
import { FormSheet } from "../shared/FormSheet";
import {
  Choices,
  DecimalField,
  useDraftExitGuard,
} from "../training/components";
import { localDate, type Page } from "../training/model";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScheduleForm({
  relationshipId,
  groupId,
}: {
  relationshipId?: string;
  groupId?: string;
}) {
  const nativeCopy = useNativeCopy().t;

  const theme = useTheme();
  const [validFields, setValidFields] = useState({
    interval: true,
    day: true,
    hours: true,
  });
  const [formId, setForm] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(localDate());
  const [releaseTime, setTime] = useState("09:00");
  const [kind, setKind] = useState<Schema<"RecurrenceKind">>("OneTime");
  const [interval, setInterval] = useState<number | null>(1);
  const [hours, setHours] = useState<number | null>(48);
  const [days, setDays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(1);
  const [assignmentId, setAssignmentId] = useState("");
  const [cycleDays, setCycleDays] = useState<number[]>([1]);
  const assignments = useApiQuery<Schema<"AssignedProgramCycles">[]>(
    "/api/v1/check-ins/assigned-programs",
    { relationshipId },
    !!relationshipId && !groupId,
  );
  const programs = assignments.data ?? [];
  const assignment =
    programs.find((p) => p.assignmentId === assignmentId) ??
    (!assignmentId && programs.length === 1 ? programs[0] : undefined);
  const cycleLength = assignment?.cycles.length
    ? Math.min(...assignment.cycles.map((c) => Number(c.dayCount)))
    : 0;
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(false);
  useDraftExitGuard(dirty);
  const query = useApiQuery<Page<Schema<"FormTemplateDto">>>("/api/v1/forms", {
    purpose: "CheckIn",
    page: 1,
    pageSize: 50,
  });
  const reset = () => {
    setForm("");
    setName("");
    setDate(localDate());
    setTime("09:00");
    setKind("OneTime");
    setInterval(1);
    setHours(48);
    setDays([1]);
    setAssignmentId("");
    setCycleDays([1]);
    setDayOfMonth(1);
    setValidFields({ interval: true, day: true, hours: true });
    setDirty(false);
  };
  const mutation = useApiMutation(() => {
    reset();
    setOpen(false);
  });
  const forms =
    query.data?.items.filter((item) => item.currentPublishedVersionId) || [];
  const selected = formId || (forms.length === 1 ? forms[0]!.id : "");
  const busy = mutation.isPending;
  return (
    <FormSheet
      trigger={{
        title: nativeCopy("interface.Assign a check-in"),
        icon: "checkIn",
      }}
      title={nativeCopy("interface.Assign a check-in")}
      subtitle={nativeCopy(
        "interface.Sends a form to fill in, once or on a schedule",
      )}
      dirty={dirty}
      open={open}
      onOpenChange={setOpen}
      onDiscard={reset}
      footer={() => (
        <Button
          size="lg"
          tone="primary"
          title={nativeCopy("interface.Assign check-in")}
          loading={busy}
          disabled={
            !validFields.hours ||
            !/^([01]\d|2[0-3]):[0-5]\d$/.test(releaseTime) ||
            (kind === "EveryNWeeks" && !days.length) ||
            (kind === "AssignedProgramCycle" &&
              (!assignment ||
                !cycleDays.length ||
                cycleDays.some((d) => d > cycleLength))) ||
            (kind !== "OneTime" &&
              kind !== "AssignedProgramCycle" &&
              !validFields.interval) ||
            (kind === "Monthly" && !validFields.day) ||
            !selected ||
            !name.trim() ||
            !hours ||
            (kind !== "OneTime" &&
              kind !== "AssignedProgramCycle" &&
              !interval) ||
            (!relationshipId && !groupId)
          }
          onPress={() =>
            mutation.mutate({
              path: "/api/v1/check-ins/schedules",
              method: "POST",
              json: {
                formTemplateId: selected,
                name,
                description: "",
                timeZone:
                  kind === "AssignedProgramCycle"
                    ? assignment!.timeZone
                    : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                recurrence: {
                  kind,
                  interval:
                    kind === "OneTime" || kind === "AssignedProgramCycle"
                      ? 1
                      : interval,
                  startDate: date,
                  releaseTime: `${releaseTime}:00`,
                  assignmentId:
                    kind === "AssignedProgramCycle"
                      ? assignment!.assignmentId
                      : null,
                  cycleDays: kind === "AssignedProgramCycle" ? cycleDays : null,
                  weekDays: kind === "EveryNWeeks" ? days : null,
                  dayOfMonth: kind === "Monthly" ? dayOfMonth : null,
                },
                responseWindowHours: hours,
                relationshipIds: relationshipId ? [relationshipId] : [],
                groupIds: groupId ? [groupId] : [],
              },
            })
          }
        />
      )}
    >
      {forms.length === 0 && !query.isPending ? (
        <Text tone="mutedText">
          {nativeCopy(
            "interface.Publish a check-in form in the web app first. It then appears here.",
          )}
        </Text>
      ) : (
        <SelectField
          label={nativeCopy("interface.Form")}
          placeholder={nativeCopy("interface.Choose a form")}
          disabled={busy}
          options={forms.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          value={selected || null}
          onChange={(value) => {
            setForm(value);
            setDirty(true);
          }}
        />
      )}
      <Field
        editable={!busy}
        label={nativeCopy("interface.Name")}
        placeholder={nativeCopy("interface.e.g. Weekly check-in")}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setDirty(true);
        }}
      />
      <Choices
        disabled={busy}
        label={nativeCopy("interface.Repeat")}
        values={
          programs.length
            ? ([
                "OneTime",
                "EveryNDays",
                "EveryNWeeks",
                "Monthly",
                "AssignedProgramCycle",
              ] as const)
            : (["OneTime", "EveryNDays", "EveryNWeeks", "Monthly"] as const)
        }
        labels={{
          OneTime: "Once",
          EveryNDays: "Every few days",
          EveryNWeeks: "Weekly",
          Monthly: "Monthly",
          AssignedProgramCycle: "Program cycle",
        }}
        value={kind}
        onChange={(value) => {
          setKind(value);
          setValidFields((fields) => ({
            ...fields,
            interval: value === "OneTime" ? true : fields.interval,
            day: value !== "Monthly" ? true : fields.day,
          }));
          setDirty(true);
        }}
      />
      {[
        ["Once", "Send one check-in on the selected date."],
        [
          "Every few days",
          "Repeat every selected number of calendar days from the start date.",
        ],
        ["Weekly", "Send on selected weekdays every selected number of weeks."],
        [
          "Monthly",
          "Send on the selected day of each month. Short months use their last day.",
        ],
        [
          "Program cycle",
          "Choose day numbers in each actual assigned program cycle. Dates and time zone follow the assignment. Ends with the assigned program; it does not restart the program.",
        ],
      ].map(([title, explanation]) => (
        <View
          key={title}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: theme.spacing.sm,
          }}
        >
          <IconButton
            icon="info"
            label={nativeCopy("interface.Explain {0}", { "0": String(title) })}
            onPress={() => Alert.alert(title!, explanation)}
          />
          <Text variant="caption">{title}</Text>
        </View>
      ))}
      {!programs.length && (
        <Text tone="mutedText">
          {nativeCopy(
            "interface.Program-cycle days require one client with an active assigned program.",
          )}
        </Text>
      )}
      {kind === "AssignedProgramCycle" && (
        <>
          <SelectField
            label={nativeCopy("interface.Assigned program")}
            disabled={busy}
            options={programs.map((p) => ({
              value: p.assignmentId,
              label: p.programName,
            }))}
            value={assignment?.assignmentId ?? null}
            onChange={(id) => {
              setAssignmentId(id);
              setCycleDays([1]);
              setDirty(true);
            }}
          />
          <Text variant="caption">
            {nativeCopy(
              "interface.Days in each assigned cycle. The schedule ends with the assigned program. For different cycle lengths, select days present in every cycle.",
            )}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: theme.spacing.sm,
            }}
          >
            {Array.from({ length: cycleLength }, (_, i) => i + 1).map((day) => (
              <Chip
                key={day}
                label={nativeCopy("interface.Day {0}", { "0": String(day) })}
                disabled={busy}
                selected={cycleDays.includes(day)}
                onPress={() => {
                  setCycleDays(
                    cycleDays.includes(day)
                      ? cycleDays.filter((d) => d !== day)
                      : [...cycleDays, day],
                  );
                  setDirty(true);
                }}
              />
            ))}
          </View>
        </>
      )}
      {kind !== "OneTime" && kind !== "AssignedProgramCycle" && (
        <DecimalField
          disabled={busy}
          onValidityChange={(valid) =>
            setValidFields((fields) => ({
              ...fields,
              interval: valid,
            }))
          }
          label={
            kind === "EveryNDays"
              ? nativeCopy("interface.Every how many days")
              : kind === "EveryNWeeks"
                ? nativeCopy("interface.Every how many weeks")
                : nativeCopy("interface.Every how many months")
          }
          value={interval}
          onChange={(value) => {
            setInterval(value);
            setDirty(true);
          }}
        />
      )}
      {kind === "EveryNWeeks" && (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label" tone="mutedText">
            On
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: theme.spacing.sm,
            }}
          >
            {weekdays.map((day, index) => (
              <Chip
                key={day}
                label={day}
                disabled={busy}
                selected={days.includes(index)}
                onPress={() => {
                  setDays(
                    days.includes(index)
                      ? days.filter((d) => d !== index)
                      : [...days, index],
                  );
                  setDirty(true);
                }}
              />
            ))}
          </View>
        </View>
      )}
      {kind === "Monthly" && (
        <DecimalField
          disabled={busy}
          onValidityChange={(valid) =>
            setValidFields((fields) => ({ ...fields, day: valid }))
          }
          label={nativeCopy("interface.Day of the month")}
          value={dayOfMonth}
          onChange={(value) => {
            setDayOfMonth(value);
            setDirty(true);
          }}
        />
      )}
      <NativeDateField
        disabled={busy}
        label={nativeCopy("interface.Starts on")}
        value={date}
        onChange={(value) => {
          setDate(value);
          setDirty(true);
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="label">{nativeCopy("interface.Release time")}</Text>
        <IconButton
          icon="info"
          label={nativeCopy("interface.Explain release time")}
          onPress={() =>
            Alert.alert(
              "Release time",
              "The form becomes available at this local time in the displayed time zone. Use 24-hour HH:mm format, for example 09:30.",
            )
          }
        />
      </View>
      <Field
        editable={!busy}
        label={nativeCopy("interface.Release time (HH:mm)")}
        placeholder="09:00"
        autoCapitalize="none"
        maxLength={5}
        value={releaseTime}
        onChangeText={(value) => {
          setTime(value);
          setDirty(true);
        }}
      />
      <Text variant="caption" tone="subtleText">
        {nativeCopy("interface.Time zone:")}{" "}
        {kind === "AssignedProgramCycle"
          ? assignment?.timeZone
          : Intl.DateTimeFormat().resolvedOptions().timeZone}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="label">{nativeCopy("interface.Time to answer")}</Text>
        <IconButton
          icon="info"
          label={nativeCopy("interface.Explain time to answer")}
          onPress={() =>
            Alert.alert(
              "Time to answer",
              "The deadline is the release instant plus this many hours. Already released requests keep their deadlines.",
            )
          }
        />
      </View>
      <DecimalField
        disabled={busy}
        onValidityChange={(valid) =>
          setValidFields((fields) => ({ ...fields, hours: valid }))
        }
        label={nativeCopy("interface.Time to answer (hours)")}
        value={hours}
        onChange={(value) => {
          setHours(value);
          setDirty(true);
        }}
      />
      {!!(query.error || assignments.error || mutation.error) && (
        <ErrorState
          error={query.error || assignments.error || mutation.error}
        />
      )}
    </FormSheet>
  );
}
