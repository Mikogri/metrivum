import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { Schema } from "@metrivum/api-client-web";
import {
    Avatar,
    Button,
    EmptyState,
    ErrorState,
    Field,
    ListItem,
    LoadingState,
    Screen,
    Section,
    Text,
    confirm,
    useTheme,
    useToast,
    Switch,
} from "@metrivum/ui-mobile";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { StatusBadge, humanize, joinParts } from "../shared/format";
import { Pagination, useDraftExitGuard } from "../training/components";
import type { Page } from "../training/model";
import { AnswerFields } from "../check-ins";
import { LeadDetail } from "../clients";

export function CoachesScreen() {
 const nativeCopy = useNativeCopy().t;

    const [page, setPage] = useState(1);
    const coaches = useApiQuery<Page<Schema<"ClientRelationshipDto">>>(
        "/api/v1/coaching/my-coaches",
        { page, pageSize: 20 },
    );
    const invitations = useApiQuery<Page<Schema<"InvitationDto">>>(
        "/api/v1/coaching/my-invitations",
        { page, pageSize: 20 },
    );
    const applications = useApiQuery<Page<Schema<"ApplicationDto">>>(
        "/api/v1/coaching/applications",
        { page, pageSize: 20 },
    );
    const total = Math.max(
        coaches.data?.total ?? 0,
        invitations.data?.total ?? 0,
        applications.data?.total ?? 0,
    );
    const failure = coaches.error || invitations.error || applications.error;
    return (
        <Screen
            title={nativeCopy("interface.My coaches")}
            subtitle={nativeCopy("interface.Collaborations, invitations and your applications")}
        >
            {failure ? <ErrorState error={failure} /> : null}
            <Section title={nativeCopy("interface.Coaches")}>
                {coaches.isPending ? (
                    <LoadingState />
                ) : coaches.data?.items.length ? (
                    coaches.data.items.map((item) => (
                        <ListItem
                            key={item.id}
                            leading={<Avatar name={item.coach.displayName} />}
                            title={item.coach.displayName}
                            subtitle={item.teamId ? nativeCopy("interface.Team coaching") : nativeCopy("interface.Private coaching")}
                            trailing={<StatusBadge status={item.status} />}
                        />
                    ))
                ) : (
                    <EmptyState
                        icon="person"
                        title={nativeCopy("interface.No coach yet")}
                        description={nativeCopy("interface.Accept an invitation or apply to an offer to start.")}
                    />
                )}
            </Section>
            {(invitations.isPending || !!invitations.data?.items.length) && (
                <Section title={nativeCopy("interface.Invitations")}>
                    {invitations.isPending ? (
                        <LoadingState />
                    ) : (
                        invitations.data?.items.map((item) => (
                            <ListItem
                                key={item.id}
                                icon="mail"
                                title={item.coach.displayName}
                                subtitle={item.offerRevision.name}
                                trailing={<StatusBadge status={item.status} />}
                                onPress={() =>
                                    router.push({
                                        pathname: "/invitation/[id]",
                                        params: { id: item.id },
                                    })
                                }
                            />
                        ))
                    )}
                </Section>
            )}
            {(applications.isPending || !!applications.data?.items.length) && (
                <Section title={nativeCopy("interface.Applications")}>
                    {applications.isPending ? (
                        <LoadingState />
                    ) : (
                        applications.data?.items.map((item) => (
                            <ListItem
                                key={item.id}
                                icon="document"
                                title={item.offerName}
                                trailing={<StatusBadge status={item.status} />}
                                onPress={() =>
                                    router.push({
                                        pathname: "/application/[id]",
                                        params: { id: item.id },
                                    })
                                }
                            />
                        ))
                    )}
                </Section>
            )}
            <Pagination
                data={{ items: [], page, pageSize: 20, total }}
                onChange={setPage}
            />
        </Screen>
    );
}
type Option =
    Schema<"InvitationDto">["offerRevision"]["billingOptions"][number];

export function InvitationScreen() {
 const nativeCopy = useNativeCopy().t;

    const { id } = useLocalSearchParams<{ id: string }>();
    const { accountId } = useMobile();
    const query = useApiQuery<Schema<"InvitationDto">>(
        `/api/v1/coaching/invitations/${id}`,
    );
    const mutation = useApiMutation();
    const start = useApiMutation<Schema<"ApplicationDetailDto">>((value) =>
        router.push({
            pathname: "/application/[id]",
            params: { id: value.application.id },
        }),
    );
    const item = query.data;
    const [sessionCounts, setSessionCounts] = useState<Record<string, string>>(
        {},
    );
    const theme = useTheme();
    const sessionsValid = (option: Option) =>
        option.model !== "CustomPackage" ||
        (/^\d+$/.test(sessionCounts[option.id] ?? "") &&
            Number(sessionCounts[option.id]) >=
                Number(option.minSessions ?? 1) &&
            Number(sessionCounts[option.id]) <=
                Number(option.maxSessions ?? 1000));
    const decisions = {
        accept: {
            label: nativeCopy("interface.Accept invitation"),
            question: "Accept this invitation?",
            body: "You can then fill in the application for this offer.",
            destructive: false,
        },
        decline: {
            label: nativeCopy("interface.Decline"),
            question: "Decline this invitation?",
            body: "The coach is told you declined.",
            destructive: true,
        },
        revoke: {
            label: nativeCopy("interface.Revoke invitation"),
            question: "Revoke this invitation?",
            body: "It can no longer be accepted.",
            destructive: true,
        },
    } as const;
    if (query.isPending)
        return (
            <Screen title={nativeCopy("interface.Invitation")}>
                <LoadingState />
            </Screen>
        );
    if (query.error || !item)
        return (
            <Screen title={nativeCopy("interface.Invitation")}>
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            </Screen>
        );
    const available = (["decline", "revoke", "accept"] as const).filter(
        (action) => item.allowedActions.includes(action),
    );
    const canStart =
        item.status === "Accepted" &&
        item.targetUserId === accountId &&
        !item.applicationId;
    return (
        <Screen
            title={item.offerRevision.name}
            subtitle={nativeCopy("interface.Invitation from {0}", {"0": String(item.coach.displayName)})}
            footer={
                available.length || item.applicationId ? (
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                        {available.map((action) => (
                            <View key={action} style={{ flex: 1 }}>
                                <Button
                                    size="lg"
                                    tone={
                                        action === "accept"
                                            ? "primary"
                                            : "neutral"
                                    }
                                    title={decisions[action].label}
                                    loading={mutation.isPending}
                                    onPress={async () => {
                                        if (
                                            await confirm(
                                                decisions[action].question,
                                                decisions[action].body,
                                                decisions[action].label,
                                                {
                                                    destructive:
                                                        decisions[action]
                                                            .destructive,
                                                },
                                            )
                                        )
                                            mutation.mutate({
                                                path: `/api/v1/coaching/invitations/${id}/${action}`,
                                                method: "POST",
                                                ifMatch: item.version,
                                            });
                                    }}
                                />
                            </View>
                        ))}
                        {item.applicationId && (
                            <View style={{ flex: 1 }}>
                                <Button
                                    size="lg"
                                    tone="primary"
                                    title={nativeCopy("interface.Open application")}
                                    onPress={() =>
                                        router.push({
                                            pathname: "/application/[id]",
                                            params: { id: item.applicationId! },
                                        })
                                    }
                                />
                            </View>
                        )}
                    </View>
                ) : undefined
            }
        >
            <StatusBadge status={item.status} />
            {item.message ? (
                <Section>
                    <Text tone="mutedText">{item.message}</Text>
                </Section>
            ) : null}
            {!!(mutation.error || start.error) && (
                <ErrorState error={mutation.error || start.error} />
            )}
            {item.offerRevision.billingOptions
                .filter(
                    (option) =>
                        !item.billingOptionId ||
                        option.id === item.billingOptionId,
                )
                .map((option) => (
                    <Section key={option.id} title={option.name}>
                        <View
                            style={{
                                flexDirection: "row",
                                alignItems: "baseline",
                                justifyContent: "space-between",
                                gap: theme.spacing.sm,
                            }}
                        >
                            <Text variant="numeric">
                                {option.price} {item.offerRevision.currency}
                            </Text>
                            <Text variant="caption" tone="mutedText">
                                {humanize(option.model)}
                            </Text>
                        </View>
                        <Text variant="caption" tone="mutedText">
                            {option.validityDays
                                ? `Valid for ${option.validityDays} days from payment`
                                : nativeCopy("interface.No fixed expiry")}
                        </Text>
                        {option.model === "CustomPackage" && canStart && (
                            <Field
                                label={nativeCopy("interface.Number of sessions")}
                                hint={nativeCopy("interface.From {0} to {1}", {"0": String(option.minSessions),"1": String(option.maxSessions)})}
                                inputMode="numeric"
                                keyboardType="number-pad"
                                value={sessionCounts[option.id] ?? ""}
                                onChangeText={(value) =>
                                    setSessionCounts((previous) => ({
                                        ...previous,
                                        [option.id]: value,
                                    }))
                                }
                            />
                        )}
                        {canStart && (
                            <Button
                                tone="primary"
                                title={nativeCopy("interface.Fill in the application")}
                                loading={start.isPending}
                                disabled={!sessionsValid(option)}
                                onPress={() =>
                                    start.mutate({
                                        path: "/api/v1/coaching/applications",
                                        method: "POST",
                                        json: {
                                            offerId: item.offerRevision.offerId,
                                            billingOptionId: option.id,
                                            invitationId: item.id,
                                            ...(option.model === "CustomPackage"
                                                ? {
                                                      selectedSessionCount:
                                                          Number(
                                                              sessionCounts[
                                                                  option.id
                                                              ],
                                                          ),
                                                  }
                                                : {}),
                                        },
                                    })
                                }
                            />
                        )}
                    </Section>
                ))}
        </Screen>
    );
}
function ApplicationEditor({
    detail,
    refresh,
}: {
    detail: Schema<"ApplicationDetailDto">;
    refresh: () => Promise<unknown>;
}) {
 const nativeCopy = useNativeCopy().t;

    const { api, drafts } = useMobile();
    const toast = useToast();
    const [answers, setAnswers] = useState<Record<string, unknown>>(
        detail.answers,
    );
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [formValid, setFormValid] = useState(true);
    const [error, setError] = useState<unknown>();
    const [team, setTeam] = useState(false);
    const [version, setVersion] = useState(detail.application.version);
    const key = `application:${detail.application.id}`;
    const saving = useRef(false);
    const localWrites = useRef(Promise.resolve());
    const initialVersion = useRef(detail.application.version);
    const mutation = useApiMutation();
    const conflict = version !== detail.application.version;
    useDraftExitGuard(dirty || busy);
    useEffect(() => {
        let active = true;
        void drafts
            .get<Record<string, unknown>>(key)
            .then((local) => {
                if (!active) return;
                if (local) {
                    setAnswers(local.value);
                    setVersion(local.version);
                    setDirty(true);
                    if (local.version !== initialVersion.current)
                        setError(
                            Error(
                                "The server application changed. Your draft is preserved. Compare both versions before continuing.",
                            ),
                        );
                }
                setLoaded(true);
            })
            .catch((failure) => {
                if (active) setError(failure);
            });
        return () => {
            active = false;
        };
    }, [key, drafts]);
    async function save(submit: boolean) {
        if (saving.current || !loaded || conflict || !formValid) return;
        saving.current = true;
        setBusy(true);
        setError(undefined);
        try {
            await localWrites.current;
            await drafts.put(key, answers, version);
            const result = await api<Schema<"ApplicationDetailDto">>({
                path: `/api/v1/coaching/applications/${detail.application.id}${submit ? "/submit" : ""}`,
                method: submit ? "POST" : "PUT",
                ifMatch: version,
                json: { answers, ...(submit ? { acceptTeamScope: team } : {}) },
            });
            setVersion(result.data.application.version);
            setDirty(false);
            await drafts.remove(key);
            toast(submit ? "Application submitted" : "Draft saved");
            await refresh();
            if (submit) router.back();
        } catch (failure) {
            setError(failure);
            toast(
                failure instanceof Error
                    ? failure.message
                    : "Unable to save the application.",
                true,
            );
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }
    if (!loaded) return error ? <ErrorState error={error} /> : <LoadingState />;
    const selectedOption = detail.offerRevision.billingOptions.find(
        (option) => option.id === detail.application.billingOptionId,
    );
    const can = (action: string) =>
        detail.application.allowedActions.includes(action);
    return (
        <>
            <Section>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                    }}
                >
                    <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyStrong">
                            {detail.offerRevision.name}
                        </Text>
                        <Text variant="caption" tone="mutedText">
                            {joinParts(
                                detail.application.amount === 0 ? "Free" : `${detail.application.amount} ${detail.application.currency}`,
                                selectedOption?.validityDays
                                    ? `valid ${selectedOption.validityDays} days from payment`
                                    : "no fixed expiry",
                            )}
                        </Text>
                    </View>
                    <StatusBadge status={detail.application.status} />
                </View>
            </Section>
            {!!(error || mutation.error) && (
                <Section>
                    <ErrorState error={error || mutation.error} />
                    <Button
                        title={nativeCopy("interface.Compare with the server version")}
                        onPress={async () => {
                            await refresh();
                        }}
                    />
                </Section>
            )}
            {conflict && detail.formVersion && (
                <Section title={nativeCopy("interface.The saved version changed")}>
                    <Text variant="caption" tone="warning">

                        {nativeCopy("interface.These are the answers on the server. Your own draft is below.")}
                    </Text>
                    <AnswerFields
                        key={detail.formVersion.id}
                        definition={detail.formVersion.definition}
                        answers={detail.answers}
                    />
                    <Button
                        title={nativeCopy("interface.Keep my draft")}
                        onPress={async () => {
                            if (
                                await confirm(
                                    "Use your own answers?",
                                    "Saving will replace the answers shown above.",
                                    "Use my draft",
                                )
                            ) {
                                setVersion(detail.application.version);
                                setError(undefined);
                                await drafts
                                    .put(
                                        key,
                                        answers,
                                        detail.application.version,
                                    )
                                    .catch(setError);
                            }
                        }}
                    />
                </Section>
            )}
            {detail.formVersion ? <AnswerFields
                key={detail.formVersion.id}
                definition={detail.formVersion.definition}
                answers={answers}
                disabled={busy || !can("save")}
                onValidityChange={setFormValid}
                onChange={(next) => {
                    setAnswers(next);
                    setDirty(true);
                    localWrites.current = drafts.put(key, next, version);
                    void localWrites.current.catch(setError);
                }}
            /> : <Section><Text>{nativeCopy("interface.No application form is required. Review the offer and submit when ready.")}</Text></Section>}
            {can("submit") && (
                <Section>
                    <ListItem
                        title={nativeCopy("interface.Team access")}
                        subtitle={nativeCopy("interface.I agree that the Team can access my coaching data if this offer belongs to a Team.")}
                        trailing={
                            <Switch
                                accessibilityLabel={nativeCopy("interface.Accept Team access")}
                                disabled={busy}
                                value={team}
                                onValueChange={setTeam}
                            />
                        }
                    />
                </Section>
            )}
            {can("submit") && (
                <Button
                    size="lg"
                    tone="primary"
                    title={nativeCopy("interface.Submit application")}
                    loading={busy}
                    disabled={conflict || !formValid}
                    onPress={() => save(true)}
                />
            )}
            {can("save") && (
                <Button
                    title={nativeCopy("interface.Save draft")}
                    disabled={conflict || !formValid || busy}
                    onPress={() => save(false)}
                />
            )}
            {can("withdraw") && (
                <Button
                    tone="danger"
                    title={nativeCopy("interface.Withdraw application")}
                    loading={mutation.isPending}
                    onPress={async () => {
                        if (
                            await confirm(
                                "Withdraw this application?",
                                "The coach will no longer review it.",
                                "Withdraw",
                            )
                        )
                            mutation.mutate({
                                path: `/api/v1/coaching/applications/${detail.application.id}/withdraw`,
                                method: "POST",
                                ifMatch: version,
                            });
                    }}
                />
            )}
        </>
    );
}
export function ApplicationScreen() {
 const nativeCopy = useNativeCopy().t;

    const { id } = useLocalSearchParams<{ id: string }>();
    const query = useApiQuery<
        Schema<"ApplicationDetailDto"> | Schema<"CoachApplicationDetailDto">
    >(`/api/v1/coaching/applications/${id}`);
    return (
        <Screen title={nativeCopy("interface.Application")}>
            {query.isPending ? (
                <LoadingState />
            ) : query.error ? (
                <ErrorState error={query.error} />
            ) : (
                query.data &&
                ("detail" in query.data ? (
                    <LeadDetail id={id} />
                ) : (
                    <ApplicationEditor
                        key={`${id}:${query.data.application.status}`}
                        detail={query.data}
                        refresh={query.refetch}
                    />
                ))
            )}
        </Screen>
    );
}
