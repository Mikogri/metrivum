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
} from "@trainflow/ui-mobile";

/** Development catalog of the mobile design system. Not reachable in release builds. */
export default function ComponentCatalog() {
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
    if (!__DEV__) return <EmptyState title="Development screen" />;
    return (
        <Screen title="Components" subtitle="Mobile design system">
            <SegmentedControl
                label="Theme"
                value={theme.mode}
                options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                ]}
                onChange={theme.setMode}
            />
            <Section title="Sheets">
                <ListItem
                    icon="edit"
                    title="Form sheet with a draft"
                    subtitle="Closing with typed text asks inside the sheet"
                    onPress={() => setSheet("form")}
                />
                <ListItem
                    icon="checkIn"
                    title="Tall scrolling sheet"
                    onPress={() => setSheet("long")}
                />
                <ListItem
                    icon="more"
                    title="Action sheet"
                    onPress={() => setSheet("actions")}
                />
                <ListItem
                    icon="delete"
                    tone="danger"
                    title="Confirmation sheet"
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
                    title="Imperative action choice"
                    onPress={async () =>
                        toast(
                            `Chosen: ${
                                (await chooseAction("Sort by", [
                                    { value: "name", label: "Name", icon: "sort" },
                                    { value: "date", label: "Last activity", icon: "schedule" },
                                ])) ?? "nothing"
                            }`,
                        )
                    }
                />
            </Section>
            <Section title="Workout set">
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
                        label="Reps"
                        integer
                        value={reps}
                        onChangeText={setReps}
                    />
                    <View style={{ flex: 1.6 }}>
                        <NumericInput
                            label="Load (kg)"
                            value={load}
                            onChangeText={setLoad}
                            onStep={(direction) =>
                                setLoad(
                                    String(
                                        Math.max(
                                            0,
                                            (Number(load) || 0) +
                                                direction * 2.5,
                                        ),
                                    ),
                                )
                            }
                        />
                    </View>
                    <CheckButton
                        checked={ticked}
                        label="Set done"
                        onPress={() => setTicked(!ticked)}
                    />
                </View>
            </Section>
            <Section title="Actions">
                <Button size="lg" tone="primary" title="Primary" onPress={() => toast("Saved")} />
                <Button tone="brand" icon="add" title="Add" onPress={() => toast("Something failed", true)} />
                <Button title="Neutral" onPress={() => {}} />
                <Button tone="danger" icon="delete" title="Destructive" onPress={() => {}} />
                <Button tone="ghost" title="Ghost" onPress={() => {}} />
                <Button title="Busy" loading onPress={() => {}} />
                <Button title="Unavailable" disabled onPress={() => {}} />
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                    <IconButton icon="filter" label="Filter" filled onPress={() => {}} />
                    <IconButton icon="more" label="More" onPress={() => {}} />
                    <Chip label="Active" selected onPress={() => {}} />
                    <Chip label="Paused" onPress={() => {}} />
                </View>
            </Section>
            <Section title="Inputs">
                <Field label="Form field" placeholder="Text" />
                <Field label="Invalid field" error="An example actionable error" />
                <SearchField label="Search clients" />
                <SelectField
                    label="Program"
                    placeholder="Choose a program"
                    value={plan}
                    onChange={setPlan}
                    options={[
                        { value: "a", label: "Strength — block 01", description: "4 weeks · 4 days" },
                        { value: "b", label: "Full body", description: "8 weeks · 3 days" },
                        { value: "c", label: "Upper / lower", description: "6 weeks · 4 days" },
                    ]}
                />
                <SegmentedControl
                    label="Status"
                    value={segment}
                    onChange={setSegment}
                    options={[
                        { value: "all", label: "All" },
                        { value: "active", label: "Active" },
                        { value: "done", label: "Done" },
                    ]}
                />
            </Section>
            <Section title="Rows and data">
                <ListItem
                    leading={<Avatar name="Kazik Kowalski" />}
                    title="Kazik Kowalski"
                    subtitle="Active · last workout yesterday"
                    onPress={() => {}}
                />
                <ListItem
                    icon="document"
                    title="Row with a badge"
                    subtitle="Description"
                    trailing={<Badge tone="warning">Overdue</Badge>}
                />
                <View style={{ flexDirection: "row" }}>
                    <Stat label="Sets" value={4} />
                    <Stat label="Reps" value={5} />
                    <Stat label="RPE" value={7} tone="brand" />
                </View>
                <ProgressBar value={done} max={5} label="Sets completed" />
                <Button size="sm" title="Complete a set" onPress={() => setDone((value) => (value >= 5 ? 0 : value + 1))} />
            </Section>
            <Section title="States">
                <LoadingState />
                <ErrorState error={new Error("Example failure")} retry={() => {}} />
                <EmptyState title="Nothing yet" description="New items appear here." />
                <NoAccessState title="Not included in your plan" description="Ask your coach or upgrade on the web." />
            </Section>
            <ToolbarSurface>
                <Text variant="caption">
                    Liquid Glass where the system provides it; an opaque raised surface otherwise.
                </Text>
            </ToolbarSurface>
            <BottomSheet
                title="New note"
                subtitle="Only you can see it"
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
                        title="Save note"
                        disabled={!note}
                        onPress={() => {
                            setSheet(undefined);
                            setNote("");
                            toast("Note saved");
                        }}
                    />
                }
            >
                <Field label="Note" multiline value={note} onChangeText={setNote} placeholder="Write something, then try to close" />
            </BottomSheet>
            <BottomSheet title="Check-in details" open={sheet === "long"} size="full" onClose={() => setSheet(undefined)}>
                {Array.from({ length: 30 }, (_, index) => (
                    <ListItem key={index} title={`Answer ${index + 1}`} subtitle="A long list scrolls inside the sheet" />
                ))}
            </BottomSheet>
            <ActionSheet
                title="Kazik Kowalski"
                subtitle="Client"
                open={sheet === "actions"}
                onClose={() => setSheet(undefined)}
                onSelect={(value) => toast(`Chosen: ${value}`)}
                actions={[
                    { value: "message", label: "Send a message", icon: "messages" },
                    { value: "program", label: "Assign a program", icon: "plans" },
                    { value: "end", label: "End collaboration", icon: "block", destructive: true },
                ]}
            />
        </Screen>
    );
}
