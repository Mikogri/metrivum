import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { NativeDateField } from "./NativeDateField";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, AppState, View } from "react-native";
import type { Schema } from "@metrivum/api-client-web";
import {
    ActionSheet,
    Badge,
    BottomSheet,
    Button,
    CheckButton,
    EmptyState,
    ErrorState,
    Field,
    Icon,
    IconButton,
    ListItem,
    LoadingState,
    NumericInput,
    ProgressBar,
    Screen,
    SearchField,
    Section,
    Text,
    ToolbarSurface,
    confirm,
    haptic,
    useTheme,
} from "@metrivum/ui-mobile";
import { useMobile } from "../../infrastructure/session/MobileSession";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { SerialSaveQueue } from "../../infrastructure/persistence/SerialSaveQueue";
import { StatusBadge, formatDay, humanize, joinParts } from "../shared/format";
import {
    blankSet,
    decimal,
    describePrescription,
    executionDraft,
    restRemaining,
    type ActualSet,
    type ExecutionDraft,
    type WorkoutDetail,
    type Page,
} from "./model";
import { Choices, DecimalField, useDraftExitGuard } from "./components";

const hasValues = (set: ActualSet) =>
    set.reps != null ||
    set.load != null ||
    set.durationSeconds != null ||
    set.distanceMeters != null;
const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const detailFields = [
    ["rpe", "RPE"],
    ["rir", "Reps in reserve"],
    ["durationSeconds", "Time (seconds)"],
    ["distanceMeters", "Distance (metres)"],
    ["restSeconds", "Rest after this set (seconds)"],
] as const;

/** Where the latest edit lives right now. Always visible, announced when it changes. */
function SaveState({ state, failed }: { state: string; failed: boolean }) {
 const nativeCopy = useNativeCopy().t;

    const theme = useTheme();
    const view = failed
        ? { icon: "warning" as const, tone: "warning" as const, label: nativeCopy("interface.Not synced — kept on this phone") }
        : state === "saved-server"
          ? { icon: "checkCircle" as const, tone: "brand" as const, label: nativeCopy("interface.Saved") }
          : state === "saved-local"
            ? { icon: "check" as const, tone: "mutedText" as const, label: nativeCopy("interface.Saved on this phone") }
            : { icon: null, tone: "mutedText" as const, label: nativeCopy("interface.Saving…") };
    return (
        <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={view.label}
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.xs + 2,
                minHeight: 24,
            }}
        >
            {view.icon ? (
                <Icon name={view.icon} tone={view.tone} size={theme.icon.sm} />
            ) : (
                <ActivityIndicator size="small" color={theme.colors.mutedText} />
            )}
            <Text variant="caption" tone={view.tone}>
                {view.label}
            </Text>
        </View>
    );
}

/** Big number entry for one actual value of a set; typing and the step buttons share one state. */
function SetNumber({
    label,
    value,
    onChange,
    onValidity,
    disabled,
    suffix,
    integer,
    step,
}: {
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
    onValidity: (valid: boolean) => void;
    disabled: boolean;
    suffix?: string;
    integer?: boolean;
    step?: number;
}) {
    const [input, setInput] = useState(value == null ? "" : String(value));
    const [invalid, setInvalid] = useState(false);
    const report = useRef(onValidity);
    report.current = onValidity;
    // A removed row must not keep blocking the save with an error nobody can see.
    useEffect(() => () => report.current(true), []);
    const apply = (text: string) => {
        setInput(text);
        try {
            const number = decimal(text);
            setInvalid(false);
            onValidity(true);
            onChange(number);
        } catch {
            setInvalid(true);
            onValidity(false);
        }
    };
    return (
        <NumericInput
            label={label}
            value={input}
            onChangeText={apply}
            suffix={suffix}
            integer={integer}
            invalid={invalid}
            disabled={disabled}
            onStep={
                step
                    ? (direction) =>
                          apply(
                              String(
                                  Math.max(
                                      0,
                                      Math.round(
                                          ((value ?? 0) + direction * step) *
                                              100,
                                      ) / 100,
                                  ),
                              ),
                          )
                    : undefined
            }
        />
    );
}

function Editor({
    detail,
    refresh,
}: {
    detail: WorkoutDetail;
    refresh: () => void;
}) {
 const nativeCopy = useNativeCopy().t;

    const { api, drafts } = useMobile();
    const theme = useTheme();
    const execution = detail.execution!;
    const key = `workout:${execution.id}`;
    // This editor is keyed by execution. Polls update displayed server data, not hydration.
    const [initial] = useState(() => ({ detail, api, drafts, key }));
    const mounted = useRef(false);
    const locked = useRef(false);
    const latest = useRef<ExecutionDraft | undefined>(undefined);
    const locallySaved = useRef<ExecutionDraft | undefined>(undefined);
    const [draft, setDraft] = useState<ExecutionDraft>();
    const [state, setState] = useState("Loading local draft");
    const [error, setError] = useState<unknown>();
    const [busy, setBusy] = useState(false);
    const [endAt, setEndAt] = useState<number | null>(null);
    const [remaining, setRemaining] = useState(0);
    const [search, setSearch] = useState("");
    const [substitute, setSubstitute] = useState<number | null>(null);
    const [server, setServer] = useState<WorkoutDetail>();
    const [unpersisted, setUnpersisted] = useState(false);
    // Presentation state only: which sets were ticked off, and which panels are open.
    const [recorded, setRecorded] = useState<ReadonlySet<string>>(new Set());
    const [menu, setMenu] = useState<number | null>(null);
    const [details, setDetails] = useState<{ ex: number; set: number } | null>(
        null,
    );
    const invalidFields = useRef(new Set<string>());
    const [valid, setValid] = useState(true);
    const validity = (key: string, valid: boolean) => {
        if (valid) invalidFields.current.delete(key);
        else invalidFields.current.add(key);
        setValid(invalidFields.current.size === 0);
    };
    useDraftExitGuard(unpersisted || busy || !valid);
    const queue = useRef<SerialSaveQueue<ExecutionDraft> | null>(null);
    const catalog = useApiQuery<Page<Schema<"ExerciseListItemDto">>>(
        "/api/v1/exercises",
        { search, page: 1, pageSize: 20 },
        substitute !== null,
    );
    const canEdit = execution.allowedActions.some((action) =>
        ["edit", "save", "correct"].includes(action),
    );
    const newQueue = useCallback(
        (version: number) => {
            const result = new SerialSaveQueue<ExecutionDraft>(
                version,
                async (next, currentVersion) => {
                    try {
                        await initial.drafts.put(
                            initial.key,
                            next,
                            currentVersion,
                        );
                        locallySaved.current = next;
                        if (mounted.current && latest.current === next)
                            setUnpersisted(false);
                    } catch (failure) {
                        if (mounted.current && latest.current === next)
                            setUnpersisted(true);
                        throw failure;
                    }
                },
                async (next, currentVersion) => {
                    const response = await initial.api<Schema<"ExecutionDto">>({
                        path: `/api/v1/training/executions/${initial.detail.execution!.id}`,
                        method: "PUT",
                        json: next,
                        ifMatch: currentVersion,
                        idempotencyKey: `${initial.detail.execution!.id}:${currentVersion}`,
                    });
                    return response.version ?? response.data.version;
                },
                (next) => {
                    if (
                        mounted.current &&
                        queue.current === result &&
                        (next === "error" ||
                            (invalidFields.current.size === 0 &&
                                locallySaved.current === latest.current))
                    )
                        setState(next);
                },
            );
            return result;
        },
        [initial],
    );
    useEffect(() => {
        let active = true;
        mounted.current = true;
        void initial.drafts
            .get<ExecutionDraft>(initial.key)
            .then((local) => {
                if (!active) return;
                const value = local?.value ?? executionDraft(initial.detail);
                latest.current = value;
                locallySaved.current = value;
                setDraft(value);
                // Sets that already hold values or were skipped start out ticked.
                setRecorded(
                    new Set(
                        value.exercises.flatMap((exercise, ex) =>
                            exercise.sets.flatMap((set, index) =>
                                set.skipped || hasValues(set)
                                    ? [`${ex}:${index}`]
                                    : [],
                            ),
                        ),
                    ),
                );
                queue.current = newQueue(
                    local?.version ?? initial.detail.execution!.version,
                );
                setState(local ? "saved-local" : "saved-server");
                if (
                    local &&
                    local.version !== initial.detail.execution!.version
                )
                    setError(
                        new Error(
                            "The server version changed. Your local draft is preserved. Resolve the conflict before completing.",
                        ),
                    );
            })
            .catch((failure) => {
                if (active) setError(failure);
            });
        return () => {
            active = false;
            mounted.current = false;
        };
    }, [initial, newQueue]);
    useEffect(() => {
        const tick = () => {
            const left = restRemaining(endAt);
            setRemaining(left);
            // Rest is over: say so once, then get out of the way.
            if (endAt != null && left === 0) {
                haptic.success();
                setEndAt(null);
            }
        };
        tick();
        const timer = setInterval(tick, 1000);
        const subscription = AppState.addEventListener("change", tick);
        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [endAt]);
    const change = (next: ExecutionDraft) => {
        if (locked.current || !mounted.current) return;
        latest.current = next;
        setDraft(next);
        setError(undefined);
        setState("saving-local");
        setUnpersisted(true);
        void queue.current?.enqueue(next).catch((failure) => {
            if (mounted.current) setError(failure);
        });
    };
    const patchExercise = (
        index: number,
        patch: Partial<ExecutionDraft["exercises"][number]>,
    ) =>
        change({
            ...draft!,
            exercises: draft!.exercises.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
            ),
        });
    const patchSet = (
        exercise: number,
        index: number,
        patch: Partial<ActualSet>,
    ) =>
        patchExercise(exercise, {
            sets: draft!.exercises[exercise]!.sets.map((item, i) =>
                i === index ? { ...item, ...patch } : item,
            ),
        });
    async function save(complete: boolean, replacementVersion?: number) {
        if (
            locked.current ||
            invalidFields.current.size > 0 ||
            !mounted.current ||
            !latest.current ||
            !queue.current
        )
            return;
        locked.current = true;
        setBusy(true);
        setError(undefined);
        try {
            if (replacementVersion !== undefined) {
                // Drain the old queue before replacing it, including failed writes that still persist locally.
                await queue.current.flush().catch(() => {});
                if (!mounted.current) return;
                queue.current = newQueue(replacementVersion);
                setServer(undefined);
            }
            const current = queue.current;
            await current.enqueue(latest.current);
            await current.flush();
            if (!mounted.current) return;
            if (complete)
                await api({
                    path: `/api/v1/training/executions/${execution.id}/complete`,
                    method: "POST",
                    ifMatch: current.version,
                    idempotencyKey: `complete:${execution.id}:${current.version}`,
                });
            await drafts.remove(key);
            if (mounted.current) {
                setState("saved-server");
                if (complete) haptic.success();
                refresh();
            }
        } catch (failure) {
            if (mounted.current) setError(failure);
        } finally {
            locked.current = false;
            if (mounted.current) setBusy(false);
        }
    }
    async function reviewServer() {
        try {
            setServer(
                (
                    await api<WorkoutDetail>({
                        path: `/api/v1/training/workouts/${detail.occurrence.id}`,
                        query: {
                            relationshipId: detail.occurrence.relationshipId,
                        },
                    })
                ).data,
            );
        } catch (failure) {
            setError(failure);
        }
    }
    const header = {
        title: detail.occurrence.name,
        subtitle: joinParts(
            detail.occurrence.programName,
            formatDay(detail.occurrence.scheduledDate),
        ),
    };
    if (!draft)
        return (
            <Screen {...header}>
                {error ? <ErrorState error={error} /> : <LoadingState />}
            </Screen>
        );

    const exerciseName = (exercise: ExecutionDraft["exercises"][number]) =>
        detail.prescription.exercises[exercise.exerciseId]?.name ||
        execution.exercises.find(
            (item) => item.exerciseId === exercise.exerciseId,
        )?.name ||
        "Substituted exercise";
    const total = draft.exercises.reduce(
        (count, exercise) => count + exercise.sets.length,
        0,
    );
    const done = draft.exercises.reduce(
        (count, exercise, ex) =>
            count +
            exercise.sets.filter(
                (set, index) => set.skipped || recorded.has(`${ex}:${index}`),
            ).length,
        0,
    );
    const mark = (id: string, on: boolean) =>
        setRecorded((current) => {
            const next = new Set(current);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });
    const recordSet = (ex: number, index: number, set: ActualSet) => {
        const id = `${ex}:${index}`;
        if (recorded.has(id)) return mark(id, false);
        haptic.confirm();
        mark(id, true);
        // The save and the rest timer start at once; the tick is not held back by either.
        void save(false);
        setEndAt(Date.now() + (set.restSeconds ?? 90) * 1000);
    };
    const detailSet =
        details && draft.exercises[details.ex]?.sets[details.set]
            ? {
                  ...details,
                  value: draft.exercises[details.ex]!.sets[details.set]!,
                  exercise: draft.exercises[details.ex]!,
              }
            : null;
    const closeDetails = () => {
        if (details)
            for (const [field] of detailFields)
                validity(`${details.ex}:${details.set}:${field}`, true);
        setDetails(null);
    };

    return (
        <Screen
            {...header}
            footer={
                <View style={{ gap: theme.spacing.sm }}>
                    {endAt != null && (
                        <ToolbarSurface>
                            <View
                                accessible
                                accessibilityLiveRegion="polite"
                                accessibilityLabel={nativeCopy("interface.Rest, {0} seconds left", {"0": String(remaining)})}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: theme.spacing.sm,
                                    paddingLeft: theme.spacing.sm,
                                }}
                            >
                                <Icon name="timer" tone="brand" />
                                <Text variant="caption" tone="mutedText">

                                    {nativeCopy("interface.Rest")}
                                </Text>
                                <Text variant="numeric" style={{ flex: 1 }}>
                                    {clock(remaining)}
                                </Text>
                                <Button
                                    size="sm"
                                    title="+30 s"
                                    onPress={() =>
                                        setEndAt((current) =>
                                            current == null
                                                ? null
                                                : current + 30000,
                                        )
                                    }
                                />
                                <Button
                                    size="sm"
                                    tone="ghost"
                                    title={nativeCopy("interface.Skip")}
                                    onPress={() => setEndAt(null)}
                                />
                            </View>
                        </ToolbarSurface>
                    )}
                    {canEdit && (
                        <View
                            style={{
                                flexDirection: "row",
                                gap: theme.spacing.sm,
                            }}
                        >
                            {execution.status === "Completed" ? (
                                <View style={{ flex: 1 }}>
                                    <Button
                                        size="lg"
                                        tone="primary"
                                        title={nativeCopy("interface.Save correction")}
                                        loading={busy}
                                        disabled={!valid}
                                        onPress={() => void save(false)}
                                    />
                                </View>
                            ) : (
                                <>
                                    <View style={{ flex: 1 }}>
                                        <Button
                                            size="lg"
                                            title={nativeCopy("interface.Save")}
                                            accessibilityHint="Syncs your draft with the server"
                                            disabled={!valid || busy}
                                            onPress={() => void save(false)}
                                        />
                                    </View>
                                    <View style={{ flex: 2 }}>
                                        <Button
                                            size="lg"
                                            tone="primary"
                                            icon="check"
                                            title={nativeCopy("interface.Finish workout")}
                                            loading={busy}
                                            disabled={!valid}
                                            onPress={async () => {
                                                if (
                                                    await confirm(
                                                        "Finish this workout?",
                                                        done < total
                                                            ? `${total - done} of ${total} sets are not ticked off. You can still correct the log afterwards.`
                                                            : "Your log is sent to your coach. You can still correct it afterwards.",
                                                        "Finish workout",
                                                        {
                                                            destructive: false,
                                                            cancelLabel:
                                                                nativeCopy("interface.Keep training"),
                                                        },
                                                    )
                                                )
                                                    void save(true);
                                            }}
                                        />
                                    </View>
                                </>
                            )}
                        </View>
                    )}
                </View>
            }
        >
            <View style={{ gap: theme.spacing.sm }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: theme.spacing.sm,
                    }}
                >
                    <SaveState state={state} failed={state === "error"} />
                    <Text variant="numericSmall" tone="mutedText">
                        {done} / {total}  {nativeCopy("interface.sets")}
                    </Text>
                </View>
                <ProgressBar value={done} max={total} label={nativeCopy("interface.Sets done")} />
            </View>

            {!valid && (
                <Text variant="caption" tone="danger">

                    {nativeCopy("interface.A value is not a valid number. Fix it to keep saving.")}
                </Text>
            )}
            {!!error && (
                <Section>
                    <ErrorState error={error} />
                    <Button
                        title={nativeCopy("interface.Compare with the server version")}
                        onPress={() => void reviewServer()}
                    />
                </Section>
            )}
            {server?.execution && (
                <Section title={nativeCopy("interface.Latest version on the server")}>
                    <Text variant="caption" tone="mutedText">
                        {joinParts(
                            humanize(server.execution.status),
                            formatDay(server.execution.performedDate),
                            server.execution.comment,
                        )}
                    </Text>
                    {server.execution.exercises.map((exercise) => (
                        <View key={exercise.id} style={{ gap: 2 }}>
                            <Text variant="bodyStrong">{exercise.name}</Text>
                            {exercise.sets.map((set, index) => (
                                <Text
                                    key={index}
                                    variant="caption"
                                    tone="mutedText"
                                >
                                    {index + 1}.{" "}
                                    {set.skipped
                                        ? nativeCopy("interface.Skipped")
                                        : joinParts(
                                              set.reps != null &&
                                                  `${set.reps} reps`,
                                              set.load != null &&
                                                  `${set.load} ${set.loadUnit || ""}`,
                                              set.rpe != null &&
                                                  `RPE ${set.rpe}`,
                                              set.rir != null &&
                                                  `RIR ${set.rir}`,
                                              set.durationSeconds != null &&
                                                  `${set.durationSeconds}s`,
                                              set.distanceMeters != null &&
                                                  `${set.distanceMeters}m`,
                                              set.tempo,
                                              set.comment,
                                          ) || nativeCopy("interface.No values")}
                                </Text>
                            ))}
                        </View>
                    ))}
                    {server.execution.allowedActions.some((action) =>
                        ["save", "edit", "correct"].includes(action),
                    ) && (
                        <Button
                            tone="danger"
                            title={nativeCopy("interface.Replace it with my draft")}
                            disabled={busy || !valid}
                            onPress={async () => {
                                if (
                                    await confirm(
                                        "Use your draft?",
                                        "The server values shown above will be replaced with your local draft. The prescription stays unchanged.",
                                        "Save my draft",
                                    )
                                )
                                    void save(false, server.execution!.version);
                            }}
                        />
                    )}
                </Section>
            )}

            <WorkoutAnnotations detail={detail} />
            {detail.prescription.workout.groups.length > 0 && (
                <Section title={nativeCopy("interface.Structure")}>
                    {detail.prescription.workout.groups.map((group) => (
                        <Text key={group.id} variant="caption" tone="mutedText">
                            {joinParts(
                                humanize(group.kind),
                                `${group.rounds} rounds`,
                                `${group.restSeconds}s rest`,
                                group.exerciseIds
                                    .map((id) =>
                                        detail.prescription.workout.exercises.find(
                                            (ex) => ex.id === id,
                                        ),
                                    )
                                    .map(
                                        (ex) =>
                                            ex &&
                                            detail.prescription.exercises[
                                                ex.exerciseId
                                            ]?.name,
                                    )
                                    .filter(Boolean)
                                    .join(" → "),
                            )}
                        </Text>
                    ))}
                </Section>
            )}

            {draft.exercises.map((exercise, exIndex) => {
                const original = detail.prescription.workout.exercises.find(
                    (item) => item.id === exercise.prescribedInstanceId,
                );
                const plannedName =
                    original &&
                    detail.prescription.exercises[original.exerciseId]?.name;
                const name = exerciseName(exercise);
                return (
                    <Section key={`${exIndex}:${exercise.exerciseId}`}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "flex-start",
                                gap: theme.spacing.sm,
                            }}
                        >
                            <View style={{ flex: 1, gap: 2 }}>
                                <Text accessibilityRole="header" variant="title">
                                    {name}
                                </Text>
                                {plannedName && plannedName !== name ? (
                                    <Text variant="caption" tone="warning">

                                        {nativeCopy("interface.Instead of")} {plannedName}
                                    </Text>
                                ) : null}
                                {original?.comment ? (
                                    <Text variant="caption" tone="mutedText">
                                        {original.comment}
                                    </Text>
                                ) : null}
                            </View>
                            {canEdit && (
                                <IconButton
                                    icon="more"
                                    label={nativeCopy("interface.Options for {0}", {"0": String(name)})}
                                    filled
                                    size={40}
                                    disabled={busy || !valid}
                                    onPress={() => setMenu(exIndex)}
                                />
                            )}
                        </View>
                        {exercise.sets.map((set, index) => {
                            const planned = original?.sets.find(
                                (item) => item.id === set.prescribedSetId,
                            );
                            const prescription =
                                planned?.segments?.find(
                                    (item) =>
                                        item.id === set.prescribedSegmentId,
                                )?.prescription ?? planned?.prescription;
                            const calculated =
                                detail.prescription.formulas[
                                    set.prescribedSegmentId ||
                                        set.prescribedSetId ||
                                        ""
                                ];
                            const disabled = !canEdit || busy || set.skipped;
                            const id = `${exIndex}:${index}`;
                            const extras = joinParts(
                                set.rpe != null && `RPE ${set.rpe}`,
                                set.rir != null && `RIR ${set.rir}`,
                                set.durationSeconds != null &&
                                    `${set.durationSeconds}s`,
                                set.distanceMeters != null &&
                                    `${set.distanceMeters}m`,
                                set.tempo && `tempo ${set.tempo}`,
                                set.comment,
                            );
                            return (
                                <View
                                    key={`${index}:${exercise.sets.length}`}
                                    style={{
                                        gap: theme.spacing.sm,
                                        paddingTop: theme.spacing.md - 4,
                                        borderTopWidth: theme.hairline,
                                        borderTopColor: theme.colors.border,
                                        opacity: set.skipped ? 0.6 : 1,
                                    }}
                                >
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: theme.spacing.sm,
                                        }}
                                    >
                                        <Text variant="bodyStrong">

                                            {nativeCopy("interface.Set")} {index + 1}
                                        </Text>
                                        {planned?.kind &&
                                        planned.kind !== "Standard" ? (
                                            <Badge>
                                                {humanize(planned.kind)}
                                            </Badge>
                                        ) : !planned ? (
                                            <Badge tone="info">{nativeCopy("interface.Extra")}</Badge>
                                        ) : null}
                                        {set.skipped && (
                                            <Badge tone="warning">{nativeCopy("interface.Skipped")}</Badge>
                                        )}
                                        <View style={{ flex: 1 }} />
                                        <Button
                                            size="sm"
                                            tone="ghost"
                                            title={extras ? nativeCopy("interface.Edit details") : nativeCopy("interface.Details")}
                                            disabled={!canEdit || busy}
                                            onPress={() =>
                                                setDetails({
                                                    ex: exIndex,
                                                    set: index,
                                                })
                                            }
                                        />
                                    </View>
                                    <Text variant="caption" tone="mutedText">
                                        {prescription
                                            ? `Plan: ${describePrescription(prescription)}`
                                            : nativeCopy("interface.Added by you")}
                                        {calculated
                                            ? ` · calculated ${calculated.result.value} ${calculated.result.unit}`
                                            : ""}
                                    </Text>
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "flex-end",
                                            gap: theme.spacing.sm,
                                        }}
                                    >
                                        <SetNumber
                                            label={nativeCopy("interface.Reps")}
                                            integer
                                            value={set.reps}
                                            disabled={disabled}
                                            onValidity={(ok) =>
                                                validity(`${id}:reps`, ok)
                                            }
                                            onChange={(reps) =>
                                                patchSet(exIndex, index, {
                                                    reps,
                                                })
                                            }
                                        />
                                        <View style={{ flex: 1.6 }}>
                                            <SetNumber
                                                label={nativeCopy("interface.Load ({0})", {"0": String(set.loadUnit || "kg")})}
                                                value={set.load}
                                                step={
                                                    set.loadUnit === "lb"
                                                        ? 5
                                                        : 2.5
                                                }
                                                disabled={disabled}
                                                onValidity={(ok) =>
                                                    validity(`${id}:load`, ok)
                                                }
                                                onChange={(load) =>
                                                    patchSet(exIndex, index, {
                                                        load,
                                                        loadUnit:
                                                            load == null
                                                                ? null
                                                                : set.loadUnit ||
                                                                  "kg",
                                                    })
                                                }
                                            />
                                        </View>
                                        <CheckButton
                                            checked={
                                                !set.skipped && recorded.has(id)
                                            }
                                            label={nativeCopy("interface.Set {0} done, start rest", {"0": String(index + 1)})}
                                            disabled={disabled || !valid}
                                            onPress={() =>
                                                recordSet(exIndex, index, set)
                                            }
                                        />
                                    </View>
                                    {extras ? (
                                        <Text variant="caption" tone="subtleText">
                                            {extras}
                                        </Text>
                                    ) : null}
                                </View>
                            );
                        })}
                        {canEdit && (
                            <Button
                                tone="ghost"
                                icon="add"
                                title={nativeCopy("interface.Add a set")}
                                disabled={busy || !valid}
                                onPress={() =>
                                    patchExercise(exIndex, {
                                        sets: [...exercise.sets, blankSet()],
                                    })
                                }
                            />
                        )}
                        <Field
                            label={nativeCopy("interface.Exercise note")}
                            placeholder={nativeCopy("interface.How did it feel?")}
                            value={exercise.comment || ""}
                            multiline
                            editable={canEdit && !busy}
                            onChangeText={(comment) =>
                                patchExercise(exIndex, { comment })
                            }
                        />
                    </Section>
                );
            })}

            <Section title={nativeCopy("interface.Session")}>
                <Text variant="caption" tone="mutedText">

                    {nativeCopy("interface.Planned values are a snapshot. Record only what you actually did; blank means unknown.")}
                </Text>
                <NativeDateField
                    label={nativeCopy("interface.Performed on")}
                    value={draft.performedDate}
                    disabled={!canEdit || busy}
                    onChange={(performedDate) =>
                        change({ ...draft, performedDate })
                    }
                />
                <DecimalField
                    label={nativeCopy("interface.Duration (minutes)")}
                    placeholder="e.g. 60"
                    value={
                        draft.durationSeconds == null
                            ? null
                            : Math.round((draft.durationSeconds / 60) * 100) /
                              100
                    }
                    onValidityChange={(ok) => validity("duration", ok)}
                    disabled={!canEdit || busy}
                    onChange={(minutes) =>
                        change({
                            ...draft,
                            durationSeconds:
                                minutes == null
                                    ? null
                                    : Math.round(minutes * 60),
                        })
                    }
                />
                <Field
                    label={nativeCopy("interface.Session note")}
                    placeholder={nativeCopy("interface.Energy, sleep, anything worth noting")}
                    value={draft.comment || ""}
                    multiline
                    editable={canEdit && !busy}
                    onChangeText={(comment) => change({ ...draft, comment })}
                />
            </Section>

            <ActionSheet
                title={menu != null ? exerciseName(draft.exercises[menu]!) : ""}
                open={menu != null}
                onClose={() => setMenu(null)}
                actions={[
                    {
                        value: "substitute",
                        label: nativeCopy("interface.Substitute exercise"),
                        icon: "switchAccount",
                    },
                    {
                        value: "skip",
                        label: nativeCopy("interface.Skip all sets"),
                        icon: "block",
                        destructive: true,
                    },
                ]}
                onSelect={(action) => {
                    if (menu == null) return;
                    if (action === "substitute") setSubstitute(menu);
                    else
                        patchExercise(menu, {
                            sets: draft.exercises[menu]!.sets.map((set) => ({
                                ...set,
                                skipped: true,
                            })),
                        });
                }}
            />

            <BottomSheet
                title={nativeCopy("interface.Substitute exercise")}
                subtitle={
                    substitute != null
                        ? `Replaces ${exerciseName(draft.exercises[substitute]!)} in this session only`
                        : undefined
                }
                open={substitute != null}
                size="full"
                onClose={() => {
                    setSubstitute(null);
                    setSearch("");
                }}
            >
                {substitute != null && (
                    <>
                        <SearchField
                    label={nativeCopy("interface.Search exercises")}
                    value={search}
                    onChangeText={setSearch}
                />
                {catalog.isPending ? (
                    <LoadingState />
                ) : catalog.error ? (
                    <ErrorState
                        error={catalog.error}
                        retry={() => void catalog.refetch()}
                    />
                ) : catalog.data?.items.length ? (
                    <View>
                        {catalog.data.items.map((item) => (
                            <ListItem
                                key={item.id}
                                icon="exercise"
                                title={item.name}
                                trailing={<Icon name="add" tone="brand" />}
                                onPress={() => {
                                    if (
                                        substitute == null ||
                                        locked.current ||
                                        invalidFields.current.size > 0
                                    )
                                        return;
                                    patchExercise(substitute, {
                                        exerciseId: item.id,
                                        sets: draft.exercises[
                                            substitute
                                        ]!.sets.map((set) => ({
                                            ...set,
                                            load: null,
                                            loadUnit: null,
                                        })),
                                    });
                                    setSubstitute(null);
                                    setSearch("");
                                }}
                            />
                        ))}
                    </View>
                ) : (
                    <EmptyState
                        icon="search"
                        title={nativeCopy("interface.No exercises match")}
                        description={nativeCopy("interface.Try another name.")}
                    />
                )}
                    </>
                )}
            </BottomSheet>

            <BottomSheet
                title={detailSet ? `Set ${detailSet.set + 1}` : ""}
                subtitle={detailSet ? exerciseName(detailSet.exercise) : undefined}
                open={!!detailSet}
                size="full"
                onClose={closeDetails}
                footer={
                    <Button
                        size="lg"
                        tone="primary"
                        title={nativeCopy("interface.Done")}
                        onPress={closeDetails}
                    />
                }
            >
                {detailSet && (
                    <View
                        key={`${detailSet.ex}:${detailSet.set}`}
                        style={{ gap: theme.spacing.md }}
                    >
                        {detailFields.map(([field, label]) => (
                            <DecimalField
                                key={field}
                                label={label}
                                value={detailSet.value[field]}
                                disabled={busy || detailSet.value.skipped}
                                onValidityChange={(ok) =>
                                    validity(
                                        `${detailSet.ex}:${detailSet.set}:${field}`,
                                        ok,
                                    )
                                }
                                onChange={(value) =>
                                    patchSet(detailSet.ex, detailSet.set, {
                                        [field]: value,
                                    })
                                }
                            />
                        ))}
                        <Choices
                            label={nativeCopy("interface.Load unit")}
                            values={["kg", "lb"]}
                            value={detailSet.value.loadUnit || "kg"}
                            disabled={busy || detailSet.value.skipped}
                            onChange={(loadUnit) =>
                                patchSet(detailSet.ex, detailSet.set, {
                                    loadUnit,
                                })
                            }
                        />
                        <Choices
                            label={nativeCopy("interface.What the load means")}
                            values={
                                [
                                    "TotalExternal",
                                    "PerHand",
                                    "Bodyweight",
                                    "Assisted",
                                ] as const
                            }
                            labels={{
                                TotalExternal: "Total on the bar",
                                PerHand: "Per hand",
                                Bodyweight: "Bodyweight",
                                Assisted: "Assisted",
                            }}
                            value={detailSet.value.loadMeaning}
                            disabled={busy || detailSet.value.skipped}
                            onChange={(loadMeaning) =>
                                patchSet(detailSet.ex, detailSet.set, {
                                    loadMeaning,
                                })
                            }
                        />
                        <Field
                            label={nativeCopy("interface.Tempo")}
                            placeholder="e.g. 3-1-1-0"
                            value={detailSet.value.tempo || ""}
                            editable={!busy && !detailSet.value.skipped}
                            onChangeText={(tempo) =>
                                patchSet(detailSet.ex, detailSet.set, { tempo })
                            }
                        />
                        <Field
                            label={nativeCopy("interface.Note")}
                            placeholder={nativeCopy("interface.Anything about this set")}
                            value={detailSet.value.comment || ""}
                            editable={!busy && !detailSet.value.skipped}
                            onChangeText={(comment) =>
                                patchSet(detailSet.ex, detailSet.set, {
                                    comment,
                                })
                            }
                        />
                        <Button
                            title={
                                detailSet.value.skipped
                                    ? nativeCopy("interface.Include this set again")
                                    : nativeCopy("interface.Skip this set")
                            }
                            icon={detailSet.value.skipped ? "add" : "block"}
                            disabled={busy || !valid}
                            onPress={() =>
                                patchSet(detailSet.ex, detailSet.set, {
                                    skipped: !detailSet.value.skipped,
                                })
                            }
                        />
                        {!detailSet.value.prescribedSetId && (
                            <Button
                                tone="danger"
                                icon="delete"
                                title={nativeCopy("interface.Remove this extra set")}
                                disabled={busy || !valid}
                                onPress={() => {
                                    const { ex, set } = detailSet;
                                    closeDetails();
                                    // Ticks follow their sets: later sets of this exercise move up one.
                                    setRecorded((current) => {
                                        const next = new Set<string>();
                                        for (const id of current) {
                                            const [e, i] = id
                                                .split(":")
                                                .map(Number) as [number, number];
                                            if (e !== ex || i < set) next.add(id);
                                            else if (i > set)
                                                next.add(`${e}:${i - 1}`);
                                        }
                                        return next;
                                    });
                                    patchExercise(ex, {
                                        sets: draft.exercises[ex]!.sets.filter(
                                            (_, i) => i !== set,
                                        ),
                                    });
                                }}
                            />
                        )}
                    </View>
                )}
            </BottomSheet>
        </Screen>
    );
}

/** A workout that has not been started: what is planned, then one clear way in. */
function Preview({
    detail,
    id,
    refresh,
}: {
    detail: WorkoutDetail;
    id: string;
    refresh: () => void;
}) {
 const nativeCopy = useNativeCopy().t;

    const theme = useTheme();
    const mutation = useApiMutation(refresh);
    const [skipping, setSkipping] = useState(false);
    const [reason, setReason] = useState("");
    const canStart = detail.occurrence.allowedActions.includes("start");
    const canSkip = detail.occurrence.allowedActions.includes("skip");
    return (
        <Screen
            title={detail.occurrence.name}
            subtitle={joinParts(
                detail.occurrence.programName,
                formatDay(detail.occurrence.scheduledDate),
            )}
            footer={
                canStart || canSkip ? (
                    <View style={{ gap: theme.spacing.sm }}>
                        {canStart && (
                            <Button
                                size="lg"
                                tone="primary"
                                icon="play"
                                title={nativeCopy("interface.Start workout")}
                                loading={mutation.isPending && !skipping}
                                onPress={() =>
                                    mutation.mutate({
                                        path: `/api/v1/training/workouts/${id}/start`,
                                        method: "POST",
                                    })
                                }
                            />
                        )}
                        {canSkip && (
                            <Button
                                tone="ghost"
                                title={nativeCopy("interface.Skip this workout")}
                                disabled={mutation.isPending}
                                onPress={() => setSkipping(true)}
                            />
                        )}
                    </View>
                ) : undefined
            }
        >
            <StatusBadge status={detail.occurrence.status} />
            {!!mutation.error && !skipping && (
                <ErrorState error={mutation.error} />
            )}
            <WorkoutAnnotations detail={detail} />
            {detail.prescription.workout.exercises.map((exercise) => (
                <Section
                    key={exercise.id}
                    title={
                        detail.prescription.exercises[exercise.exerciseId]
                            ?.name ?? nativeCopy("interface.Exercise")
                    }
                >
                    {exercise.comment ? (
                        <Text variant="caption" tone="mutedText">
                            {exercise.comment}
                        </Text>
                    ) : null}
                    {exercise.sets.map((set, index) => (
                        <View
                            key={set.id}
                            style={{
                                flexDirection: "row",
                                gap: theme.spacing.sm,
                            }}
                        >
                            <Text variant="numericSmall" tone="subtleText">
                                {index + 1}
                            </Text>
                            <Text
                                variant="caption"
                                tone="mutedText"
                                style={{ flex: 1 }}
                            >
                                {set.kind !== "Standard"
                                    ? `${humanize(set.kind)} · `
                                    : ""}
                                {describePrescription(set.prescription)}
                                {set.segments
                                    ?.map(
                                        (segment) =>
                                            ` / ${describePrescription(segment.prescription)}`,
                                    )
                                    .join("")}
                            </Text>
                        </View>
                    ))}
                </Section>
            ))}
            <BottomSheet
                title={nativeCopy("interface.Skip this workout?")}
                subtitle={nativeCopy("interface.Your coach sees that it was skipped")}
                open={skipping}
                dirty={reason.length > 0}
                onClose={() => {
                    setSkipping(false);
                    setReason("");
                    mutation.reset();
                }}
                footer={
                    <Button
                        size="lg"
                        tone="danger"
                        title={nativeCopy("interface.Skip workout")}
                        loading={mutation.isPending}
                        onPress={() =>
                            mutation.mutate({
                                path: `/api/v1/training/workouts/${id}/skip`,
                                method: "POST",
                                json: { reason },
                            })
                        }
                    />
                }
            >
                <Field
                    label={nativeCopy("interface.Reason (optional)")}
                    placeholder={nativeCopy("interface.e.g. Felt sick, travelling")}
                    value={reason}
                    onChangeText={setReason}
                />
                {!!mutation.error && <ErrorState error={mutation.error} />}
            </BottomSheet>
        </Screen>
    );
}

function WorkoutAnnotations({ detail }: { detail: WorkoutDetail }) {
    return <>{detail.prescription.annotations?.map(note => <Section key={note.id} title={`${note.kind}: ${note.title}`}><Text>{note.content}</Text></Section>)}</>;
}

export function WorkoutScreen() {
 const nativeCopy = useNativeCopy().t;

    const { id, relationshipId } = useLocalSearchParams<{
        id: string;
        relationshipId?: string;
    }>();
    const query = useApiQuery<WorkoutDetail>(
        `/api/v1/training/workouts/${encodeURIComponent(id)}`,
        { relationshipId },
    );
    const detail = query.data;
    if (query.isPending)
        return (
            <Screen title={nativeCopy("interface.Workout")}>
                <LoadingState />
            </Screen>
        );
    if (query.error || !detail)
        return (
            <Screen title={nativeCopy("interface.Workout")}>
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    return detail.execution && detail.execution.status !== "Skipped" ? (
        <Editor
            key={`${detail.execution.id}:${detail.execution.status}`}
            detail={detail}
            refresh={() => void query.refetch()}
        />
    ) : (
        <Preview
            detail={detail}
            id={id}
            refresh={() => void query.refetch()}
        />
    );
}
