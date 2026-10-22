import { NativeDateField } from "../training/NativeDateField";
import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Schema } from "@trainflow/api-client-web";
import {
    ActionSheet,
    Avatar,
    BottomSheet,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Field,
    IconButton,
    ListItem,
    LoadingState,
    Screen,
    SearchField,
    Section,
    SelectField,
    Tabs,
    Text,
    confirm,
    useTheme,
    type SheetAction,
} from "@trainflow/ui-mobile";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { Filters } from "../shared/Filters";
import { FormSheet } from "../shared/FormSheet";
import {
    StatusBadge,
    formatDay,
    humanize,
    joinParts,
} from "../shared/format";
import { Choices, Pagination } from "../training/components";
import { TrainingProgress } from "../training/Progress";
import { AssignmentList, Schedule } from "../training";
import type { Page } from "../training/model";
import { localDate } from "../training/model";
import { CheckInList, AnswerFields } from "../check-ins";
import { ScheduleForm } from "../check-ins/ScheduleForm";
import { Documentation, Measurements } from "../documentation";

type Client = Schema<"CoachRelationshipDto">;

/** Opens (or creates) the direct or group conversation and navigates to it. */
function useOpenConversation() {
    return useApiMutation<Schema<"ConversationDto">>((conversation) =>
        router.push({
            pathname: "/conversation/[id]",
            params: { id: conversation.id },
        }),
    );
}
const conversationRequest = (target: { userId?: string; groupId?: string }) => ({
    path: target.groupId
        ? `/api/v1/coaching/groups/${target.groupId}/conversation`
        : "/api/v1/messaging/conversations/direct",
    method: "POST" as const,
    json: target.groupId ? undefined : { userId: target.userId },
});

function MessageButton({
    userId,
    groupId,
    primary = false,
}: {
    userId?: string;
    groupId?: string;
    primary?: boolean;
}) {
    const mutation = useOpenConversation();
    return (
        <>
            <Button
                icon="messages"
                tone={primary ? "primary" : "neutral"}
                title={groupId ? "Open group chat" : "Message"}
                loading={mutation.isPending}
                onPress={() =>
                    mutation.mutate(conversationRequest({ userId, groupId }))
                }
            />
            {mutation.error && <ErrorState error={mutation.error} />}
        </>
    );
}

const statusActions: Record<
    string,
    { label: string; question: string; body: string; destructive: boolean }
> = {
    suspend: {
        label: "Suspend collaboration",
        question: "Suspend this collaboration?",
        body: "The client keeps their history. You can resume later.",
        destructive: true,
    },
    resume: {
        label: "Resume collaboration",
        question: "Resume this collaboration?",
        body: "The client becomes active again.",
        destructive: false,
    },
    complete: {
        label: "Complete collaboration",
        question: "Complete this collaboration?",
        body: "This ends the collaboration. History stays available.",
        destructive: true,
    },
};

/**
 * Everything that can be done with one client, in a bottom sheet. Opened from the visible "…"
 * button on a row and on the details screen.
 */
function ClientActions({
    client,
    open,
    onClose,
    showOpen = false,
}: {
    client: Client | undefined;
    open: boolean;
    onClose: () => void;
    showOpen?: boolean;
}) {
    const message = useOpenConversation();
    const status = useApiMutation();
    if (!client) return null;
    const actions: SheetAction[] = [
        ...(showOpen
            ? [{ value: "open", label: "Open client", icon: "person" as const }]
            : []),
        { value: "message", label: "Send a message", icon: "messages" },
        ...["resume", "suspend", "complete"]
            .filter((action) => client.allowedActions.includes(action))
            .map((action) => ({
                value: action,
                label: statusActions[action]!.label,
                icon:
                    action === "resume"
                        ? ("play" as const)
                        : action === "suspend"
                          ? ("pause" as const)
                          : ("done" as const),
                destructive: statusActions[action]!.destructive,
            })),
    ];
    return (
        <ActionSheet
            title={client.client.displayName}
            subtitle={joinParts(
                client.client.username && `@${client.client.username}`,
                humanize(client.status),
            )}
            open={open}
            actions={actions}
            onClose={onClose}
            onSelect={async (value) => {
                if (value === "open")
                    return router.push({
                        pathname: "/client/[id]",
                        params: { id: client.id },
                    });
                if (value === "message")
                    return message.mutate(
                        conversationRequest({ userId: client.client.id }),
                    );
                const action = statusActions[value]!;
                if (
                    await confirm(action.question, action.body, action.label, {
                        destructive: action.destructive,
                    })
                )
                    status.mutate({
                        path: `/api/v1/coaching/relationships/${client.id}/${value}`,
                        method: "POST",
                        ifMatch: client.version,
                        json: { internalReason: null },
                    });
            }}
        />
    );
}

function PaymentHistory({ relationshipId }: { relationshipId: string }) {
    const [page, setPage] = useState(1);
    const query = useApiQuery<Schema<"RelationshipBillingDto">>(
        `/api/v1/coaching/relationships/${relationshipId}/billing`,
        { page, pageSize: 20 },
    );
    return (
        <Section title="Payments">
            <Text variant="caption" tone="subtleText">
                Read-only here. Payments are managed in the web app.
            </Text>
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
                        {query.data.dues.items.map((due) => (
                            <ListItem
                                key={due.id}
                                icon="payments"
                                title={`${due.amount} ${due.currency}`}
                                subtitle={`Due ${formatDay(due.dueAt)}`}
                                trailing={
                                    <StatusBadge
                                        status={
                                            due.overdue ? "Overdue" : due.status
                                        }
                                    />
                                }
                            />
                        ))}
                        {!query.data.dues.items.length && (
                            <Text variant="caption" tone="mutedText">
                                No payment dues yet.
                            </Text>
                        )}
                        <Pagination data={query.data.dues} onChange={setPage} />
                    </>
                )
            )}
        </Section>
    );
}

/** One application with its answers and the decision. Shown in a sheet or on its own screen. */
export function LeadDetail({ id }: { id: string }) {
    const theme = useTheme();
    const query = useApiQuery<Schema<"CoachApplicationDetailDto">>(
        `/api/v1/coaching/applications/${id}`,
    );
    const [reason, setReason] = useState("");
    const [settlementMode, setSettlement] = useState("External");
    const mutation = useApiMutation(() => {
        void query.refetch();
    });
    const detail = query.data?.detail;
    if (query.isPending) return <LoadingState />;
    if (query.error || !detail)
        return (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
        );
    const canAccept =
        detail.application.allowedActions.includes("accept") &&
        detail.offerRevision.purpose !== "TrainingPlan";
    const canReject = detail.application.allowedActions.includes("reject");
    return (
        <View style={{ gap: theme.spacing.md }}>
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.md - 2,
                }}
            >
                <Avatar name={detail.application.applicant.displayName} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">
                        {detail.application.applicant.displayName}
                    </Text>
                    <Text variant="caption" tone="mutedText">
                        {joinParts(
                            detail.offerRevision.name,
                            `${detail.application.amount} ${detail.application.currency}`,
                        )}
                    </Text>
                </View>
                <StatusBadge status={detail.application.status} />
            </View>
            {detail.formVersion ? <AnswerFields
                definition={detail.formVersion.definition}
                answers={detail.answers}
            /> : <Text>No application form was required.</Text>}
            {canAccept && (
                <>
                    <Choices
                        label="How the service is settled"
                        values={["External", "Simulated"]}
                        labels={{
                            External: "Outside the app",
                            Simulated: "Test payment",
                        }}
                        value={settlementMode}
                        onChange={setSettlement}
                    />
                    <Button
                        size="lg"
                        tone="primary"
                        title="Accept and start"
                        loading={mutation.isPending}
                        onPress={async () => {
                            if (
                                await confirm(
                                    "Accept this application?",
                                    "This starts the collaboration under the offer terms shown here.",
                                    "Accept",
                                    { destructive: false },
                                )
                            )
                                mutation.mutate({
                                    path: `/api/v1/coaching/applications/${id}/accept`,
                                    method: "POST",
                                    ifMatch: detail.application.version,
                                    json: { settlementMode },
                                });
                        }}
                    />
                </>
            )}
            {canReject && (
                <>
                    <Field
                        label="Reason for rejecting (only you see it)"
                        placeholder="Optional"
                        value={reason}
                        onChangeText={setReason}
                    />
                    <Button
                        tone="danger"
                        title="Reject application"
                        disabled={mutation.isPending}
                        onPress={async () => {
                            if (
                                await confirm(
                                    "Reject this application?",
                                    "The applicant is told it was not accepted.",
                                    "Reject",
                                )
                            )
                                mutation.mutate({
                                    path: `/api/v1/coaching/applications/${id}/reject`,
                                    method: "POST",
                                    ifMatch: detail.application.version,
                                    json: { internalReason: reason || null },
                                });
                        }}
                    />
                </>
            )}
            {mutation.error && <ErrorState error={mutation.error} />}
        </View>
    );
}

function Leads() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState("");
    const query = useApiQuery<Page<Schema<"ApplicationDto">>>(
        "/api/v1/coaching/leads",
        { page, pageSize: 20, search },
    );
    return (
        <>
            <SearchField
                label="Search leads"
                value={search}
                onChangeText={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
            />
            <Section>
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
                                    leading={
                                        <Avatar
                                            name={item.applicant.displayName}
                                        />
                                    }
                                    title={item.applicant.displayName}
                                    subtitle={item.offerName}
                                    trailing={
                                        <StatusBadge status={item.status} />
                                    }
                                    onPress={() => setSelected(item.id)}
                                />
                            ))}
                            {!query.data.items.length && (
                                <EmptyState
                                    icon="personAdd"
                                    title={
                                        search ? "No leads match" : "No leads yet"
                                    }
                                    description="Applications to your offers appear here."
                                />
                            )}
                            <Pagination data={query.data} onChange={setPage} />
                        </>
                    )
                )}
            </Section>
            <BottomSheet
                title="Application"
                open={!!selected}
                size="full"
                onClose={() => setSelected("")}
            >
                {selected ? <LeadDetail key={selected} id={selected} /> : null}
            </BottomSheet>
        </>
    );
}

function Invitations() {
    const { profile } = useMobile();
    const [page, setPage] = useState(1);
    const [username, setUsername] = useState("");
    const [offerId, setOffer] = useState("");
    const [variant, setVariant] = useState("");
    const [message, setMessage] = useState("");
    const [open, setOpen] = useState(false);
    const query = useApiQuery<Page<Schema<"InvitationDto">>>(
        "/api/v1/coaching/invitations",
        { page, pageSize: 20 },
    );
    const offers = useApiQuery<Page<Schema<"OfferDto">>>("/api/v1/offers", {
        status: "Active",
        page: 1,
        pageSize: 50,
    });
    const publishedOffer = useApiQuery<Schema<"OfferRevisionDto">>(
        `/api/v1/coaches/${profile.id}/offers/${offerId}`,
        undefined,
        !!offerId,
    );
    const reset = () => {
        setUsername("");
        setOffer("");
        setVariant("");
        setMessage("");
    };
    const send = useApiMutation(() => {
        reset();
        setOpen(false);
        void query.refetch();
    });
    const revoke = useApiMutation(() => {
        void query.refetch();
    });
    const offer = publishedOffer.data;
    return (
        <>
            <FormSheet
                trigger={{
                    title: "Invite a client",
                    icon: "personAdd",
                    tone: "primary",
                }}
                title="Invite a client"
                subtitle="By exact username. They see the offer before accepting."
                dirty={!!(username || offerId || message)}
                open={open}
                onOpenChange={setOpen}
                onDiscard={reset}
                footer={() => (
                    <Button
                        size="lg"
                        tone="primary"
                        title="Send invitation"
                        disabled={
                            !username ||
                            !offerId ||
                            !variant ||
                            !publishedOffer.data
                        }
                        loading={send.isPending}
                        onPress={() =>
                            send.mutate({
                                path: "/api/v1/coaching/invitations",
                                method: "POST",
                                json: {
                                    username: username.trim().replace(/^@/, ""),
                                    offerId,
                                    billingOptionId: variant,
                                    message,
                                },
                            })
                        }
                    />
                )}
            >
                <Field
                    label="Username"
                    placeholder="@username"
                    value={username}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setUsername}
                />
                {offers.error ? (
                    <ErrorState error={offers.error} />
                ) : offers.data && !offers.data.items.length ? (
                    <Text tone="mutedText">
                        Activate an offer in the web app first.
                    </Text>
                ) : (
                    <SelectField
                        label="Offer"
                        options={(offers.data?.items ?? []).map((item) => ({
                            value: item.id,
                            label: item.name,
                        }))}
                        value={offerId || null}
                        onChange={(value) => {
                            setOffer(value);
                            setVariant("");
                        }}
                    />
                )}
                {offer && (
                    <SelectField
                        label="Billing option"
                        options={offer.billingOptions.map((item) => ({
                            value: item.id,
                            label: item.name,
                        }))}
                        value={variant || null}
                        onChange={setVariant}
                    />
                )}
                <Field
                    label="Message (optional)"
                    placeholder="A short note shown with the invitation"
                    value={message}
                    multiline
                    onChangeText={setMessage}
                />
                {send.error && <ErrorState error={send.error} />}
            </FormSheet>
            <Section title="Sent invitations">
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
                                    leading={
                                        <Avatar name={item.target.displayName} />
                                    }
                                    title={item.target.displayName}
                                    subtitle={joinParts(
                                        item.offerRevision.name,
                                        humanize(item.status),
                                    )}
                                    trailing={
                                        item.allowedActions.includes(
                                            "revoke",
                                        ) ? (
                                            <Button
                                                size="sm"
                                                tone="danger"
                                                title="Revoke"
                                                disabled={revoke.isPending}
                                                onPress={async () => {
                                                    if (
                                                        await confirm(
                                                            "Revoke this invitation?",
                                                            "They can no longer accept it. You can invite them again.",
                                                            "Revoke",
                                                        )
                                                    )
                                                        revoke.mutate({
                                                            path: `/api/v1/coaching/invitations/${item.id}/revoke`,
                                                            method: "POST",
                                                            ifMatch:
                                                                item.version,
                                                        });
                                                }}
                                            />
                                        ) : (
                                            <StatusBadge status={item.status} />
                                        )
                                    }
                                />
                            ))}
                            {!query.data.items.length && (
                                <EmptyState
                                    icon="mail"
                                    title="No invitations sent"
                                />
                            )}
                            <Pagination data={query.data} onChange={setPage} />
                        </>
                    )
                )}
                {revoke.error && <ErrorState error={revoke.error} />}
            </Section>
        </>
    );
}

function GroupDetail({ group }: { group: Schema<"GroupDto"> }) {
    const theme = useTheme();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const members = useApiQuery<Page<Client>>(
        `/api/v1/coaching/groups/${group.id}/members`,
        { page, pageSize: 20 },
    );
    const clients = useApiQuery<Page<Client>>("/api/v1/coaching/clients", {
        search,
        page: 1,
        pageSize: 20,
        status: "Active",
        teamId: group.teamId ?? undefined,
    });
    const [version, setVersion] = useState(group.version);
    const mutation = useApiMutation<Schema<"GroupDto">>((result) => {
        setVersion(result.version);
        void members.refetch();
    });
    function membership(id: string, add: boolean) {
        mutation.mutate({
            path: `/api/v1/coaching/groups/${group.id}/members/${id}`,
            method: add ? "PUT" : "DELETE",
            ifMatch: version,
        });
    }
    const candidates =
        clients.data?.items.filter(
            (item) =>
                !members.data?.items.some((member) => member.id === item.id),
        ) ?? [];
    return (
        <View style={{ gap: theme.spacing.md }}>
            {group.description ? (
                <Text tone="mutedText">{group.description}</Text>
            ) : null}
            <MessageButton groupId={group.id} />
            <Text variant="label" tone="mutedText">
                Members
            </Text>
            {members.isPending ? (
                <LoadingState />
            ) : (
                members.data && (
                    <View>
                        {members.data.items.map((item) => (
                            <ListItem
                                key={item.id}
                                leading={
                                    <Avatar
                                        name={item.client.displayName}
                                        size={36}
                                    />
                                }
                                title={item.client.displayName}
                                trailing={
                                    group.allowedActions.includes(
                                        "remove-member",
                                    ) ? (
                                        <IconButton
                                            icon="close"
                                            label={`Remove ${item.client.displayName} from the group`}
                                            tone="mutedText"
                                            size={40}
                                            disabled={mutation.isPending}
                                            onPress={() =>
                                                membership(item.id, false)
                                            }
                                        />
                                    ) : undefined
                                }
                            />
                        ))}
                        {!members.data.items.length && (
                            <Text variant="caption" tone="mutedText">
                                No members yet.
                            </Text>
                        )}
                        <Pagination data={members.data} onChange={setPage} />
                    </View>
                )
            )}
            {group.allowedActions.includes("add-member") && (
                <>
                    <SearchField
                        label="Find a client to add"
                        value={search}
                        onChangeText={setSearch}
                    />
                    <View>
                        {candidates.map((item) => (
                            <ListItem
                                key={item.id}
                                leading={
                                    <Avatar
                                        name={item.client.displayName}
                                        size={36}
                                    />
                                }
                                title={item.client.displayName}
                                trailing={
                                    <IconButton
                                        icon="add"
                                        label={`Add ${item.client.displayName} to the group`}
                                        tone="brand"
                                        size={40}
                                        disabled={mutation.isPending}
                                        onPress={() => membership(item.id, true)}
                                    />
                                }
                            />
                        ))}
                    </View>
                </>
            )}
            {(mutation.error || members.error) && (
                <ErrorState error={mutation.error || members.error} />
            )}
            <AssignProgram groupId={group.id} />
            <ScheduleForm groupId={group.id} />
        </View>
    );
}

function Groups() {
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Schema<"GroupDto">>();
    const [shown, setShown] = useState<Schema<"GroupDto">>();
    const query = useApiQuery<Page<Schema<"GroupDto">>>(
        "/api/v1/coaching/groups",
        { page, pageSize: 20 },
    );
    return (
        <>
            <Section>
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
                                    icon="team"
                                    title={item.name}
                                    subtitle={item.description}
                                    onPress={() => {
                                        setShown(item);
                                        setSelected(item);
                                    }}
                                />
                            ))}
                            {!query.data.items.length && (
                                <EmptyState
                                    icon="team"
                                    title="No groups yet"
                                    description="Create groups in the web app to message and assign to several clients at once."
                                />
                            )}
                            <Pagination data={query.data} onChange={setPage} />
                        </>
                    )
                )}
            </Section>
            <BottomSheet
                title={shown?.name ?? ""}
                subtitle="Group"
                open={!!selected}
                size="full"
                onClose={() => setSelected(undefined)}
            >
                {shown ? <GroupDetail key={shown.id} group={shown} /> : null}
            </BottomSheet>
        </>
    );
}

type ClientsView = "Clients" | "Leads" | "Invitations" | "Groups";

export function ClientsScreen() {
    const [view, setView] = useState<ClientsView>("Clients");
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("Active");
    const [menu, setMenu] = useState<Client>();
    const [menuOpen, setMenuOpen] = useState(false);
    const query = useApiQuery<Page<Client>>(
        "/api/v1/coaching/clients",
        { page, pageSize: 20, search, status: status || undefined },
        view === "Clients",
    );
    return (
        <Screen title="Clients">
            <Tabs
                label="Client views"
                value={view}
                onChange={setView}
                options={[
                    { value: "Clients", label: "Clients" },
                    { value: "Leads", label: "Leads" },
                    { value: "Invitations", label: "Invitations" },
                    { value: "Groups", label: "Groups" },
                ]}
            />
            {view === "Leads" ? (
                <Leads />
            ) : view === "Invitations" ? (
                <Invitations />
            ) : view === "Groups" ? (
                <Groups />
            ) : (
                <>
                    <SearchField
                        label="Search clients"
                        value={search}
                        onChangeText={(value) => {
                            setSearch(value);
                            setPage(1);
                        }}
                    />
                    <Filters
                        title="Filter clients"
                        active={status !== "Active"}
                        summary={status ? humanize(status) : "All statuses"}
                        onReset={() => {
                            setStatus("Active");
                            setPage(1);
                        }}
                    >
                        <Choices
                            label="Status"
                            values={["", "Active", "Suspended", "Completed"]}
                            value={status}
                            onChange={(value) => {
                                setStatus(value);
                                setPage(1);
                            }}
                        />
                    </Filters>
                    <Section>
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
                                            leading={
                                                <Avatar
                                                    name={
                                                        item.client.displayName
                                                    }
                                                />
                                            }
                                            title={item.client.displayName}
                                            subtitle={joinParts(
                                                item.client.username &&
                                                    `@${item.client.username}`,
                                                status
                                                    ? null
                                                    : humanize(item.status),
                                                item.teamId ? "Team" : null,
                                            )}
                                            trailing={
                                                <IconButton
                                                    icon="more"
                                                    label={`Actions for ${item.client.displayName}`}
                                                    tone="mutedText"
                                                    size={40}
                                                    onPress={() => {
                                                        setMenu(item);
                                                        setMenuOpen(true);
                                                    }}
                                                />
                                            }
                                            onPress={() =>
                                                router.push({
                                                    pathname: "/client/[id]",
                                                    params: { id: item.id },
                                                })
                                            }
                                        />
                                    ))}
                                    {!query.data.items.length && (
                                        <EmptyState
                                            icon="clients"
                                            title={
                                                search
                                                    ? "No clients match"
                                                    : "No clients here yet"
                                            }
                                            description={
                                                search
                                                    ? "Check the spelling or change the status filter."
                                                    : "Invite someone from the Invitations tab."
                                            }
                                        />
                                    )}
                                    <Pagination
                                        data={query.data}
                                        onChange={setPage}
                                    />
                                </>
                            )
                        )}
                    </Section>
                    <ClientActions
                        client={menu}
                        open={menuOpen}
                        showOpen
                        onClose={() => setMenuOpen(false)}
                    />
                </>
            )}
        </Screen>
    );
}

export function AssignProgram({
    relationshipId,
    groupId,
}: {
    relationshipId?: string;
    groupId?: string;
}) {
    const [programId, setProgram] = useState("");
    const [startDate, setDate] = useState(localDate());
    const [previewed, setPreviewed] = useState(false);
    const [open, setOpen] = useState(false);
    const programs = useApiQuery<Page<Schema<"PlanListItem">>>(
        "/api/v1/training/programs",
        { kind: "Program", archived: false, page: 1, pageSize: 50 },
    );
    const revisions = useApiQuery<Page<Schema<"RevisionListItem">>>(
        `/api/v1/training/programs/${programId}/revisions`,
        { page: 1, pageSize: 1 },
        !!programId,
    );
    const preview = useApiMutation<Schema<"AssignmentRecipientDto">[]>(() =>
        setPreviewed(true),
    );
    const reset = () => {
        setProgram("");
        setDate(localDate());
        setPreviewed(false);
    };
    const save = useApiMutation(() => {
        reset();
        setOpen(false);
    });
    const json = {
        revisionId: revisions.data?.items[0]?.id,
        relationshipIds: relationshipId ? [relationshipId] : [],
        groupIds: groupId ? [groupId] : [],
        startDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
    const failure =
        programs.error || revisions.error || preview.error || save.error;
    return (
        <FormSheet
            trigger={{ title: "Assign a program", icon: "plans" }}
            title="Assign a program"
            subtitle="Uses the latest applied version of the program"
            dirty={!!programId}
            open={open}
            onOpenChange={setOpen}
            onDiscard={reset}
            footer={() =>
                previewed ? (
                    <Button
                        size="lg"
                        tone="primary"
                        title="Assign program"
                        loading={save.isPending}
                        onPress={() =>
                            save.mutate({
                                path: `/api/v1/training/programs/${programId}/assignments`,
                                method: "POST",
                                json,
                                idempotencyKey: `${programId}:${relationshipId || groupId}:${startDate}:${json.revisionId}`,
                            })
                        }
                    />
                ) : (
                    <Button
                        size="lg"
                        tone="primary"
                        title="Check recipients"
                        disabled={!json.revisionId}
                        loading={preview.isPending}
                        onPress={() =>
                            preview.mutate({
                                path: `/api/v1/training/programs/${programId}/assignments/preview`,
                                method: "POST",
                                json,
                            })
                        }
                    />
                )
            }
        >
            {programs.isPending ? (
                <LoadingState />
            ) : programs.data && !programs.data.items.length ? (
                <EmptyState
                    icon="plans"
                    title="No programs to assign"
                    description="Create and apply a program in the web app first."
                />
            ) : (
                <SelectField
                    label="Program"
                    placeholder="Choose a program"
                    options={(programs.data?.items ?? []).map((item) => ({
                        value: item.id,
                        label: item.name,
                    }))}
                    value={programId || null}
                    onChange={(value) => {
                        setProgram(value);
                        setPreviewed(false);
                    }}
                />
            )}
            {!!programId && revisions.data && !json.revisionId && (
                <Text variant="caption" tone="warning">
                    This program has no applied version yet. Apply its changes in
                    the web app first.
                </Text>
            )}
            <NativeDateField
                label="Start date"
                value={startDate}
                onChange={(value) => {
                    setDate(value);
                    setPreviewed(false);
                }}
            />
            {previewed && (
                <View style={{ gap: 6 }}>
                    <Text variant="label" tone="mutedText">
                        Will receive this program
                    </Text>
                    <View
                        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                        {preview.data?.map((item) => (
                            <Chip key={item.id} label={item.displayName} />
                        ))}
                    </View>
                </View>
            )}
            {!!failure && <ErrorState error={failure} />}
        </FormSheet>
    );
}

function Profile({ id }: { id: string }) {
    const query = useApiQuery<Schema<"RelationshipProfileDto">>(
        `/api/v1/coaching/relationships/${id}/profile`,
    );
    const history = useApiQuery<Page<Schema<"ApplicationDto">>>(
        `/api/v1/coaching/relationships/${id}/applications`,
        { page: 1, pageSize: 20 },
    );
    const [selected, setSelected] = useState("");
    const entries = Object.entries(query.data?.currentAllowedProfile || {});
    return (
        <>
            <Section title="Shared profile">
                {query.isPending ? (
                    <LoadingState />
                ) : query.error ? (
                    <ErrorState error={query.error} />
                ) : entries.length ? (
                    entries.map(([key, value]) => (
                        <ListItem
                            key={key}
                            title={
                                Array.isArray(value)
                                    ? value.join(", ")
                                    : value == null || value === ""
                                      ? "–"
                                      : String(value)
                            }
                            subtitle={humanize(key)}
                        />
                    ))
                ) : (
                    <Text variant="caption" tone="mutedText">
                        The client shares no profile details.
                    </Text>
                )}
            </Section>
            <Section title="Applications">
                {history.isPending ? (
                    <LoadingState />
                ) : history.error ? (
                    <ErrorState error={history.error} />
                ) : history.data?.items.length ? (
                    history.data.items.map((item) => (
                        <ListItem
                            key={item.id}
                            icon="document"
                            title={item.offerName}
                            trailing={<StatusBadge status={item.status} />}
                            onPress={() => setSelected(item.id)}
                        />
                    ))
                ) : (
                    <Text variant="caption" tone="mutedText">
                        No applications on record.
                    </Text>
                )}
            </Section>
            <BottomSheet
                title="Application"
                open={!!selected}
                size="full"
                onClose={() => setSelected("")}
            >
                {selected ? <LeadDetail key={selected} id={selected} /> : null}
            </BottomSheet>
        </>
    );
}

function Overview({ client }: { client: Client }) {
    const services = useApiQuery<Page<Schema<"RelationshipServiceDto">>>(
        `/api/v1/coaching/relationships/${client.id}/services`,
        { page: 1, pageSize: 20 },
    );
    const groups = useApiQuery<Page<Schema<"GroupDto">>>(
        "/api/v1/coaching/groups",
        { relationshipId: client.id, page: 1, pageSize: 20 },
    );
    return (
        <>
            <AssignmentList relationshipId={client.id} />
            <AssignProgram relationshipId={client.id} />
            <Section title="Services">
                {services.isPending ? (
                    <LoadingState />
                ) : services.error ? (
                    <ErrorState error={services.error} />
                ) : services.data?.items.length ? (
                    services.data.items.map((item) => (
                        <ListItem
                            key={item.id}
                            icon="star"
                            title={item.offerName}
                            subtitle={joinParts(
                                `${item.amount} ${item.currency}`,
                                item.currentBilling?.status &&
                                    humanize(item.currentBilling.status),
                            )}
                            trailing={<StatusBadge status={item.status} />}
                        />
                    ))
                ) : (
                    <Text variant="caption" tone="mutedText">
                        No services yet.
                    </Text>
                )}
            </Section>
            {!!groups.data?.items.length && (
                <Section title="Groups" flat>
                    <View
                        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                        {groups.data.items.map((item) => (
                            <Chip key={item.id} icon="team" label={item.name} />
                        ))}
                    </View>
                </Section>
            )}
            <PaymentHistory relationshipId={client.id} />
        </>
    );
}

type DetailView =
    | "Overview"
    | "Activity"
    | "Progress"
    | "Profile"
    | "Documentation"
    | "Check-ins";

export function ClientDetailScreen() {
    const theme = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [view, setView] = useState<DetailView>("Overview");
    const [menu, setMenu] = useState(false);
    const query = useApiQuery<Client>(`/api/v1/coaching/clients/${id}`);
    const client = query.data;
    if (query.isPending)
        return (
            <Screen title="Client">
                <LoadingState />
            </Screen>
        );
    if (query.error || !client)
        return (
            <Screen title="Client">
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    return (
        <Screen
            title={client.client.displayName}
            subtitle={joinParts(
                client.client.username && `@${client.client.username}`,
                client.teamId ? `Team ${client.teamName || ""}`.trim() : "Private",
                client.assignedCoach?.displayName &&
                    `Coach ${client.assignedCoach.displayName}`,
            )}
        >
            <View style={{ gap: theme.spacing.md }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: theme.spacing.sm,
                    }}
                >
                    <StatusBadge status={client.status} />
                    <Text variant="caption" tone="mutedText">
                        Since {formatDay(client.startedAt)}
                    </Text>
                </View>
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                    <View style={{ flex: 1 }}>
                        <MessageButton userId={client.client.id} primary />
                    </View>
                    <IconButton
                        icon="more"
                        label="More actions for this client"
                        filled
                        onPress={() => setMenu(true)}
                    />
                </View>
            </View>
            <Tabs
                label="Client details"
                value={view}
                onChange={setView}
                options={(
                    [
                        "Overview",
                        "Activity",
                        "Progress",
                        "Profile",
                        "Documentation",
                        "Check-ins",
                    ] as const
                ).map((value) => ({ value, label: value }))}
            />
            {view === "Overview" ? (
                <Overview client={client} />
            ) : view === "Activity" ? (
                <Schedule relationshipId={id} />
            ) : view === "Progress" ? (
                <>
                    <TrainingProgress relationshipId={id} />
                    <Measurements relationshipId={id} />
                </>
            ) : view === "Profile" ? (
                <Profile id={id} />
            ) : view === "Documentation" ? (
                <Documentation relationshipId={id} />
            ) : (
                <>
                    <ScheduleForm relationshipId={id} />
                    <CheckInList relationshipId={id} />
                </>
            )}
            <ClientActions
                client={client}
                open={menu}
                onClose={() => setMenu(false)}
            />
        </Screen>
    );
}
