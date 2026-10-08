import { Inbox, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { Badge, Button, Checkbox, Combobox, Dialog, DialogFooter, EmptyState, LoadingState, Option, Select, Spinner, TextField } from "@trainflow/ui-web";
import { useAccountContext } from "~/shared/session";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useApi } from "~/shared/session";
import { root, useChatQuery } from "./api";
import { Failure, useChatAction } from "./messages";
import type { Conversation, Request } from "./model";
import styles from "./messaging.module.css";
export type ChatPerson = { userId: string; displayName: string; username: string };
type Person = { id: string; displayName: string; username?: string | null };
function useContacts() {
    const coach = useWorkspace().mode === "coach";
    const access = useFeatureAccess(
        coach ? "coaching.clients.view" : "coaching.relationships.read-own",
    );
    const allowed = access.allowed;
    const query = useChatQuery<{
        items: { status: string; client?: Person; coach?: Person }[];
        total: number;
    }>(
        `/api/v1/coaching/${coach ? "clients" : "my-coaches"}`,
        { page: 1, pageSize: 100 },
        allowed,
    );
    return {
        ...query,
        enabled: allowed,
        // Still deciding access or still fetching: not the same as having no contacts.
        loading: access.pending || (allowed && query.isPending),
        people: (query.data?.items ?? [])
            .filter((r) => r.status === "Active")
            .flatMap((r) =>
                (coach ? r.client : r.coach)
                    ? [coach ? r.client! : r.coach!]
                    : [],
            ),
    };
}
export function NewConversation({
    close,
    open,
    start,
}: {
    start: (person: ChatPerson) => void;
    close: () => void;
    open: (id: string) => void;
}) {
    const direct = useFeatureAccess("messaging.direct").allowed;
    const groupAccess = useFeatureAccess("messaging.groups").allowed;
    const manage =
        useFeatureAccess("messaging.group.manage").allowed && groupAccess;
    const groupManagement = useFeatureAccess("coaching.groups.manage").allowed;
    const canLink =
        useWorkspace().mode === "coach" && groupManagement && manage;
    const [kind, setKind] = useState(direct ? "direct" : "group");
    const [title, setTitle] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const api = useApi();
    const [search, setSearch] = useState("");
    const [term, setTerm] = useState("");
    const [opening, setOpening] = useState(false);
    const [openError, setOpenError] = useState<unknown>(null);
    useEffect(() => { const timer = setTimeout(() => setTerm(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
    const people = useChatQuery<ChatPerson[]>(`${root}/people`, { search: term }, direct && kind === "direct" && term.replace(/^@/, "").length >= 2);
    async function choose(userId: string) {
        const target = people.data?.find(p => p.userId === userId);
        if (!target || opening) return;
        setOpening(true); setOpenError(null);
        try { open((await api<Conversation>({ method: "POST", path: `${root}/conversations/direct`, json: { userId } })).data.id); }
        catch (error) {
            if (error instanceof ApiError && error.code === "MESSAGE_REQUEST_REQUIRED") start(target);
            else setOpenError(error);
        } finally { setOpening(false); }
    }
    const [group, setGroup] = useState("");
    const contacts = useContacts();
    const groups = useChatQuery<{ items: Schema<"GroupDto">[] }>(
        "/api/v1/coaching/groups",
        { page: 1, pageSize: 100 },
        canLink && kind === "linked",
    );
    const action = useChatAction<Conversation | Request>((value) => {
        open(value.id);
    });
    const kinds = [
        ...(direct ? [["direct", "Direct conversation"]] : []),
        ...(manage ? [["group", "New group"]] : []),
        ...(canLink ? [["linked", "Client group"]] : []),
    ] as [string, string][];
    return (
        <Dialog
            isOpen
            onOpenChange={(value) => {
                if (!value && !action.isPending) close();
            }}
            title="New conversation"
            description="Connect with a client, coach or your training group."
        >
            <form
                className={styles.form}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (kind === "group") action.mutate({ method: "POST", path: `${root}/conversations/group`, json: { title, userIds: selected } });
                    if (kind === "linked") action.mutate({ method: "POST", path: `/api/v1/coaching/groups/${group}/conversation` });
                }}
            >
                <Select
                    label="Conversation type"
                    selectedKey={kind}
                    onSelectionChange={(key) => {
                        setKind(String(key));
                        action.reset();
                    }}
                >
                    {kinds.map(([id, label]) => (
                        <Option key={id} id={id}>
                            {label}
                        </Option>
                    ))}
                </Select>
                {kind === "direct" && <>
                    <Combobox
                        label="Find a person"
                        placeholder="Name or @username"
                        inputValue={search}
                        onInputChange={setSearch}
                        menuTrigger="input"
                        onSelectionChange={(key) => { if (key) void choose(String(key)); }}
                        isDisabled={opening}
                        allowsEmptyCollection
                        defaultFilter={() => true}
                        emptyState={term.replace(/^@/, "").length < 2 ? "Type at least two characters." : people.isFetching ? <span className={styles.searching}><Spinner size="sm" />Searching…</span> : "Nobody matches. Check the username."}
                        description={opening ? "Opening the conversation…" : "Choose someone to open your chat with them."}
                    >
                        {(term === search.trim() ? people.data ?? [] : []).map((p) => (
                            <Option key={p.userId} id={p.userId} textValue={`${p.displayName} @${p.username}`} description={`@${p.username}`}>
                                <span className={styles.personOption}>
                                    <span className={styles.avatar} data-size="sm" aria-hidden="true">{initialsOf(p.displayName || p.username || "?")}</span>
                                    {p.displayName}
                                </span>
                            </Option>
                        ))}
                    </Combobox>
                    {people.error || openError ? <Failure error={people.error || openError} /> : null}
                </>}
                {kind === "group" && <>
                    <TextField label="Group name" placeholder="e.g. Marathon crew" value={title} onChange={setTitle} isRequired maxLength={200} />
                    {contacts.loading ? <Spinner label="Loading contacts" /> : contacts.error ? <Failure error={contacts.error} retry={() => void contacts.refetch()} /> :
                        <div className={styles.people}>{contacts.people.map(p => <Checkbox key={p.id} isSelected={selected.includes(p.id)} onChange={on => setSelected(on ? [...selected, p.id] : selected.filter(id => id !== p.id))}>{p.displayName || p.username}</Checkbox>)}</div>}
                </>}
                {kind === "linked" && (
                    <>
                        {groups.error ? (
                            <Failure error={groups.error} retry={() => void groups.refetch()} />
                        ) : (
                            <Select label="Client group" placeholder="Choose a group" isRequired selectedKey={group || null} onSelectionChange={(key) => setGroup(String(key))}>
                                {(groups.data?.items ?? [])
                                    .filter((g) => !g.archived)
                                    .map((g) => (
                                        <Option key={g.id} id={g.id}>
                                            {g.name}
                                        </Option>
                                    ))}
                            </Select>
                        )}
                        <p className={styles.hint}>Members follow this client group's active relationships. Manual additions and exclusions are kept.</p>
                    </>
                )}
                {action.error && <Failure error={action.error} />}
                <DialogFooter>
                    <Button onPress={close} isDisabled={action.isPending}>
                        Cancel
                    </Button>
                    {kind !== "direct" && <Button
                        type="submit"
                        variant="primary"
                        loading={action.isPending}
                        isDisabled={(kind === "linked" && !group) || (kind === "group" && !title.trim())}
                    >
                        Open conversation
                    </Button>}
                </DialogFooter>
            </form>
        </Dialog>
    );
}
const initialsOf = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("") || "?";
const stateTone = (state: string) => (state === "Accepted" ? "success" : state === "Pending" ? "info" : "neutral");

/** Message requests split into received and sent, each a card with the introduction and its actions; blocked people as a list. */
export function Requests({ kind, requests, open }: { kind: string; requests: UseQueryResult<Request[]>; open: (id: string) => void }) {
    const { account } = useAccountContext();
    const blocked = useChatQuery<string[]>("/api/v1/me/blocked-users", undefined, kind === "blocked");
    const contacts = useContacts();
    const action = useChatAction<Request>((r) => {
        if (r?.state === "Accepted" && r.conversationId) open(r.conversationId);
    });
    const name = (id: string) => contacts.people.find((p) => p.id === id)?.displayName || "TrainFlow member";
    if (kind === "blocked")
        return (
            <>
                {action.error && <Failure error={action.error} />}
                {blocked.isPending ? (
                    <LoadingState label="Loading blocked people" />
                ) : blocked.error ? (
                    <Failure error={blocked.error} retry={() => void blocked.refetch()} />
                ) : !blocked.data.length ? (
                    <EmptyState icon={<ShieldCheck />} title="Nobody is blocked" description="People you block can't send you direct messages or contact requests." />
                ) : (
                    <ul className={styles.blockedList}>
                        {blocked.data.map((id) => (
                            <li key={id} className={styles.blockedRow}>
                                <span className={styles.avatar} data-size="sm" aria-hidden="true">
                                    {initialsOf(name(id))}
                                </span>
                                <span className={styles.blockedName}>{name(id)}</span>
                                <Button size="sm" isDisabled={action.isPending} onPress={() => action.mutate({ method: "DELETE", path: `/api/v1/me/blocked-users/${id}` })}>
                                    Unblock
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </>
        );
    const received = (requests.data ?? []).filter((r) => r.recipientUserId === account.userId);
    const sent = (requests.data ?? []).filter((r) => r.recipientUserId !== account.userId);
    const card = (r: Request, incoming: boolean) => {
        const person = incoming ? r.senderDisplayName || name(r.senderUserId) : r.recipientDisplayName || name(r.recipientUserId);
        return (
            <article className={styles.requestCard} key={r.id} data-state={r.state}>
                <header className={styles.requestHead}>
                    <span className={styles.avatar} aria-hidden="true">
                        {initialsOf(person)}
                    </span>
                    <span className={styles.requestWho}>
                        <strong>{person}</strong>
                        <small>{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</small>
                    </span>
                    <Badge tone={stateTone(r.state)} size="sm" dot>
                        {r.state}
                    </Badge>
                </header>
                <p className={styles.requestBody}>{r.body}</p>
                {r.state === "Pending" || r.conversationId ? (
                    <footer className={styles.requestActions}>
                        {r.state === "Pending" && incoming ? (
                            <>
                                <Button size="sm" variant="ghost" isDisabled={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${r.id}/decline` })}>
                                    Decline
                                </Button>
                                <Button size="sm" variant="primary" isDisabled={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${r.id}/accept` })}>
                                    Accept
                                </Button>
                            </>
                        ) : null}
                        {r.state === "Pending" && !incoming ? (
                            <Button size="sm" variant="ghost" isDisabled={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${r.id}/cancel` })}>
                                Cancel request
                            </Button>
                        ) : null}
                        {r.conversationId ? (
                            <Button size="sm" onPress={() => open(r.conversationId!)}>
                                Open conversation
                            </Button>
                        ) : null}
                    </footer>
                ) : null}
            </article>
        );
    };
    return (
        <>
            {action.error && <Failure error={action.error} />}
            {requests.isPending ? (
                <LoadingState label="Loading requests" />
            ) : requests.error ? (
                <Failure error={requests.error} retry={() => void requests.refetch()} />
            ) : !requests.data.length ? (
                <EmptyState icon={<Inbox />} title="No message requests" description="Introductions from new people and the requests you send show up here." />
            ) : (
                <div className={styles.requestGroups}>
                    {[
                        ["Received", received, true],
                        ["Sent", sent, false],
                    ].map(([title, items, incoming]) =>
                        (items as Request[]).length ? (
                            <section key={title as string} className={styles.requestGroup}>
                                <h2 className={styles.requestGroupTitle}>
                                    {title as string}
                                    <span>{(items as Request[]).length}</span>
                                </h2>
                                <div className={styles.requestList}>{(items as Request[]).map((r) => card(r, incoming as boolean))}</div>
                            </section>
                        ) : null,
                    )}
                </div>
            )}
        </>
    );
}
export function GroupMembers({
    conversation,
    canManage,
    close,
}: {
    conversation: Conversation;
    canManage: boolean;
    close: () => void;
}) {
    const [person, setPerson] = useState("");
    const query = useChatQuery<Schema<"MemberDto">[]>(
        `${root}/conversations/${conversation.id}/members`,
    );
    const contacts = useContacts();
    const [title, setTitle] = useState(conversation.title);
    const action = useChatAction();
    return (
        <Dialog
            isOpen
            onOpenChange={(value) => {
                if (!value) close();
            }}
            title="Conversation members"
        >
            <div className={styles.form}>
                {canManage && (
                    <form
                        className={styles.form}
                        onSubmit={(e) => {
                            e.preventDefault();
                            action.mutate({
                                method: "PATCH",
                                path: `${root}/conversations/${conversation.id}`,
                                json: { title },
                            });
                        }}
                    >
                        <TextField
                            label="Conversation name"
                            value={title}
                            onChange={setTitle}
                            isRequired
                            maxLength={200}
                        />
                        <Button type="submit" loading={action.isPending}>
                            Save name
                        </Button>
                    </form>
                )}
                {query.error && (
                    <Failure
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                )}
                {(query.data ?? conversation.members).map((member) => (
                    <div className={styles.person} key={member.userId}>
                        <span>
                            {member.displayName}
                            <small
                                className={styles.hint}
                                style={{ display: "block" }}
                            >
                                {member.role} · {member.state} ·{" "}
                                {member.source === "ClientGroupSync"
                                    ? "Synced from group"
                                    : "Manual member"}
                            </small>
                        </span>
                        {canManage && member.role !== "Owner" && (
                            <div className={styles.actions}>
                                {(member.excluded
                                    ? ["unban"]
                                    : member.state === "Active"
                                      ? ["remove", "ban"]
                                      : ["add"]
                                ).map((operation) => (
                                    <Button
                                        size="sm"
                                        key={operation}
                                        isDisabled={action.isPending}
                                        onPress={() =>
                                            action.mutate({
                                                method:
                                                    operation === "remove"
                                                        ? "DELETE"
                                                        : "POST",
                                                path: `${root}/conversations/${conversation.id}/members${operation === "add" ? "" : `/${member.userId}${operation === "remove" ? "" : `/${operation}`}`}`,
                                                json:
                                                    operation === "add"
                                                        ? {
                                                              userId: member.userId,
                                                          }
                                                        : undefined,
                                            })
                                        }
                                    >
                                        {operation[0]!.toUpperCase() +
                                            operation.slice(1)}
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {canManage && (
                    <form
                        className={styles.form}
                        onSubmit={(e) => {
                            e.preventDefault();
                            action.mutate({
                                method: "POST",
                                path: `${root}/conversations/${conversation.id}/members`,
                                json: { userId: person },
                            });
                        }}
                    >
                        <Select label="Add a contact" placeholder="Choose a person" isRequired selectedKey={person || null} onSelectionChange={(key) => setPerson(String(key))}>
                            {contacts.people
                                .filter((p) => !query.data?.some((m) => m.userId === p.id && m.state === "Active"))
                                .map((p) => (
                                    <Option key={p.id} id={p.id}>
                                        {p.displayName}
                                    </Option>
                                ))}
                        </Select>
                        <Button
                            type="submit"
                            isDisabled={!person || action.isPending}
                        >
                            Add member
                        </Button>
                    </form>
                )}
                {action.error && <Failure error={action.error} />}
            </div>
        </Dialog>
    );
}
