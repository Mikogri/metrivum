import { useEffect, useState } from "react";
import { Keyboard, Linking, Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { Schema } from "@trainflow/api-client-web";
import {
    Avatar,
    Badge,
    BottomSheet,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Field,
    FieldButton,
    Icon,
    IconButton,
    ListItem,
    LoadingState,
    Screen,
    SearchField,
    Section,
    SegmentedControl,
    Text,
    confirm,
    useTheme,
    Switch,
} from "@trainflow/ui-mobile";
import { formatDateTime, formatDay } from "../shared/format";
import { useMobile } from "../../infrastructure/session/MobileSession";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { Pagination } from "../training/components";
import type { Page } from "../training/model";
import { eventTimes } from "./model";

const root = "/api/v1/calendar/events";
type Event = Schema<"EventDto">;
const deviceZone = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const lastDay = (event: Event) =>
    new Date(Date.parse(`${event.endDateExclusive}T00:00:00Z`) - 86400000)
        .toISOString()
        .slice(0, 10);
const when = (event: Event) =>
    event.startDate && event.endDateExclusive
        ? event.startDate === lastDay(event)
            ? `${formatDay(event.startDate)} · all day`
            : `${formatDay(event.startDate)} – ${formatDay(lastDay(event))} · all day`
        : `${formatDateTime(event.startsAtUtc)} – ${new Date(
              event.endsAtUtc,
          ).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
          })}`;
const responseBadge = (event: Event) =>
    event.cancelled ? (
        <Badge tone="danger">Cancelled</Badge>
    ) : event.response === "Accepted" ? (
        <Badge tone="success">Accepted</Badge>
    ) : event.response === "Declined" ? (
        <Badge tone="danger">Declined</Badge>
    ) : undefined;

export function CalendarScreen() {
    const { role } = useMobile();
    const [month, setMonth] = useState(
        () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    );
    const [page, setPage] = useState(1);
    const from = month.toISOString();
    const to = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        1,
    ).toISOString();
    const events = useApiQuery<Page<Event>>(root, {
        role,
        from,
        to,
        timeZone: deviceZone(),
        page,
        pageSize: 50,
    });
    const move = (delta: number) => {
        setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
        setPage(1);
    };
    const theme = useTheme();
    return (
        <Screen
            title="Calendar"
            headerAction={
                role === "coach" ? (
                    <IconButton
                        icon="add"
                        label="New event or meeting"
                        filled
                        onPress={() =>
                            router.push({
                                pathname: "/event/[id]",
                                params: { id: "new" },
                            })
                        }
                    />
                ) : undefined
            }
        >
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.sm,
                }}
            >
                <IconButton
                    icon="back"
                    label="Previous month"
                    filled
                    size={40}
                    onPress={() => move(-1)}
                />
                <View style={{ flex: 1, alignItems: "center" }}>
                    <Text variant="title">
                        {month.toLocaleDateString(undefined, {
                            month: "long",
                            year: "numeric",
                        })}
                    </Text>
                    <Text variant="caption" tone="subtleText">
                        {deviceZone()}
                    </Text>
                </View>
                <IconButton
                    icon="chevronRight"
                    label="Next month"
                    filled
                    size={40}
                    onPress={() => move(1)}
                />
            </View>
            {events.isPending ? (
                <LoadingState />
            ) : events.error ? (
                <ErrorState
                    error={events.error}
                    retry={() => void events.refetch()}
                />
            ) : (
                events.data &&
                (events.data.items.length ? (
                    <Section>
                        {events.data.items.map((event) => (
                            <ListItem
                                key={event.id}
                                icon={
                                    event.kind === "Meeting"
                                        ? "clients"
                                        : "calendar"
                                }
                                title={event.title}
                                subtitle={when(event)}
                                trailing={responseBadge(event)}
                                onPress={() =>
                                    router.push({
                                        pathname: "/event/[id]",
                                        params: { id: event.id },
                                    })
                                }
                            />
                        ))}
                        <Pagination data={events.data} onChange={setPage} />
                    </Section>
                ) : (
                    <EmptyState
                        icon="calendar"
                        title="Nothing planned this month"
                        description={
                            role === "coach"
                                ? "Add a meeting or an event with the plus button."
                                : "Meetings and events from your coach appear here."
                        }
                    />
                ))
            )}
        </Screen>
    );
}

export function EventScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { accountId, role } = useMobile();
    return id === "new" ? (
        <Screen title="New event">
            {role === "coach" ? (
                <EventEditor
                    key={accountId}
                    saved={(event) =>
                        router.replace({
                            pathname: "/event/[id]",
                            params: { id: event.id },
                        })
                    }
                />
            ) : (
                <EmptyState
                    icon="lock"
                    title="Only coaches create events"
                    description="Switch to the Coach view in More to add one."
                />
            )}
        </Screen>
    ) : (
        <EventDetail key={`${accountId}:${id}`} id={id} />
    );
}

function EventDetail({ id }: { id: string }) {
    const { role, profile } = useMobile();
    const theme = useTheme();
    const [editing, setEditing] = useState(false);
    const query = useApiQuery<Event>(`${root}/${id}`, { role });
    const action = useApiMutation(() => void query.refetch());
    const event = query.data;
    if (editing && event)
        return (
            <Screen title="Edit event">
                <EventEditor
                    key={event.id}
                    initial={event}
                    saved={() => {
                        setEditing(false);
                        void query.refetch();
                    }}
                    cancel={() => setEditing(false)}
                />
            </Screen>
        );
    if (query.isPending)
        return (
            <Screen title="Event">
                <LoadingState />
            </Screen>
        );
    if (query.error || !event)
        return (
            <Screen title="Event">
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    const owner =
        !event.cancelled && role === "coach" && event.coachId === profile.id;
    const invited =
        !event.cancelled && role === "client" && event.responseVersion != null;
    const link =
        event.meetingUrl && /^https?:\/\//i.test(event.meetingUrl)
            ? event.meetingUrl
            : null;
    return (
        <Screen
            title={event.title}
            subtitle={when(event)}
            footer={
                owner ? (
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                        <View style={{ flex: 1 }}>
                            <Button
                                size="lg"
                                tone="danger"
                                title="Cancel event"
                                loading={action.isPending}
                                onPress={async () => {
                                    if (
                                        await confirm(
                                            "Cancel this event?",
                                            "Participants will see it as cancelled.",
                                            "Cancel event",
                                            { cancelLabel: "Keep event" },
                                        )
                                    )
                                        action.mutate({
                                            method: "POST",
                                            path: `${root}/${id}/cancel`,
                                            ifMatch: event.version,
                                        });
                                }}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button
                                size="lg"
                                tone="primary"
                                icon="edit"
                                title="Edit"
                                onPress={() => setEditing(true)}
                            />
                        </View>
                    </View>
                ) : invited ? (
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                        {(["Declined", "Accepted"] as const).map((status) => (
                            <View key={status} style={{ flex: 1 }}>
                                <Button
                                    size="lg"
                                    tone={
                                        status === "Accepted"
                                            ? "primary"
                                            : "neutral"
                                    }
                                    title={
                                        status === "Accepted"
                                            ? event.response === "Accepted"
                                                ? "Accepted"
                                                : "Accept"
                                            : event.response === "Declined"
                                              ? "Declined"
                                              : "Decline"
                                    }
                                    loading={action.isPending}
                                    disabled={event.response === status}
                                    onPress={() =>
                                        action.mutate({
                                            method: "POST",
                                            path: `${root}/${id}/response`,
                                            ifMatch: event.responseVersion!,
                                            json: { status },
                                        })
                                    }
                                />
                            </View>
                        ))}
                    </View>
                ) : undefined
            }
        >
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.sm,
                }}
            >
                <Badge>{event.kind}</Badge>
                {responseBadge(event)}
            </View>
            {action.error && <ErrorState error={action.error} />}
            <Section>
                <ListItem
                    icon="person"
                    title={event.organizerName}
                    subtitle="Organizer"
                />
                <ListItem
                    icon="schedule"
                    title={event.timeZone}
                    subtitle={
                        event.timeZone === deviceZone()
                            ? "Time zone"
                            : `Event time zone · shown in ${deviceZone()}`
                    }
                />
                {event.location ? (
                    <ListItem
                        icon="info"
                        title={event.location}
                        subtitle="Location"
                    />
                ) : null}
                {event.meetingUrl ? (
                    <ListItem
                        icon="video"
                        title={link ? "Join the meeting" : event.meetingUrl}
                        subtitle={link ? event.meetingUrl : "Meeting link"}
                        subtitleLines={1}
                        onPress={
                            link
                                ? async () => {
                                      try {
                                          await Linking.openURL(link);
                                      } catch {
                                          /* The link stays visible in the row if nothing can open it. */
                                      }
                                  }
                                : undefined
                        }
                    />
                ) : null}
            </Section>
            {event.description ? (
                <Section title="Details">
                    <Text tone="mutedText">{event.description}</Text>
                </Section>
            ) : null}
            {event.attendees && (
                <Section title="Participants">
                    {event.attendees.map((attendee) => (
                        <Participant
                            key={attendee.clientId}
                            attendee={attendee}
                        />
                    ))}
                    {!event.attendees.length && (
                        <Text variant="caption" tone="mutedText">
                            Nobody is invited yet.
                        </Text>
                    )}
                </Section>
            )}
        </Screen>
    );
}

function Participant({ attendee }: { attendee: Schema<"AttendeeDto"> }) {
    const client = useApiQuery<Schema<"CoachRelationshipDto">>(
        `/api/v1/coaching/clients/${attendee.relationshipId}`,
    );
    const name =
        client.data?.client.displayName ||
        (client.isPending ? "Loading…" : "Participant unavailable");
    return (
        <ListItem
            leading={<Avatar name={name} size={36} />}
            title={name}
            trailing={
                attendee.response === "Accepted" ? (
                    <Badge tone="success">Accepted</Badge>
                ) : attendee.response === "Declined" ? (
                    <Badge tone="danger">Declined</Badge>
                ) : (
                    <Badge>No reply</Badge>
                )
            }
        />
    );
}

function EventEditor({
    initial,
    saved,
    cancel,
}: {
    initial?: Event;
    saved: (event: Event) => void;
    cancel?: () => void;
}) {
    const navigation = useNavigation();
    const theme = useTheme();
    const [title, setTitle] = useState(initial?.title || "");
    const [description, setDescription] = useState(initial?.description || "");
    const [kind, setKind] = useState(initial?.kind || "Meeting");
    const [allDay, setAllDay] = useState(Boolean(initial?.startDate));
    const [start, setStart] = useState(() =>
        initial ? new Date(initial.startsAtUtc) : new Date(),
    );
    const [end, setEnd] = useState(() =>
        initial
            ? new Date(
                  new Date(initial.endsAtUtc).getTime() -
                      (initial.startDate ? 1 : 0),
              )
            : new Date(Date.now() + 3600000),
    );
    const [location, setLocation] = useState(initial?.location || "");
    const [meetingUrl, setMeetingUrl] = useState(initial?.meetingUrl || "");
    const [relationships, setRelationships] = useState(
        initial?.attendees?.map((attendee) => attendee.relationshipId) || [],
    );
    const [groups, setGroups] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState<unknown>();
    const [completed, setCompleted] = useState<Event>();
    const [picker, setPicker] = useState<{
        target: "start" | "end";
        mode: "date" | "time";
    }>();
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [groupPage, setGroupPage] = useState(1);
    const zone = initial?.timeZone || deviceZone();
    const clients = useApiQuery<Page<Schema<"CoachRelationshipDto">>>(
        "/api/v1/coaching/clients",
        { status: "Active", search, page, pageSize: 20 },
    );
    const groupQuery = useApiQuery<Page<Schema<"GroupDto">>>(
        "/api/v1/coaching/groups",
        { page: groupPage, pageSize: 20 },
    );
    const mutation = useApiMutation<Event>((event) => {
        setDirty(false);
        setCompleted(event);
    });
    useEffect(() => {
        if (completed) saved(completed);
    }, [completed, saved]);
    usePreventRemove(
        !completed && (dirty || mutation.isPending),
        ({ data }) => {
            void confirm(
                "Discard event changes?",
                "Changes have not been saved. A submitted request may still finish.",
                "Leave",
            ).then((ok) => {
                if (ok) navigation.dispatch(data.action);
            });
        },
    );
    const edit =
        <T,>(setter: (value: T) => void) =>
        (value: T) => {
            setter(value);
            setDirty(true);
        };
    const close = async () => {
        if (
            !dirty ||
            (await confirm(
                "Discard event changes?",
                "Your changes will be discarded.",
                "Discard",
            ))
        )
            cancel?.();
    };
    const toggle = (list: string[], id: string) =>
        list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
    const pickerValue = picker?.target === "end" ? end : start;
    const applyPicked = (date: Date) => {
        (picker?.target === "end" ? setEnd : setStart)(date);
        setDirty(true);
    };
    return (
        <View
            pointerEvents={mutation.isPending ? "none" : "auto"}
            style={{ gap: theme.spacing.lg }}
        >
            <Section flat>
                <Field
                    label="Title"
                    placeholder="e.g. Monthly review call"
                    value={title}
                    maxLength={200}
                    onChangeText={edit(setTitle)}
                />
                <SegmentedControl
                    label="Type"
                    value={kind}
                    disabled={mutation.isPending}
                    options={[
                        { value: "Meeting", label: "Meeting" },
                        { value: "Event", label: "Event" },
                    ]}
                    onChange={(next) => {
                        setKind(next);
                        setAllDay(false);
                        setDirty(true);
                    }}
                />
                <Field
                    label="Description"
                    placeholder="Optional"
                    value={description}
                    multiline
                    maxLength={10000}
                    onChangeText={edit(setDescription)}
                />
            </Section>

            <Section title="When">
                {kind === "Event" && (
                    <ListItem
                        title="All day"
                        trailing={
                            <Switch
                                accessibilityLabel="All day event"
                                value={allDay}
                                onValueChange={edit(setAllDay)}
                            />
                        }
                    />
                )}
                {(["start", "end"] as const).map((target) => {
                    const value = target === "start" ? start : end;
                    return (
                        <View
                            key={target}
                            style={{
                                flexDirection: "row",
                                gap: theme.spacing.sm,
                            }}
                        >
                            <View style={{ flex: 1.4 }}>
                                <FieldButton
                                    label={
                                        target === "start"
                                            ? "Starts"
                                            : allDay
                                              ? "Last day"
                                              : "Ends"
                                    }
                                    icon="calendar"
                                    value={value.toLocaleDateString(undefined, {
                                        timeZone: zone,
                                        weekday: "short",
                                        day: "numeric",
                                        month: "short",
                                    })}
                                    onPress={() =>
                                        setPicker({ target, mode: "date" })
                                    }
                                />
                            </View>
                            {!allDay && (
                                <View style={{ flex: 1 }}>
                                    <FieldButton
                                        label="Time"
                                        icon="schedule"
                                        value={value.toLocaleTimeString(
                                            undefined,
                                            {
                                                timeZone: zone,
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            },
                                        )}
                                        onPress={() =>
                                            setPicker({ target, mode: "time" })
                                        }
                                    />
                                </View>
                            )}
                        </View>
                    );
                })}
                <Text variant="caption" tone="subtleText">
                    Time zone: {zone}
                </Text>
            </Section>
            {/* Android shows the system picker dialog; iOS shows the system wheel in a sheet. */}
            {picker && Platform.OS === "android" && (
                <DateTimePicker
                    value={pickerValue}
                    mode={picker.mode}
                    timeZoneName={zone}
                    onChange={(event, date) => {
                        setPicker(undefined);
                        if (event.type === "set" && date) applyPicked(date);
                    }}
                />
            )}
            {Platform.OS === "ios" && (
                <BottomSheet
                    title={
                        picker?.mode === "time" ? "Choose a time" : "Choose a date"
                    }
                    open={!!picker}
                    onClose={() => setPicker(undefined)}
                    footer={
                        <Button
                            size="lg"
                            tone="primary"
                            title="Done"
                            onPress={() => setPicker(undefined)}
                        />
                    }
                >
                    {picker && (
                        <DateTimePicker
                            value={pickerValue}
                            mode={picker.mode}
                            display="spinner"
                            timeZoneName={zone}
                            onChange={(event, date) => {
                                if (event.type === "set" && date)
                                    applyPicked(date);
                            }}
                        />
                    )}
                </BottomSheet>
            )}

            <Section title="Where" flat>
                <Field
                    label="Location"
                    placeholder="Optional"
                    value={location}
                    maxLength={500}
                    onChangeText={edit(setLocation)}
                />
                <Field
                    label="Meeting link"
                    placeholder="https://"
                    value={meetingUrl}
                    maxLength={2048}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    onChangeText={edit(setMeetingUrl)}
                />
            </Section>

            <Section
                title="Clients"
                action={
                    relationships.length ? (
                        <Badge tone="brand">{relationships.length}</Badge>
                    ) : undefined
                }
            >
                <Text variant="caption" tone="mutedText">
                    Personal and Team clients cannot share one event.
                </Text>
                <SearchField
                    label="Search clients"
                    value={search}
                    onChangeText={(value) => {
                        setSearch(value);
                        setPage(1);
                    }}
                />
                {clients.isPending ? (
                    <LoadingState />
                ) : clients.error ? (
                    <ErrorState error={clients.error} />
                ) : (
                    clients.data && (
                        <>
                            {clients.data.items.map((item) => {
                                const selected = relationships.includes(item.id);
                                const name = item.client?.displayName || "Client";
                                return (
                                    <ListItem
                                        key={item.id}
                                        leading={<Avatar name={name} size={36} />}
                                        title={name}
                                        trailing={
                                            <Icon
                                                name={
                                                    selected
                                                        ? "checkCircle"
                                                        : "circle"
                                                }
                                                tone={
                                                    selected
                                                        ? "brand"
                                                        : "subtleText"
                                                }
                                            />
                                        }
                                        accessibilityHint={
                                            selected ? "Invited" : "Not invited"
                                        }
                                        onPress={() => {
                                            setRelationships(
                                                toggle(relationships, item.id),
                                            );
                                            setDirty(true);
                                        }}
                                    />
                                );
                            })}
                            {!clients.data.items.length && (
                                <Text variant="caption" tone="mutedText">
                                    No clients match.
                                </Text>
                            )}
                            <Pagination
                                data={clients.data}
                                onChange={setPage}
                            />
                        </>
                    )
                )}
                {initial?.attendees
                    ?.filter(
                        (attendee) =>
                            !clients.data?.items.some(
                                (item) => item.id === attendee.relationshipId,
                            ),
                    )
                    .map((attendee) => {
                        const selected = relationships.includes(
                            attendee.relationshipId,
                        );
                        return (
                            <ListItem
                                key={attendee.relationshipId}
                                icon="person"
                                title="Already invited participant"
                                trailing={
                                    <Icon
                                        name={selected ? "checkCircle" : "circle"}
                                        tone={selected ? "brand" : "subtleText"}
                                    />
                                }
                                onPress={() => {
                                    setRelationships(
                                        toggle(
                                            relationships,
                                            attendee.relationshipId,
                                        ),
                                    );
                                    setDirty(true);
                                }}
                            />
                        );
                    })}
            </Section>

            <Section title="Groups" flat>
                <Text variant="caption" tone="mutedText">
                    Members are invited as the group is now; people who join
                    later are not added.
                </Text>
                {groupQuery.error ? (
                    <ErrorState error={groupQuery.error} />
                ) : groupQuery.isPending ? (
                    <LoadingState />
                ) : (
                    groupQuery.data && (
                        <>
                            <View
                                style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    gap: theme.spacing.sm,
                                }}
                            >
                                {groupQuery.data.items.map((group) => (
                                    <Chip
                                        key={group.id}
                                        icon="team"
                                        label={group.name}
                                        selected={groups.includes(group.id)}
                                        onPress={() => {
                                            setGroups(toggle(groups, group.id));
                                            setDirty(true);
                                        }}
                                    />
                                ))}
                            </View>
                            {!groupQuery.data.items.length && (
                                <Text variant="caption" tone="subtleText">
                                    You have no groups.
                                </Text>
                            )}
                            <Pagination
                                data={groupQuery.data}
                                onChange={setGroupPage}
                            />
                        </>
                    )
                )}
            </Section>

            {!!(error || mutation.error) && (
                <ErrorState error={error || mutation.error} />
            )}
            <View style={{ gap: theme.spacing.sm }}>
                <Button
                    size="lg"
                    tone="primary"
                    title={initial ? "Save changes" : "Create event"}
                    loading={mutation.isPending}
                    disabled={!title.trim()}
                    onPress={() => {
                        try {
                            Keyboard.dismiss();
                            setError(undefined);
                            const times = eventTimes(start, end, allDay, zone);
                            if (meetingUrl && !/^https?:\/\//i.test(meetingUrl))
                                throw new Error(
                                    "Meeting link must start with https:// or http://.",
                                );
                            mutation.mutate({
                                method: initial ? "PATCH" : "POST",
                                path: initial ? `${root}/${initial.id}` : root,
                                ifMatch: initial?.version,
                                json: {
                                    kind,
                                    title: title.trim(),
                                    description,
                                    timeZone: zone,
                                    ...times,
                                    location: location || null,
                                    meetingUrl: meetingUrl || null,
                                    relationshipIds: relationships,
                                    groupIds: groups,
                                } satisfies Schema<"EventWrite">,
                            });
                        } catch (failure) {
                            setError(failure);
                        }
                    }}
                />
                {cancel && (
                    <Button
                        tone="ghost"
                        title="Cancel editing"
                        disabled={mutation.isPending}
                        onPress={close}
                    />
                )}
            </View>
        </View>
    );
}
