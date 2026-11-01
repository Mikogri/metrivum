import { useState } from "react";
import { View } from "react-native";
import type { Schema } from "@metrivum/api-client-web";
import {
    Avatar,
    BottomSheet,
    Button,
    EmptyState,
    ErrorState,
    ListItem,
    LoadingState,
    Screen,
    Section,
    Text,
    useTheme,
} from "@metrivum/ui-mobile";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { StatusBadge, humanize, joinParts } from "../shared/format";

function Members({ id }: { id: string }) {
    const query = useApiQuery<Schema<"TeamMemberDto">[]>(
        `/api/v1/teams/${id}/members`,
    );
    return query.isPending ? (
        <LoadingState />
    ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
    ) : (
        <View>
            {query.data?.map((member) => (
                <ListItem
                    key={member.userId}
                    leading={<Avatar name={member.displayName} size={36} />}
                    title={member.displayName}
                    subtitle={joinParts(
                        member.username && `@${member.username}`,
                        humanize(member.role),
                    )}
                />
            ))}
        </View>
    );
}

export function TeamScreen() {
    const theme = useTheme();
    const query = useApiQuery<Schema<"TeamHomeDto">>("/api/v1/teams/mine");
    const [selected, setSelected] = useState<{ id: string; name: string }>();
    const [open, setOpen] = useState(false);
    const mutation = useApiMutation();
    const decide = (id: string, accept: boolean) =>
        mutation.mutate({
            path: `/api/v1/teams/requests/${id}/decision`,
            method: "POST",
            json: { accept },
        });
    return (
        <Screen title="Team" subtitle="Organizations you coach with">
            {query.isPending ? (
                <LoadingState />
            ) : query.error ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : (
                <>
                    {query.data?.teams.length ? (
                        <Section>
                            {query.data.teams.map((team) => (
                                <ListItem
                                    key={team.id}
                                    icon="team"
                                    title={team.name}
                                    subtitle={joinParts(
                                        humanize(team.role),
                                        `${team.members} members`,
                                    )}
                                    trailing={
                                        team.status === "Active" ? undefined : (
                                            <StatusBadge status={team.status} />
                                        )
                                    }
                                    onPress={() => {
                                        setSelected({
                                            id: team.id,
                                            name: team.name,
                                        });
                                        setOpen(true);
                                    }}
                                />
                            ))}
                        </Section>
                    ) : (
                        <EmptyState
                            icon="team"
                            title="You are not in a team"
                            description="Invitations to a team appear below."
                        />
                    )}
                    {!!query.data?.requests.length && (
                        <Section title="Invitations">
                            {query.data.requests.map((request) => (
                                <View
                                    key={request.id}
                                    style={{ gap: theme.spacing.sm }}
                                >
                                    <View
                                        style={{
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: theme.spacing.sm,
                                        }}
                                    >
                                        <View style={{ flex: 1, gap: 2 }}>
                                            <Text variant="bodyStrong">
                                                {request.teamName}
                                            </Text>
                                            <Text
                                                variant="caption"
                                                tone="mutedText"
                                            >
                                                As {humanize(request.role)}
                                            </Text>
                                        </View>
                                        <StatusBadge status={request.status} />
                                    </View>
                                    {request.canDecide && (
                                        <View
                                            style={{
                                                flexDirection: "row",
                                                gap: theme.spacing.sm,
                                            }}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Button
                                                    title="Decline"
                                                    disabled={mutation.isPending}
                                                    onPress={() =>
                                                        decide(request.id, false)
                                                    }
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Button
                                                    tone="primary"
                                                    title="Accept"
                                                    loading={mutation.isPending}
                                                    onPress={() =>
                                                        decide(request.id, true)
                                                    }
                                                />
                                            </View>
                                        </View>
                                    )}
                                </View>
                            ))}
                        </Section>
                    )}
                </>
            )}
            {mutation.error && <ErrorState error={mutation.error} />}
            <BottomSheet
                title={selected?.name ?? ""}
                subtitle="Members"
                open={open}
                size="full"
                onClose={() => setOpen(false)}
            >
                {selected ? <Members key={selected.id} id={selected.id} /> : null}
            </BottomSheet>
        </Screen>
    );
}
