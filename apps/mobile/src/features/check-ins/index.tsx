import { NativeDateField } from "../training/NativeDateField";
import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { Schema } from "@metrivum/api-client-web";
import { View } from "react-native";
import {
    BottomSheet,
    Button,
    Chip,
    EmptyState,
    ErrorState,
    Field,
    ListItem,
    LoadingState,
    Screen,
    SearchField,
    Section,
    Text,
    useTheme,
} from "@metrivum/ui-mobile";
import { Filters } from "../shared/Filters";
import { StatusBadge, formatDateTime, humanize } from "../shared/format";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import {
    Choices,
    DecimalField,
    Pagination,
    useDraftExitGuard,
} from "../training/components";
import type { Page } from "../training/model";

type Answers = Record<string, unknown>;
type Question =
    Schema<"FormDefinition">["sections"][number]["questions"][number];
/** Which check-in to show: its id and, for a coach, the relationship it belongs to. */
export type CheckInTarget = { id: string; relationshipId?: string };
export function AnswerFields({
    definition,
    answers,
    onChange,
    disabled = false,
    onValidityChange,
}: {
    definition: Schema<"FormDefinition">;
    answers: Answers;
    onChange?: (answers: Answers) => void;
    disabled?: boolean;
    onValidityChange?: (valid: boolean) => void;
}) {
    const theme = useTheme();
    const invalidFields = useRef(new Set<string>());
    const validity = (key: string, valid: boolean) => {
        if (valid) invalidFields.current.delete(key);
        else invalidFields.current.add(key);
        onValidityChange?.(invalidFields.current.size === 0);
    };
    const set = (key: string, value: unknown) =>
        onChange?.({ ...answers, [key]: value });
    const display = (question: Question, value: unknown) =>
        value == null || value === ""
            ? "Not answered"
            : typeof value === "boolean"
              ? value
                  ? "Yes"
                  : "No"
              : Array.isArray(value)
                ? value
                      .map(
                          (v) =>
                              question.choices?.find((c) => c.key === v)
                                  ?.label ?? String(v),
                      )
                      .join(", ")
                : (question.choices?.find((c) => c.key === value)?.label ??
                  `${String(value)}${question.unit ? ` ${question.unit}` : ""}`);
    return (
        <>
            {[...definition.sections]
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                    <Section key={section.key} title={section.title}>
                        {section.description ? (
                            <Text variant="caption" tone="mutedText">
                                {section.description}
                            </Text>
                        ) : null}
                        {[...section.questions]
                            .sort((a, b) => a.order - b.order)
                            .map((question) => {
                                const value = answers[question.key];
                                const label = `${question.label}${question.required ? " *" : ""}`;
                                if (!onChange)
                                    return (
                                        <View
                                            key={question.key}
                                            style={{ gap: 2 }}
                                        >
                                            <Text
                                                variant="caption"
                                                tone="mutedText"
                                            >
                                                {question.label}
                                            </Text>
                                            <Text
                                                tone={
                                                    value == null || value === ""
                                                        ? "subtleText"
                                                        : "text"
                                                }
                                            >
                                                {display(question, value)}
                                            </Text>
                                        </View>
                                    );
                                if (question.type === "FileAttachment")
                                    return (
                                        <Text
                                            key={question.key}
                                            variant="caption"
                                            tone="warning"
                                        >
                                            {question.label}: file answers are
                                            not supported yet. Answer this one
                                            in the web app.
                                        </Text>
                                    );
                                const range =
                                    question.type === "Scale" &&
                                    Number.isInteger(question.min) &&
                                    Number.isInteger(question.max) &&
                                    Number(question.max) - Number(question.min) <=
                                        10
                                        ? Array.from(
                                              {
                                                  length:
                                                      Number(question.max) -
                                                      Number(question.min) +
                                                      1,
                                              },
                                              (_, index) =>
                                                  Number(question.min) + index,
                                          )
                                        : null;
                                if (
                                    question.type === "SingleChoice" ||
                                    question.type === "MultiChoice" ||
                                    question.type === "YesNo" ||
                                    range
                                ) {
                                    const options = range
                                        ? range.map((step) => ({
                                              key: String(step),
                                              label: String(step),
                                          }))
                                        : question.type === "YesNo"
                                          ? [
                                                { key: "true", label: "Yes" },
                                                { key: "false", label: "No" },
                                            ]
                                          : (question.choices ?? []);
                                    return (
                                        <View
                                            key={question.key}
                                            style={{ gap: theme.spacing.sm }}
                                        >
                                            <Text variant="label">{label}</Text>
                                            {question.helpText ? (
                                                <Text
                                                    variant="caption"
                                                    tone="mutedText"
                                                >
                                                    {question.helpText}
                                                </Text>
                                            ) : null}
                                            <View
                                                accessibilityRole={
                                                    question.type ===
                                                    "MultiChoice"
                                                        ? undefined
                                                        : "radiogroup"
                                                }
                                                accessibilityLabel={
                                                    question.label
                                                }
                                                style={{
                                                    flexDirection: "row",
                                                    flexWrap: "wrap",
                                                    gap: theme.spacing.sm,
                                                }}
                                            >
                                                {options.map((choice) => {
                                                    const selected =
                                                        Array.isArray(value)
                                                            ? value.includes(
                                                                  choice.key,
                                                              )
                                                            : String(value) ===
                                                              choice.key;
                                                    return (
                                                        <Chip
                                                            key={choice.key}
                                                            disabled={disabled}
                                                            selected={selected}
                                                            label={choice.label}
                                                            onPress={() =>
                                                                set(
                                                                    question.key,
                                                                    range
                                                                        ? Number(
                                                                              choice.key,
                                                                          )
                                                                        : question.type ===
                                                                            "YesNo"
                                                                          ? choice.key ===
                                                                            "true"
                                                                          : question.type ===
                                                                              "MultiChoice"
                                                                            ? selected
                                                                                ? (
                                                                                      value as string[]
                                                                                  ).filter(
                                                                                      (
                                                                                          v,
                                                                                      ) =>
                                                                                          v !==
                                                                                          choice.key,
                                                                                  )
                                                                                : [
                                                                                      ...(Array.isArray(
                                                                                          value,
                                                                                      )
                                                                                          ? value
                                                                                          : []),
                                                                                      choice.key,
                                                                                  ]
                                                                            : choice.key,
                                                                )
                                                            }
                                                        />
                                                    );
                                                })}
                                            </View>
                                            {range &&
                                            (question.minLabel ||
                                                question.maxLabel) ? (
                                                <View
                                                    style={{
                                                        flexDirection: "row",
                                                        justifyContent:
                                                            "space-between",
                                                    }}
                                                >
                                                    <Text
                                                        variant="caption"
                                                        tone="subtleText"
                                                    >
                                                        {question.minLabel}
                                                    </Text>
                                                    <Text
                                                        variant="caption"
                                                        tone="subtleText"
                                                    >
                                                        {question.maxLabel}
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    );
                                }
                                if (
                                    question.type === "Number" ||
                                    question.type === "Scale"
                                )
                                    return (
                                        <DecimalField
                                            key={question.key}
                                            allowNegative={
                                                question.min == null ||
                                                question.min < 0
                                            }
                                            label={label}
                                            placeholder={
                                                [
                                                    question.min != null &&
                                                        `from ${question.min}`,
                                                    question.max != null &&
                                                        `to ${question.max}`,
                                                    question.unit,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" ") || undefined
                                            }
                                            value={
                                                typeof value === "number"
                                                    ? value
                                                    : null
                                            }
                                            disabled={disabled}
                                            onValidityChange={(valid) =>
                                                validity(
                                                    `${section.key}:${question.key}`,
                                                    valid,
                                                )
                                            }
                                            onChange={(next) =>
                                                set(question.key, next)
                                            }
                                        />
                                    );
                                if (question.type === "Date")
                                    return (
                                        <NativeDateField
                                            key={question.key}
                                            label={label}
                                            value={
                                                typeof value === "string"
                                                    ? value
                                                    : ""
                                            }
                                            disabled={disabled}
                                            onChange={(next) =>
                                                set(question.key, next)
                                            }
                                        />
                                    );
                                return (
                                    <Field
                                        key={question.key}
                                        label={label}
                                        hint={question.helpText ?? undefined}
                                        placeholder="Your answer"
                                        value={
                                            typeof value === "string"
                                                ? value
                                                : ""
                                        }
                                        multiline={question.type === "LongText"}
                                        editable={!disabled}
                                        maxLength={
                                            question.maxLength ?? undefined
                                        }
                                        onChangeText={(next) =>
                                            set(question.key, next)
                                        }
                                    />
                                );
                            })}
                    </Section>
                ))}
        </>
    );
}

const checkInStatuses = [
    "",
    "Available",
    "Overdue",
    "Submitted",
    "Reviewed",
    "Scheduled",
    "Cancelled",
] as const;

/**
 * Check-ins of one relationship or of everyone. A row opens the details in a tall bottom sheet;
 * the same details are also a screen, for links that arrive from notifications.
 */
export function CheckInList({ relationshipId }: { relationshipId?: string }) {
    const { role } = useMobile();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("");
    const [target, setTarget] = useState<CheckInTarget>();
    const query = useApiQuery<Page<Schema<"CheckInRequestDto">>>(
        "/api/v1/check-ins/requests",
        {
            role,
            relationshipId,
            page,
            pageSize: 20,
            search,
            status: status || undefined,
        },
    );
    return (
        <>
            <SearchField
                label="Search check-ins"
                value={search}
                onChangeText={(value) => {
                    setSearch(value);
                    setPage(1);
                }}
            />
            <Filters
                title="Filter check-ins"
                active={!!status}
                summary={status ? humanize(status) : "All statuses"}
                onReset={() => {
                    setStatus("");
                    setPage(1);
                }}
            >
                <Choices
                    label="Status"
                    values={checkInStatuses}
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
                                    icon="checkIn"
                                    title={item.scheduleName}
                                    subtitle={`Due ${formatDateTime(item.dueAtUtc)}`}
                                    trailing={
                                        <StatusBadge status={item.status} />
                                    }
                                    onPress={() =>
                                        setTarget({
                                            id: item.id,
                                            relationshipId: item.relationshipId,
                                        })
                                    }
                                />
                            ))}
                            {!query.data.items.length && (
                                <EmptyState
                                    icon="checkIn"
                                    title={
                                        search || status
                                            ? "No check-ins match"
                                            : "No check-ins yet"
                                    }
                                    description={
                                        role === "coach"
                                            ? "Assign one to a client to start collecting answers."
                                            : "Check-ins from your coach appear here."
                                    }
                                />
                            )}
                            <Pagination data={query.data} onChange={setPage} />
                        </>
                    )
                )}
            </Section>
            <CheckInSheet target={target} onClose={() => setTarget(undefined)} />
        </>
    );
}

export function CheckInsScreen() {
    const { role } = useMobile();
    return (
        <Screen
            title="Check-ins"
            subtitle={
                role === "coach"
                    ? "Answers from your clients"
                    : "Forms from your coach"
            }
        >
            <CheckInList />
        </Screen>
    );
}

function ResponseEditor({
    data,
    refresh,
    onBlockedChange,
}: {
    data: Schema<"CheckInDetailDto">;
    refresh: () => void;
    /** Reports whether closing now would lose work (a local save is pending or failed). */
    onBlockedChange?: (blocked: boolean) => void;
}) {
    const { profile, drafts } = useMobile();
    const coach = profile.id === data.form.coachId;
    const key = `check-in:${data.request.id}:${data.request.formVersionId}`;
    // Hydrate once for this mounted request; polling must never replace local edits.
    const [initial] = useState(() => ({
        drafts,
        key,
        version: data.request.version,
    }));
    const [value, setValue] = useState({
        answers: {} as Answers,
        reply: data.request.clientReply || "",
        notes: data.coachPrivateNotes || "",
    });
    const { answers, reply, notes } = value;
    const latest = useRef(value);
    const [loaded, setLoaded] = useState(false);
    const [localState, setLocalState] = useState("");
    const [error, setError] = useState<unknown>();
    const [draftVersion, setDraftVersion] = useState(initial.version);
    const [busy, setBusy] = useState(false);
    const [formValid, setFormValid] = useState(true);
    const valid = useRef(true);
    const locked = useRef(false);
    const mounted = useRef(false);
    const revision = useRef(0);
    const localQueue = useRef(Promise.resolve());
    const blocked =
        !formValid ||
        busy ||
        localState === "Saving locally" ||
        localState === "Local save failed";
    useDraftExitGuard(blocked);
    const reportBlocked = useRef(onBlockedChange);
    reportBlocked.current = onBlockedChange;
    useEffect(() => {
        reportBlocked.current?.(blocked);
        return () => reportBlocked.current?.(false);
    }, [blocked]);
    const mutation = useApiMutation();
    useEffect(() => {
        let active = true;
        mounted.current = true;
        void initial.drafts
            .get<typeof value>(initial.key)
            .then((local) => {
                if (!active) return;
                if (local) {
                    setDraftVersion(local.version);
                    latest.current = local.value;
                    setValue(local.value);
                    setLocalState("Saved locally");
                    if (local.version !== initial.version)
                        setError(
                            new Error(
                                "The server request changed. Your draft is preserved; review before submitting.",
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
            mounted.current = false;
        };
    }, [initial]);
    function saveLocal(next: typeof value, version = draftVersion) {
        if (locked.current) return;
        latest.current = next;
        setValue(next);
        setLocalState("Saving locally");
        const current = ++revision.current;
        localQueue.current = initial.drafts
            .put(initial.key, next, version)
            .then(() => {
                if (mounted.current && current === revision.current) {
                    setLocalState("Saved locally");
                    setError(undefined);
                }
            })
            .catch((failure) => {
                if (mounted.current && current === revision.current) {
                    setLocalState("Local save failed");
                    setError(failure);
                }
                throw failure;
            });
        void localQueue.current.catch(() => {});
    }
    async function submit() {
        if (
            locked.current ||
            !valid.current ||
            draftVersion !== data.request.version
        )
            return;
        locked.current = true;
        setBusy(true);
        setError(undefined);
        try {
            await localQueue.current;
            if (!mounted.current) return;
            const current = latest.current;
            await mutation.mutateAsync({
                path: `/api/v1/check-ins/requests/${data.request.id}/${coach ? "review" : "submit"}`,
                method: "POST",
                ifMatch: draftVersion,
                idempotencyKey: `${data.request.id}:${draftVersion}`,
                json: coach
                    ? {
                          clientReply: current.reply || null,
                          coachPrivateNotes: current.notes || null,
                      }
                    : { answers: current.answers },
            });
            await initial.drafts.remove(initial.key);
            if (mounted.current) {
                setLocalState("Saved to server");
                refresh();
            }
        } catch (failure) {
            if (mounted.current) {
                setError(failure);
                setBusy(false);
            }
            locked.current = false;
        }
    }
    if (!loaded) return error ? <ErrorState error={error} /> : <LoadingState />;
    const stale = draftVersion !== data.request.version;
    return (
        <>
            {!!localState && (
                <Text
                    variant="caption"
                    tone={
                        localState === "Local save failed"
                            ? "danger"
                            : "subtleText"
                    }
                    accessibilityLiveRegion="polite"
                >
                    {localState}
                </Text>
            )}
            {stale && (
                <Section>
                    <Text tone="warning">
                        This check-in changed on the server. Your answers are
                        kept; look through them before sending.
                    </Text>
                    <Button
                        title="Keep my answers and continue"
                        disabled={busy}
                        onPress={() => {
                            if (locked.current) return;
                            setDraftVersion(data.request.version);
                            saveLocal(latest.current, data.request.version);
                        }}
                    />
                </Section>
            )}
            {!!(error || mutation.error) && (
                <ErrorState error={error || mutation.error} />
            )}
            {data.submission ? (
                <AnswerFields
                    definition={data.form.definition}
                    answers={data.submission.answers}
                />
            ) : !coach &&
              ["Available", "Overdue"].includes(data.request.status) ? (
                <>
                    <AnswerFields
                        definition={data.form.definition}
                        answers={answers}
                        onValidityChange={(next) => {
                            valid.current = next;
                            setFormValid(next);
                        }}
                        disabled={busy}
                        onChange={(next) => {
                            saveLocal({ ...latest.current, answers: next });
                        }}
                    />
                    <Button
                        size="lg"
                        tone="primary"
                        title="Send check-in"
                        loading={busy}
                        disabled={!formValid || stale}
                        onPress={() => void submit()}
                    />
                </>
            ) : (
                <EmptyState
                    icon="schedule"
                    title={coach ? "Waiting for the client" : "Not open yet"}
                    description={
                        coach
                            ? "Answers appear here once the check-in is sent."
                            : "You can fill it in once it is released."
                    }
                />
            )}
            {data.request.clientReply && (
                <Section title={coach ? "Your reply" : "Reply from your coach"}>
                    <Text>{data.request.clientReply}</Text>
                </Section>
            )}
            {coach && data.coachPrivateNotes && (
                <Section title="Private notes">
                    <Text tone="mutedText">{data.coachPrivateNotes}</Text>
                </Section>
            )}
            {coach && data.request.status === "Submitted" && (
                <Section title="Review" flat>
                    <Field
                        label="Reply to the client"
                        placeholder="Visible to the client"
                        value={reply}
                        multiline
                        editable={!busy}
                        onChangeText={(next) => {
                            saveLocal({ ...latest.current, reply: next });
                        }}
                    />
                    <Field
                        label="Private notes"
                        placeholder="Only you see these"
                        value={notes}
                        multiline
                        editable={!busy}
                        onChangeText={(next) => {
                            saveLocal({ ...latest.current, notes: next });
                        }}
                    />
                    <Button
                        size="lg"
                        tone="primary"
                        icon="check"
                        title="Mark as reviewed"
                        loading={busy}
                        disabled={!formValid || stale}
                        onPress={() => void submit()}
                    />
                </Section>
            )}
        </>
    );
}

const detailPath = (target: CheckInTarget) =>
    target.relationshipId
        ? `/api/v1/check-ins/relationships/${target.relationshipId}/requests/${target.id}`
        : `/api/v1/check-ins/requests/${target.id}`;

/** Details of one check-in in a tall, scrolling bottom sheet. */
export function CheckInSheet({
    target,
    onClose,
}: {
    target: CheckInTarget | undefined;
    onClose: () => void;
}) {
    // The last target stays rendered while the sheet animates out.
    const [shown, setShown] = useState(target);
    if (target && target !== shown) setShown(target);
    const [blocked, setBlocked] = useState(false);
    const query = useApiQuery<Schema<"CheckInDetailDto">>(
        detailPath(shown ?? { id: "" }),
        undefined,
        !!shown,
    );
    return (
        <BottomSheet
            title={query.data?.request.scheduleName || "Check-in"}
            subtitle={
                query.data
                    ? `${humanize(query.data.request.status)} · due ${formatDateTime(query.data.request.dueAtUtc)}`
                    : undefined
            }
            open={!!target}
            size="full"
            dirty={blocked}
            discard={{
                title: "Close without saving?",
                message:
                    "Your latest change has not been saved on this phone yet.",
                confirmLabel: "Close anyway",
            }}
            onClose={onClose}
        >
            {!shown ? null : query.isPending ? (
                <LoadingState />
            ) : query.error || !query.data ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : (
                <ResponseEditor
                    key={`${shown.id}:${query.data.request.formVersionId}:${query.data.request.status}`}
                    data={query.data}
                    refresh={() => void query.refetch()}
                    onBlockedChange={setBlocked}
                />
            )}
        </BottomSheet>
    );
}

/** The same details as a screen, for deep links and notifications. */
export function CheckInScreen() {
    const { id, relationshipId } = useLocalSearchParams<{
        id: string;
        relationshipId?: string;
    }>();
    const query = useApiQuery<Schema<"CheckInDetailDto">>(
        detailPath({ id, relationshipId }),
    );
    return (
        <Screen
            title={query.data?.request.scheduleName || "Check-in"}
            subtitle={
                query.data
                    ? `Due ${formatDateTime(query.data.request.dueAtUtc)}`
                    : undefined
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
                        <StatusBadge status={query.data.request.status} />
                        <ResponseEditor
                            key={`${id}:${query.data.request.formVersionId}:${query.data.request.status}`}
                            data={query.data}
                            refresh={() => void query.refetch()}
                        />
                    </>
                )
            )}
        </Screen>
    );
}
