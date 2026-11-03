import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import { Button, Checkbox, Dialog, DialogFooter, EmptyState, LoadingState, Option, Select, Spinner, TextField } from "@metrivum/ui-web";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useApi } from "~/shared/session";
import { root, useChatQuery } from "./api";
import { Failure, useChatAction } from "./messages";
import type { Conversation, Request } from "./model";
import styles from "./messaging.module.css";
import { UserAutocomplete } from "~/modules/accounts";
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
  const uiCopy = useUiCopy();

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
    const [opening, setOpening] = useState(false);
    const [openError, setOpenError] = useState<unknown>(null);
    async function choose(target: ChatPerson) {
        const userId = target.userId;
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
            title={uiCopy["ui"]["New conversation"]}
            description={uiCopy["ui"]["Connect with a client, coach or your training group."]}
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
                    label={uiCopy["ui"]["Conversation type"]}
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
                    <UserAutocomplete label={uiCopy["ui"]["Find a person"]} value={search} onChange={setSearch} searchPath={`${root}/people`} onSelect={person => void choose(person)} isDisabled={opening}
                      description={opening ? uiCopy["ui"]["Opening the conversation…"] : uiCopy["ui"]["Choose someone to open your chat with them."]} />
                    {openError ? <Failure error={openError} /> : null}
                </>}
                {kind === "group" && <>
                    <TextField label={uiCopy["ui"]["Group name"]} placeholder={uiCopy["ui"]["e.g. Marathon crew"]} value={title} onChange={setTitle} isRequired maxLength={200} />
                    {contacts.loading ? <Spinner label={uiCopy["ui"]["Loading contacts"]} /> : contacts.error ? <Failure error={contacts.error} retry={() => void contacts.refetch()} /> :
                        <div className={styles.people}>{contacts.people.map(p => <Checkbox key={p.id} isSelected={selected.includes(p.id)} onChange={on => setSelected(on ? [...selected, p.id] : selected.filter(id => id !== p.id))}>{p.displayName || p.username}</Checkbox>)}</div>}
                </>}
                {kind === "linked" && (
                    <>
                        {groups.error ? (
                            <Failure error={groups.error} retry={() => void groups.refetch()} />
                        ) : (
                            <Select label={uiCopy["ui"]["Client group"]} placeholder={uiCopy["ui"]["Choose a group"]} isRequired selectedKey={group || null} onSelectionChange={(key) => setGroup(String(key))}>
                                {(groups.data?.items ?? [])
                                    .filter((g) => !g.archived)
                                    .map((g) => (
                                        <Option key={g.id} id={g.id}>
                                            {g.name}
                                        </Option>
                                    ))}
                            </Select>
                        )}
                        <p className={styles.hint}>{uiCopy["ui"]["Members follow this client group's active relationships. Manual additions and exclusions are kept."]}</p>
                    </>
                )}
                {action.error && <Failure error={action.error} />}
                <DialogFooter>
                    <Button onPress={close} isDisabled={action.isPending}>

                        {uiCopy["common"]["cancel"]}
                    </Button>
                    {kind !== "direct" && <Button
                        type="submit"
                        variant="primary"
                        loading={action.isPending}
                        isDisabled={(kind === "linked" && !group) || (kind === "group" && !title.trim())}
                    >

                        {uiCopy["ui"]["Open conversation"]}
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
/** Blocking remains separate from conversations; pending approval stays inside its chat. */
export function BlockedPeople() {
 const uiCopy = useUiCopy();

    const blocked = useChatQuery<string[]>("/api/v1/me/blocked-users");
    const contacts = useContacts();
    const action = useChatAction();
    const name = (id: string) => contacts.people.find((p) => p.id === id)?.displayName || "Metrivum member";
    return (
            <>
                {action.error && <Failure error={action.error} />}
                {blocked.isPending ? (
                    <LoadingState label={uiCopy["ui"]["Loading blocked people"]} />
                ) : blocked.error ? (
                    <Failure error={blocked.error} retry={() => void blocked.refetch()} />
                ) : !blocked.data.length ? (
                    <EmptyState icon={<ShieldCheck />} title={uiCopy["ui"]["Nobody is blocked"]} description={uiCopy["ui"]["People you block can't send you direct messages or contact requests."]} />
                ) : (
                    <ul className={styles.blockedList}>
                        {blocked.data.map((id) => (
                            <li key={id} className={styles.blockedRow}>
                                <span className={styles.avatar} data-size="sm" aria-hidden="true">
                                    {initialsOf(name(id))}
                                </span>
                                <span className={styles.blockedName}>{name(id)}</span>
                                <Button size="sm" isDisabled={action.isPending} onPress={() => action.mutate({ method: "DELETE", path: `/api/v1/me/blocked-users/${id}` })}>

                                    {uiCopy["ui"]["Unblock"]}
                                </Button>
                            </li>
                        ))}
                    </ul>
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
  const uiCopy = useUiCopy();

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
            title={uiCopy["ui"]["Conversation members"]}
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
                            label={uiCopy["ui"]["Conversation name"]}
                            placeholder={uiCopy["ui"]["e.g. Marathon group"]}
                            value={title}
                            onChange={setTitle}
                            isRequired
                            maxLength={200}
                        />
                        <Button type="submit" loading={action.isPending}>

                            {uiCopy["ui"]["Save name"]}
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
                                    ? uiCopy["ui"]["Synced from group"]
                                    : uiCopy["ui"]["Manual member"]}
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
                        <Select label={uiCopy["ui"]["Add a contact"]} placeholder={uiCopy["ui"]["Choose a person"]} isRequired selectedKey={person || null} onSelectionChange={(key) => setPerson(String(key))}>
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

                            {uiCopy["ui"]["Add member"]}
                        </Button>
                    </form>
                )}
                {action.error && <Failure error={action.error} />}
            </div>
        </Dialog>
    );
}
