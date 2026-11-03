import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { NativeDateField } from "./NativeDateField";
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Schema } from "@metrivum/api-client-web";
import {
    Screen,
    Text,
    Heading,
    Overline,
    Section,
    SegmentedControl,
    ListItem,
    LoadingState,
    ErrorState,
    EmptyState,
    useTheme,
} from "@metrivum/ui-mobile";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { Filters } from "../shared/Filters";
import {
    StatusBadge,
    formatDay,
    humanize,
    joinParts,
} from "../shared/format";
import { TrainingProgress } from "./Progress";
import { Choices, Pagination } from "./components";
import { localDate, describePrescription, type Page } from "./model";
export { WorkoutScreen } from "./WorkoutScreen";

const occurrenceIcon = (status: string) =>
    status === "Completed"
        ? "checkCircle"
        : status === "InProgress"
          ? "play"
          : status === "Missed" || status === "Skipped"
            ? "block"
            : "workout";

/** One scheduled workout as a row: what, which program, when, and its state. */
export function WorkoutRow({
    item,
    showDate = true,
}: {
    item: Schema<"OccurrenceDto">;
    showDate?: boolean;
}) {
    return (
        <ListItem
            icon={occurrenceIcon(item.status)}
            title={item.name}
            subtitle={joinParts(
                item.programName,
                showDate && formatDay(item.scheduledDate),
                item.exerciseCount != null && `${item.exerciseCount} exercises`,
            )}
            trailing={
                item.status === "Scheduled" ? undefined : (
                    <StatusBadge status={item.status} />
                )
            }
            onPress={() =>
                router.push({
                    pathname: "/workout/[id]",
                    params: {
                        id: item.id,
                        relationshipId: item.relationshipId,
                    },
                })
            }
        />
    );
}

const scheduleStatuses = [
    "",
    "Scheduled",
    "InProgress",
    "Completed",
    "Skipped",
    "Missed",
] as const;

export function Schedule({
    relationshipId,
    programId,
    today = false,
    title,
}: {
    relationshipId?: string;
    programId?: string;
    today?: boolean;
    title?: string;
}) {
 const nativeCopy = useNativeCopy().t;

    const { role } = useMobile();
    const initial = () => ({
        from: localDate(new Date(Date.now() - (today ? 0 : 30) * 86400000)),
        to: localDate(new Date(Date.now() + (today ? 0 : 30) * 86400000)),
        status: "",
    });
    const [filter, setFilter] = useState(initial);
    const [page, setPage] = useState(1);
    const update = (patch: Partial<ReturnType<typeof initial>>) => {
        setFilter((current) => ({ ...current, ...patch }));
        setPage(1);
    };
    const query = useApiQuery<Page<Schema<"OccurrenceDto">>>(
        "/api/v1/training/schedule",
        {
            relationshipId,
            programId,
            from: filter.from,
            to: filter.to,
            status: filter.status || undefined,
            page,
            pageSize: 20,
            view: role,
        },
    );
    return (
        <Section
            title={title}
            action={
                today ? undefined : (
                    <Filters
                        title={nativeCopy("interface.Filter workouts")}
                        active={!!filter.status}
                        summary={joinParts(
                            `${formatDay(filter.from)} – ${formatDay(filter.to)}`,
                            humanize(filter.status),
                        )}
                        onReset={() => {
                            setFilter(initial());
                            setPage(1);
                        }}
                    >
                        <NativeDateField
                            label={nativeCopy("interface.From")}
                            value={filter.from}
                            onChange={(from) => update({ from })}
                        />
                        <NativeDateField
                            label={nativeCopy("interface.Through")}
                            value={filter.to}
                            onChange={(to) => update({ to })}
                        />
                        <Choices
                            label={nativeCopy("interface.Status")}
                            values={scheduleStatuses}
                            value={filter.status}
                            onChange={(status) => update({ status })}
                        />
                    </Filters>
                )
            }
        >
            {query.isPending ? (
                <LoadingState />
            ) : query.error ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : (
                query.data && (
                    <>
                        {query.data.items.length ? (
                            query.data.items.map((item) => (
                                <WorkoutRow
                                    key={item.id}
                                    item={item}
                                    showDate={!today}
                                />
                            ))
                        ) : (
                            <EmptyState
                                icon="workout"
                                title={
                                    today
                                        ? nativeCopy("interface.No workouts today")
                                        : nativeCopy("interface.No workouts in this period")
                                }
                                description={
                                    today
                                        ? nativeCopy("interface.Rest day. Earlier sessions are in History.")
                                        : nativeCopy("interface.Change the dates or the status filter.")
                                }
                            />
                        )}
                        <Pagination data={query.data} onChange={setPage} />
                    </>
                )
            )}
        </Section>
    );
}

export function AssignmentList({
    relationshipId,
}: {
    relationshipId?: string;
}) {
 const nativeCopy = useNativeCopy().t;

    const { role } = useMobile();
    const [page, setPage] = useState(1);
    const query = useApiQuery<Page<Schema<"AssignmentDto">>>(
        "/api/v1/training/assignments",
        { relationshipId, page, pageSize: 20, view: role },
    );
    return (
        <Section title={nativeCopy("interface.Assigned programs")}>
            {query.isPending ? (
                <LoadingState />
            ) : query.error ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : (
                query.data && (
                    <>
                        {query.data.items.map((item) => (
                            <ListItem
                                key={item.id}
                                icon="plans"
                                title={item.programName}
                                subtitle={nativeCopy("interface.Starts {0}", {"0": String(formatDay(item.startDate))})}
                                trailing={<StatusBadge status={item.status} />}
                                onPress={() =>
                                    router.push({
                                        pathname: "/plan/[id]",
                                        params: {
                                            id: item.id,
                                            kind: "assignment",
                                        },
                                    })
                                }
                            />
                        ))}
                        {!query.data.items.length && (
                            <EmptyState
                                icon="plans"
                                title={nativeCopy("interface.No assigned programs")}
                                description={
                                    role === "coach"
                                        ? nativeCopy("interface.Programs you assign in the web app appear here.")
                                        : nativeCopy("interface.Programs from your coach appear here.")
                                }
                            />
                        )}
                        <Pagination data={query.data} onChange={setPage} />
                    </>
                )
            )}
        </Section>
    );
}

export function TrainingPlansScreen() {
 const nativeCopy = useNativeCopy().t;

    const [page, setPage] = useState(1);
    const query = useApiQuery<Page<Schema<"PurchasedPlanDto">>>(
        "/api/v1/training/purchases",
        { page, pageSize: 20 },
    );
    return (
        <Screen
            title={nativeCopy("interface.Plans")}
            subtitle={nativeCopy("interface.Programs from your coach and plans you own")}
        >
            <AssignmentList />
            <Section title={nativeCopy("interface.Owned plans")}>
                {query.isPending ? (
                    <LoadingState />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : (
                    query.data && (
                        <>
                            {query.data.items.map((item) => (
                                <ListItem
                                    key={item.orderId}
                                    icon={item.planId ? "document" : "lock"}
                                    title={item.name}
                                    subtitle={
                                        item.planId
                                            ? nativeCopy("interface.Your own copy")
                                            : nativeCopy("interface.Locked until it is paid for. Payments are made in the web app.")
                                    }
                                    onPress={
                                        item.planId
                                            ? () =>
                                                  router.push({
                                                      pathname: "/plan/[id]",
                                                      params: {
                                                          id: item.planId!,
                                                          kind: "owned",
                                                      },
                                                  })
                                            : undefined
                                    }
                                />
                            ))}
                            {!query.data.items.length && (
                                <EmptyState
                                    icon="document"
                                    title={nativeCopy("interface.No owned plans")}
                                    description={nativeCopy("interface.Plans you buy from a coach appear here.")}
                                />
                            )}
                            <Pagination data={query.data} onChange={setPage} />
                        </>
                    )
                )}
            </Section>
        </Screen>
    );
}

export function HistoryScreen() {
 const nativeCopy = useNativeCopy().t;

    const [view, setView] = useState<"log" | "progress">("log");
    return (
        <Screen title={nativeCopy("interface.History")} subtitle={nativeCopy("interface.Your training log and progress")}>
            <SegmentedControl
                label={nativeCopy("interface.History view")}
                value={view}
                onChange={setView}
                options={[
                    { value: "log", label: nativeCopy("interface.Workouts") },
                    { value: "progress", label: nativeCopy("interface.Progress") },
                ]}
            />
            {view === "log" ? <Schedule /> : <TrainingProgress />}
        </Screen>
    );
}

function AssignmentPlan({ id }: { id: string }) {
 const nativeCopy = useNativeCopy().t;

    const query = useApiQuery<Schema<"AssignmentDto">>(
        `/api/v1/training/assignments/${id}`,
    );
    if (query.isPending)
        return (
            <Screen title={nativeCopy("interface.Plan")}>
                <LoadingState />
            </Screen>
        );
    if (query.error || !query.data)
        return (
            <Screen title={nativeCopy("interface.Plan")}>
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    return (
        <Screen
            title={query.data.programName}
            subtitle={joinParts(
                `Starts ${formatDay(query.data.startDate)}`,
                query.data.timeZone,
            )}
        >
            <StatusBadge status={query.data.status} />
            <Text variant="caption" tone="mutedText">

                {nativeCopy("interface.Open a workout to see exactly what was prescribed for that day.")}
            </Text>
            <Schedule
                title={nativeCopy("interface.Workouts")}
                relationshipId={query.data.relationshipId}
                programId={query.data.programId}
            />
        </Screen>
    );
}

function OwnedPlan({ id }: { id: string }) {
 const nativeCopy = useNativeCopy().t;

    const theme = useTheme();
    const query = useApiQuery<Schema<"PlanDto">>(
        `/api/v1/training/programs/${id}`,
    );
    if (query.isPending)
        return (
            <Screen title={nativeCopy("interface.Plan")}>
                <LoadingState />
            </Screen>
        );
    if (query.error || !query.data)
        return (
            <Screen title={nativeCopy("interface.Plan")}>
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    return (
        <Screen title={query.data.name} subtitle={query.data.description}>
            {query.data.document.blocks.map((block) => (
                <View key={block.id} style={{ gap: theme.spacing.md }}>
                    {/* A cycle or workout outside every block or cycle comes without a heading of its own. */}
                    {block.implicit ? null : <Overline>{block.name}</Overline>}
                    {block.cycles.map((cycle) => (
                        <View key={cycle.id} style={{ gap: theme.spacing.md }}>
                            {cycle.implicit ? null : (
                                <Heading level="title">
                                    {cycle.name} · {cycle.dayCount}  {nativeCopy("interface.days")}
                                </Heading>
                            )}
                            {cycle.days.map((day) =>
                                day.workouts.map((workout) => (
                                    <Section
                                        key={workout.id}
                                        title={joinParts(
                                            `Day ${day.dayNumber}`,
                                            workout.name,
                                        )}
                                    >
                                        {day.note ? (
                                            <Text
                                                variant="caption"
                                                tone="mutedText"
                                            >
                                                {day.note}
                                            </Text>
                                        ) : null}
                                        {workout.description ? (
                                            <Text tone="mutedText">
                                                {workout.description}
                                            </Text>
                                        ) : null}
                                        {workout.groups.map((group) => (
                                            <Text
                                                key={group.id}
                                                variant="caption"
                                                tone="mutedText"
                                            >
                                                {joinParts(
                                                    humanize(group.kind),
                                                    `${group.rounds} rounds`,
                                                    `${group.restSeconds}s rest`,
                                                )}
                                            </Text>
                                        ))}
                                        {workout.exercises.map(
                                            (exercise, index) => (
                                                <View
                                                    key={exercise.id}
                                                    style={{
                                                        gap: theme.spacing.xs,
                                                        paddingTop:
                                                            theme.spacing.sm,
                                                        borderTopWidth:
                                                            index === 0
                                                                ? 0
                                                                : theme.hairline,
                                                        borderTopColor:
                                                            theme.colors.border,
                                                    }}
                                                >
                                                    <Text variant="bodyStrong">

                                                        {nativeCopy("interface.Exercise")} {index + 1}
                                                    </Text>
                                                    {exercise.comment ? (
                                                        <Text
                                                            variant="caption"
                                                            tone="mutedText"
                                                        >
                                                            {exercise.comment}
                                                        </Text>
                                                    ) : null}
                                                    {exercise.sets.map(
                                                        (set, setIndex) => (
                                                            <Text
                                                                key={set.id}
                                                                variant="caption"
                                                                tone="mutedText"
                                                            >
                                                                {setIndex + 1}.{" "}
                                                                {humanize(
                                                                    set.kind,
                                                                )}{" "}
                                                                ·{" "}
                                                                {describePrescription(
                                                                    set.prescription,
                                                                )}
                                                                {set.segments
                                                                    ?.map(
                                                                        (
                                                                            segment,
                                                                        ) =>
                                                                            ` / ${describePrescription(segment.prescription)}`,
                                                                    )
                                                                    .join("")}
                                                            </Text>
                                                        ),
                                                    )}
                                                </View>
                                            ),
                                        )}
                                    </Section>
                                )),
                            )}
                        </View>
                    ))}
                </View>
            ))}
        </Screen>
    );
}

export function PlanScreen() {
    const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
    return kind === "assignment" ? (
        <AssignmentPlan id={id} />
    ) : (
        <OwnedPlan id={id} />
    );
}
