import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { Schema } from "@trainflow/api-client-web";
import {
    Badge,
    Button,
    EmptyState,
    ErrorState,
    ListItem,
    LoadingState,
    Screen,
    Section,
    Stat,
    Text,
    useTheme,
} from "@trainflow/ui-mobile";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { CheckInSheet, type CheckInTarget } from "../check-ins";
import { formatDateTime, formatDay, joinParts } from "../shared/format";
import { Schedule } from "../training";
import { localDate, type Page } from "../training/model";
import { calendarWeek } from "./model";

type CheckIn = Schema<"CheckInRequestDto">;

export function TodayScreen() {
    const { role } = useMobile();
    const theme = useTheme();
    const [eventRange] = useState(calendarWeek);
    const active = useApiQuery<Page<Schema<"OccurrenceDto">>>(
        "/api/v1/training/schedule",
        {
            from: localDate(new Date(Date.now() - 365 * 86400000)),
            to: localDate(),
            status: "InProgress",
            page: 1,
            pageSize: 10,
            view: role,
        },
    );
    const checkIns = useApiQuery<Page<CheckIn>>("/api/v1/check-ins/requests", {
        role,
        page: 1,
        pageSize: 10,
        status: role === "coach" ? "Submitted" : "Available",
        sort: "due",
    });
    const overdue = useApiQuery<Page<CheckIn>>("/api/v1/check-ins/requests", {
        role,
        page: 1,
        pageSize: 10,
        status: "Overdue",
        sort: "due",
    });
    const events = useApiQuery<Page<Schema<"EventDto">>>(
        "/api/v1/calendar/events",
        {
            ...eventRange,
            role,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            page: 1,
            pageSize: 10,
        },
    );
    const clients = useApiQuery<Page<Schema<"CoachRelationshipDto">>>(
        "/api/v1/coaching/clients",
        { status: "Active", page: 1, pageSize: 1 },
        role === "coach",
    );
    const leads = useApiQuery<Page<Schema<"ApplicationDto">>>(
        "/api/v1/coaching/leads",
        { page: 1, pageSize: 1 },
        role === "coach",
    );
    const [checkIn, setCheckIn] = useState<CheckInTarget>();
    const openCheckIn = (item: CheckIn) =>
        setCheckIn({ id: item.id, relationshipId: item.relationshipId });
    const checkInGroups = [
        {
            title: role === "coach" ? "Awaiting your review" : "Check-ins to fill in",
            empty:
                role === "coach"
                    ? "No submitted check-ins are waiting."
                    : "No check-ins are waiting for you.",
            query: checkIns,
            overdue: false,
        },
        {
            title: "Overdue check-ins",
            empty: "Nothing is overdue.",
            query: overdue,
            overdue: true,
        },
    ];
    return (
        <Screen
            title="Today"
            eyebrow={new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
            })}
        >
            {role === "coach" && (
                <Section>
                    {clients.error || leads.error ? (
                        <ErrorState error={clients.error || leads.error} />
                    ) : (
                        <View style={{ flexDirection: "row" }}>
                            <Stat
                                label="Active clients"
                                value={clients.data?.total ?? "–"}
                            />
                            <Stat
                                label="Leads to answer"
                                value={leads.data?.total ?? "–"}
                                tone={leads.data?.total ? "brand" : "text"}
                            />
                        </View>
                    )}
                </Section>
            )}

            {/* An unfinished session is the most likely reason to open the app: it leads. */}
            {active.error ? (
                <ErrorState error={active.error} />
            ) : (
                active.data?.items.map((item) => (
                    <Section key={item.id}>
                        <View style={{ gap: theme.spacing.xs }}>
                            <Badge tone="brand">In progress</Badge>
                            <Text variant="title">{item.name}</Text>
                            <Text variant="caption" tone="mutedText">
                                {joinParts(
                                    item.programName,
                                    formatDay(item.scheduledDate),
                                )}
                            </Text>
                        </View>
                        <Button
                            size="lg"
                            tone="primary"
                            icon="play"
                            title="Continue workout"
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
                    </Section>
                ))
            )}

            <Schedule today title="Workouts today" />

            {checkInGroups.map(({ title, empty, query, overdue: late }) =>
                // The overdue group only takes space when something is actually overdue.
                late && !query.error && !query.data?.items.length ? null : (
                    <Section
                        key={title}
                        title={title}
                        action={
                            query.data?.total ? (
                                <Badge tone={late ? "danger" : "info"}>
                                    {query.data.total}
                                </Badge>
                            ) : undefined
                        }
                    >
                        {query.isPending ? (
                            <LoadingState />
                        ) : query.error ? (
                            <ErrorState
                                error={query.error}
                                retry={() => void query.refetch()}
                            />
                        ) : query.data?.items.length ? (
                            query.data.items.map((item) => (
                                <ListItem
                                    key={item.id}
                                    icon="checkIn"
                                    title={item.scheduleName}
                                    subtitle={`Due ${formatDateTime(item.dueAtUtc)}`}
                                    onPress={() => openCheckIn(item)}
                                />
                            ))
                        ) : (
                            <Text variant="caption" tone="mutedText">
                                {empty}
                            </Text>
                        )}
                    </Section>
                ),
            )}

            <Section title="This week">
                {events.isPending ? (
                    <LoadingState />
                ) : events.error ? (
                    <ErrorState
                        error={events.error}
                        retry={() => void events.refetch()}
                    />
                ) : events.data?.items.length ? (
                    events.data.items.map((item) => (
                        <ListItem
                            key={item.id}
                            icon="calendar"
                            title={item.title}
                            subtitle={joinParts(
                                formatDateTime(item.startsAtUtc),
                                item.organizerName,
                            )}
                            trailing={
                                item.cancelled ? (
                                    <Badge tone="danger">Cancelled</Badge>
                                ) : item.response ? (
                                    <Badge>{item.response}</Badge>
                                ) : undefined
                            }
                            onPress={() =>
                                router.push({
                                    pathname: "/event/[id]",
                                    params: { id: item.id },
                                })
                            }
                        />
                    ))
                ) : (
                    <EmptyState
                        icon="calendar"
                        title="No events this week"
                    />
                )}
            </Section>
            <CheckInSheet
                target={checkIn}
                onClose={() => setCheckIn(undefined)}
            />
        </Screen>
    );
}
