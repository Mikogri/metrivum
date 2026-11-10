import { useI18n as useNativeCopy } from "../infrastructure/i18n";
import { useState } from "react";
import { View } from "react-native";
import {
  ActionSheet,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  CheckButton,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  ListItem,
  LoadingState,
  NoAccessState,
  NumericInput,
  ProgressBar,
  Screen,
  SearchField,
  Section,
  SegmentedControl,
  SelectField,
  Stat,
  Text,
  ToolbarSurface,
  chooseAction,
  confirm,
  useTheme,
  useToast,
} from "@metrivum/ui-mobile";

/** Development catalog of the mobile design system. Not reachable in release builds. */
export default function ComponentCatalog() {
  const nativeCopy = useNativeCopy().t;

  const theme = useTheme();
  const toast = useToast();
  const [sheet, setSheet] = useState<"form" | "long" | "actions">();
  const [note, setNote] = useState("");
  const [segment, setSegment] = useState<"all" | "active" | "done">("all");
  const [plan, setPlan] = useState<string>();
  const [done, setDone] = useState(2);
  const [reps, setReps] = useState("5");
  const [load, setLoad] = useState("140");
  const [ticked, setTicked] = useState(false);
  if (!__DEV__)
    return <EmptyState title={nativeCopy("interface.Development screen")} />;
  return (
    <Screen
      title={nativeCopy("interface.Components")}
      subtitle={nativeCopy("interface.Mobile design system")}
    >
      <SegmentedControl
        label={nativeCopy("interface.Theme")}
        value={theme.mode}
        options={[
          { value: "system", label: nativeCopy("interface.System") },
          { value: "light", label: nativeCopy("interface.Light") },
          { value: "dark", label: nativeCopy("interface.Dark") },
        ]}
        onChange={theme.setMode}
      />
      <Section title={nativeCopy("interface.Sheets")}>
        <ListItem
          icon="edit"
          title={nativeCopy("interface.Form sheet with a draft")}
          subtitle={nativeCopy(
            "interface.Closing with typed text asks inside the sheet",
          )}
          onPress={() => setSheet("form")}
        />
        <ListItem
          icon="checkIn"
          title={nativeCopy("interface.Tall scrolling sheet")}
          onPress={() => setSheet("long")}
        />
        <ListItem
          icon="more"
          title={nativeCopy("interface.Action sheet")}
          onPress={() => setSheet("actions")}
        />
        <ListItem
          icon="delete"
          tone="danger"
          title={nativeCopy("interface.Confirmation sheet")}
          onPress={async () =>
            toast(
              (await confirm(
                "Delete this note?",
                "It cannot be restored.",
                "Delete",
              ))
                ? "Confirmed"
                : "Cancelled",
            )
          }
        />
        <ListItem
          icon="sort"
          title={nativeCopy("interface.Imperative action choice")}
          onPress={async () =>
            toast(
              `Chosen: ${
                (await chooseAction("Sort by", [
                  {
                    value: "name",
                    label: nativeCopy("interface.Name"),
                    icon: "sort",
                  },
                  {
                    value: "date",
                    label: nativeCopy("interface.Last activity"),
                    icon: "schedule",
                  },
                ])) ?? "nothing"
              }`,
            )
          }
        />
      </Section>
      <Section title={nativeCopy("interface.Workout set")}>
        <Text variant="caption" tone="mutedText">
          Plan: 5 reps · 140 kg · RPE 7
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: theme.spacing.sm,
          }}
        >
          <NumericInput
            label={nativeCopy("interface.Reps")}
            integer
            value={reps}
            onChangeText={setReps}
          />
          <View style={{ flex: 1.6 }}>
            <NumericInput
              label={nativeCopy("interface.Load (kg)")}
              value={load}
              onChangeText={setLoad}
              onStep={(direction) =>
                setLoad(
                  String(Math.max(0, (Number(load) || 0) + direction * 2.5)),
                )
              }
            />
          </View>
          <CheckButton
            checked={ticked}
            label={nativeCopy("interface.Set done")}
            onPress={() => setTicked(!ticked)}
          />
        </View>
      </Section>
      <Section title={nativeCopy("interface.Actions")}>
        <Button
          size="lg"
          tone="primary"
          title={nativeCopy("interface.Primary")}
          onPress={() => toast("Saved")}
        />
        <Button
          tone="brand"
          icon="add"
          title={nativeCopy("interface.Add")}
          onPress={() => toast("Something failed", true)}
        />
        <Button title={nativeCopy("interface.Neutral")} onPress={() => {}} />
        <Button
          tone="danger"
          icon="delete"
          title={nativeCopy("interface.Destructive")}
          onPress={() => {}}
        />
        <Button
          tone="ghost"
          title={nativeCopy("interface.Ghost")}
          onPress={() => {}}
        />
        <Button
          title={nativeCopy("interface.Busy")}
          loading
          onPress={() => {}}
        />
        <Button
          title={nativeCopy("interface.Unavailable")}
          disabled
          onPress={() => {}}
        />
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <IconButton
            icon="filter"
            label={nativeCopy("interface.Filter")}
            filled
            onPress={() => {}}
          />
          <IconButton
            icon="more"
            label={nativeCopy("interface.More")}
            onPress={() => {}}
          />
          <Chip
            label={nativeCopy("interface.Active")}
            selected
            onPress={() => {}}
          />
          <Chip label={nativeCopy("interface.Paused")} onPress={() => {}} />
        </View>
      </Section>
      <Section title={nativeCopy("interface.Inputs")}>
        <Field
          label={nativeCopy("interface.Form field")}
          placeholder={nativeCopy("interface.Text")}
        />
        <Field
          label={nativeCopy("interface.Invalid field")}
          error="An example actionable error"
        />
        <SearchField label={nativeCopy("interface.Search clients")} />
        <SelectField
          label={nativeCopy("interface.Program")}
          placeholder={nativeCopy("interface.Choose a program")}
          value={plan}
          onChange={setPlan}
          options={[
            {
              value: "a",
              label: "Strength — block 01",
              description: "4 weeks · 4 days",
            },
            { value: "b", label: "Full body", description: "8 weeks · 3 days" },
            {
              value: "c",
              label: "Upper / lower",
              description: "6 weeks · 4 days",
            },
          ]}
        />
        <SegmentedControl
          label={nativeCopy("interface.Status")}
          value={segment}
          onChange={setSegment}
          options={[
            { value: "all", label: nativeCopy("interface.All") },
            { value: "active", label: nativeCopy("interface.Active") },
            { value: "done", label: nativeCopy("interface.Done") },
          ]}
        />
      </Section>
      <Section title={nativeCopy("interface.Rows and data")}>
        <ListItem
          leading={<Avatar name="Kazik Kowalski" />}
          title="Kazik Kowalski"
          subtitle={nativeCopy("interface.Active · last workout yesterday")}
          onPress={() => {}}
        />
        <ListItem
          icon="document"
          title={nativeCopy("interface.Row with a badge")}
          subtitle={nativeCopy("interface.Description")}
          trailing={
            <Badge tone="warning">{nativeCopy("interface.Overdue")}</Badge>
          }
        />
        <View style={{ flexDirection: "row" }}>
          <Stat label={nativeCopy("interface.Sets")} value={4} />
          <Stat label={nativeCopy("interface.Reps")} value={5} />
          <Stat label="RPE" value={7} tone="brand" />
        </View>
        <ProgressBar
          value={done}
          max={5}
          label={nativeCopy("interface.Sets completed")}
        />
        <Button
          size="sm"
          title={nativeCopy("interface.Complete a set")}
          onPress={() => setDone((value) => (value >= 5 ? 0 : value + 1))}
        />
      </Section>
      <Section title={nativeCopy("interface.States")}>
        <LoadingState />
        <ErrorState error={new Error("Example failure")} retry={() => {}} />
        <EmptyState
          title={nativeCopy("interface.Nothing yet")}
          description={nativeCopy("interface.New items appear here.")}
        />
        <NoAccessState
          title={nativeCopy("interface.Not included in your plan")}
          description={nativeCopy(
            "interface.Ask your coach or upgrade on the web.",
          )}
        />
      </Section>
      <ToolbarSurface>
        <Text variant="caption">
          {nativeCopy(
            "interface.Liquid Glass where the system provides it; an opaque raised surface otherwise.",
          )}
        </Text>
      </ToolbarSurface>
      <BottomSheet
        title={nativeCopy("interface.New note")}
        subtitle={nativeCopy("interface.Only you can see it")}
        open={sheet === "form"}
        dirty={note.length > 0}
        onClose={() => {
          setSheet(undefined);
          setNote("");
        }}
        footer={
          <Button
            size="lg"
            tone="primary"
            title={nativeCopy("interface.Save note")}
            disabled={!note}
            onPress={() => {
              setSheet(undefined);
              setNote("");
              toast("Note saved");
            }}
          />
        }
      >
        <Field
          label={nativeCopy("interface.Note")}
          multiline
          value={note}
          onChangeText={setNote}
          placeholder={nativeCopy(
            "interface.Write something, then try to close",
          )}
        />
      </BottomSheet>
      <BottomSheet
        title={nativeCopy("interface.Check-in details")}
        open={sheet === "long"}
        size="full"
        onClose={() => setSheet(undefined)}
      >
        {Array.from({ length: 30 }, (_, index) => (
          <ListItem
            key={index}
            title={nativeCopy("interface.Answer {0}", {
              "0": String(index + 1),
            })}
            subtitle={nativeCopy(
              "interface.A long list scrolls inside the sheet",
            )}
          />
        ))}
      </BottomSheet>
      <ActionSheet
        title="Kazik Kowalski"
        subtitle={nativeCopy("interface.Client")}
        open={sheet === "actions"}
        onClose={() => setSheet(undefined)}
        onSelect={(value) => toast(`Chosen: ${value}`)}
        actions={[
          {
            value: "message",
            label: nativeCopy("interface.Send a message"),
            icon: "messages",
          },
          {
            value: "program",
            label: nativeCopy("interface.Assign a program"),
            icon: "plans",
          },
          {
            value: "end",
            label: nativeCopy("interface.End collaboration"),
            icon: "block",
            destructive: true,
          },
        ]}
      />
    </Screen>
  );
}
