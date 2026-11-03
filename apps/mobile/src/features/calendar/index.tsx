import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useEffect, useState } from "react";
import { Keyboard, Linking, Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { Schema } from "@metrivum/api-client-web";
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
} from "@metrivum/ui-mobile";
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
function ResponseBadge({ event }: { event: Event }) {
 const nativeCopy = useNativeCopy().t;
 return event.cancelled ? (
        <Badge tone="danger">{nativeCopy("interface.Cancelled")}</Badge>
    ) : event.response === "Accepted" ? (
        <Badge tone="success">{nativeCopy("interface.Accepted")}</Badge>
    ) : event.response === "Declined" ? (
        <Badge tone="danger">{nativeCopy("interface.Declined")}</Badge>
    ) : undefined;
}

export function CalendarScreen() {
 const nativeCopy = useNativeCopy().t;

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
            title={nativeCopy("interface.Calendar")}
            headerAction={
                role === "coach" ? (
                    <IconButton
                        icon="add"
                        label={nativeCopy("interface.New event or meeting")}
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
                    label={nativeCopy("interface.Previous month")}
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
                    label={nativeCopy("interface.Next month")}
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
                                trailing={<ResponseBadge event={event} />}
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
                        title={nativeCopy("interface.Nothing planned this month")}
                        description={
                            role === "coach"
                                ? nativeCopy("interface.Add a meeting or an event with the plus button.")
                                : nativeCopy("interface.Meetings and events from your coach appear here.")
                        }
                    />
                ))
            )}
        </Screen>
    );
}

export function EventScreen() {
 const nativeCopy = useNativeCopy().t;

    const { id } = useLocalSearchParams<{ id: string }>();
    const { accountId, role } = useMobile();
    return id === "new" ? (
        <Screen title={nativeCopy("interface.New event")}>
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
                    title={nativeCopy("interface.Only coaches create events")}
                    description={nativeCopy("interface.Switch to the Coach view in More to add one.")}
                />
            )}
        </Screen>
    ) : (
        <EventDetail key={`${accountId}:${id}`} id={id} />
    );
}

function EventDetail({ id }: { id: string }) {
 const nativeCopy = useNativeCopy().t;

    const { role, profile } = useMobile();
    const theme = useTheme();
    const [editing, setEditing] = useState(false);
    const query = useApiQuery<Event>(`${root}/${id}`, { role });
    const action = useApiMutation(() => void query.refetch());
    const event = query.data;
    if (editing && event)
        return (
            <Screen title={nativeCopy("interface.Edit event")}>
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
            <Screen title={nativeCopy("interface.Event")}>
                <LoadingState />
            </Screen>
        );
    if (query.error || !event)
        return (
            <Screen title={nativeCopy("interface.Event")}>
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
                                title={nativeCopy("interface.Cancel event")}
                                loading={action.isPending}
                                onPress={async () => {
                                    if (
                                        await confirm(
                                            "Cancel this event?",
                                            "Participants will see it as cancelled.",
                                            "Cancel event",
                                            { cancelLabel: nativeCopy("interface.Keep event") },
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
                                title={nativeCopy("interface.Edit")}
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
                                                ? nativeCopy("interface.Accepted")
                                                : nativeCopy("interface.Accept")
                                            : event.response === "Declined"
                                              ? nativeCopy("interface.Declined")
                                              : nativeCopy("interface.Decline")
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
                {<ResponseBadge event={event} />}
            </View>
            {action.error && <ErrorState error={action.error} />}
            <Section>
                <ListItem
                    icon="person"
                    title={event.organizerName}
                    subtitle={nativeCopy("interface.Organizer")}
                />
                <ListItem
                    icon="schedule"
                    title={event.timeZone}
                    subtitle={
                        event.timeZone === deviceZone()
                            ? nativeCopy("interface.Time zone")
                            : `Event time zone · shown in ${deviceZone()}`
                    }
                />
                {event.location ? (
                    <ListItem
                        icon="info"
                        title={event.location}
                        subtitle={nativeCopy("interface.Location")}
                    />
                ) : null}
                {event.meetingUrl ? (
                    <ListItem
                        icon="video"
                        title={link ? nativeCopy("interface.Join the meeting") : event.meetingUrl}
                        subtitle={link ? event.meetingUrl : nativeCopy("interface.Meeting link")}
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
                <Section title={nativeCopy("interface.Details")}>
                    <Text tone="mutedText">{event.description}</Text>
                </Section>
            ) : null}
            {event.attendees && (
                <Section title={nativeCopy("interface.Participants")}>
                    {event.attendees.map((attendee) => (
                        <Participant
                            key={attendee.clientId}
                            attendee={attendee}
                        />
                    ))}
                    {!event.attendees.length && (
                        <Text variant="caption" tone="mutedText">

                            {nativeCopy("interface.Nobody is invited yet.")}
                        </Text>
                    )}
                </Section>
            )}
        </Screen>
    );
}

function Participant({ attendee }: { attendee: Schema<"AttendeeDto"> }) {
 const nativeCopy = useNativeCopy().t;

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
                    <Badge tone="success">{nativeCopy("interface.Accepted")}</Badge>
                ) : attendee.response === "Declined" ? (
                    <Badge tone="danger">{nativeCopy("interface.Declined")}</Badge>
                ) : (
                    <Badge>{nativeCopy("interface.No reply")}</Badge>
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
 const nativeCopy = useNativeCopy().t;

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
                    label={nativeCopy("interface.Title")}
                    placeholder={nativeCopy("interface.e.g. Monthly review call")}
                    value={title}
                    maxLength={200}
                    onChangeText={edit(setTitle)}
                />
                <SegmentedControl
                    label={nativeCopy("interface.Type")}
                    value={kind}
                    disabled={mutation.isPending}
                    options={[
                        { value: "Meeting", label: nativeCopy("interface.Meeting") },
                        { value: "Event", label: nativeCopy("interface.Event") },
                    ]}
                    onChange={(next) => {
                        setKind(next);
                        setAllDay(false);
                        setDirty(true);
                    }}
                />
                <Field
                    label={nativeCopy("interface.Description")}
                    placeholder={nativeCopy("interface.Optional")}
                    value={description}
                    multiline
                    maxLength={10000}
                    onChangeText={edit(setDescription)}
                />
            </Section>

            <Section title={nativeCopy("interface.When")}>
                {kind === "Event" && (
                    <ListItem
                        title={nativeCopy("interface.All day")}
                        trailing={
                            <Switch
                                accessibilityLabel={nativeCopy("interface.All day event")}
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
                                            ? nativeCopy("interface.Starts")
                                            : allDay
                                              ? nativeCopy("interface.Last day")
                                              : nativeCopy("interface.Ends")
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
                                        label={nativeCopy("interface.Time")}
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

                    {nativeCopy("interface.Time zone:")} {zone}
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
                        picker?.mode === "time" ? nativeCopy("interface.Choose a time") : nativeCopy("interface.Choose a date")
                    }
                    open={!!picker}
                    onClose={() => setPicker(undefined)}
                    footer={
                        <Button
                            size="lg"
                            tone="primary"
                            title={nativeCopy("interface.Done")}
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

            <Section title={nativeCopy("interface.Where")} flat>
                <Field
                    label={nativeCopy("interface.Location")}
                    placeholder={nativeCopy("interface.Optional")}
                    value={location}
                    maxLength={500}
                    onChangeText={edit(setLocation)}
                />
                <Field
                    label={nativeCopy("interface.Meeting link")}
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
                title={nativeCopy("interface.Clients")}
                action={
                    relationships.length ? (
                        <Badge tone="brand">{relationships.length}</Badge>
                    ) : undefined
                }
            >
                <Text variant="caption" tone="mutedText">

                    {nativeCopy("interface.Personal and Team clients cannot share one event.")}
                </Text>
                <SearchField
                    label={nativeCopy("interface.Search clients")}
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

                                    {nativeCopy("interface.No clients match.")}
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
                                title={nativeCopy("interface.Already invited participant")}
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

            <Section title={nativeCopy("interface.Groups")} flat>
                <Text variant="caption" tone="mutedText">

                    {nativeCopy("interface.Members are invited as the group is now; people who join later are not added.")}
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

                                    {nativeCopy("interface.You have no groups.")}
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
                    title={initial ? nativeCopy("interface.Save changes") : nativeCopy("interface.Create event")}
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
                        title={nativeCopy("interface.Cancel editing")}
                        disabled={mutation.isPending}
                        onPress={close}
                    />
                )}
            </View>
        </View>
    );
}
