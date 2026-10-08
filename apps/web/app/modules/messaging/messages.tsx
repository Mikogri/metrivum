import { Fragment, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useBlocker } from "react-router";
import { Button as AriaButton } from "react-aria-components";
import { ArrowLeft, Download, MessageCircle, MoreVertical, Paperclip, Plus, SendHorizontal, Users, X } from "lucide-react";
import type { Schema } from "@trainflow/api-client-web";
import {
  AlertDialog,
  Button,
  Dialog,
  DialogFooter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SearchInput,
  Segment,
  SegmentedControl,
  Spinner,
  TextArea,
} from "@trainflow/ui-web";
import { useAccountContext, useApi, useUnsavedWorkGuard } from "~/shared/session";
import { useFeatureAccess } from "~/shared/access";
import { saveBlob, type ApiRequest } from "~/shared/http";
import { privateMeta } from "~/shared/i18n/site";
import { cacheMessage, root, useChatQuery, type useRealtime } from "./api";
import { mergeMessages, messageKind, messageWasRead, type LocalOutgoing, type Conversation, type Message, type Request } from "./model";
import { useMessagingRealtime } from "./provider";
import { DraftChat } from "./draft-chat";
import { NewConversation, GroupMembers, Requests } from "./dialogs";
import { VoicePreview, VoiceRecorder } from "./voice";
import styles from "./messaging.module.css";

export const meta = () => privateMeta("Messages — TrainFlow");
// The chat fills the content area below the app bar, like the plan editor.
export const handle = { workspace: true };

export function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  return <ErrorState title="Could not load messages" description={error instanceof Error ? error.message : "Please try again."} actions={retry && <Button onPress={retry}>Retry</Button>} />;
}

export function useChatAction<T = unknown>(done?: (value: T) => void) {
  const { api, accountKey } = useAccountContext();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (request: ApiRequest) => (await api<T>(request)).data,
    onSuccess: (value) => {
      void cache.invalidateQueries({ queryKey: [accountKey, "messaging"] });
      done?.(value);
    },
  });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

function ChatAvatar({ conversation, size = "md" }: { conversation: Pick<Conversation, "type" | "title">; size?: "sm" | "md" }) {
  return (
    <span className={styles.avatar} data-size={size} aria-hidden="true">
      {conversation.type === "Direct" ? initials(conversation.title) : <Users />}
    </span>
  );
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
/** List timestamps: the time today, the weekday this week, the date before that. */
function shortStamp(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return clock(iso);
  if (now.getTime() - date.getTime() < 6 * 86_400_000) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  if (sameDay(date, now)) return "Today";
  if (sameDay(date, new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const id = params.get("conversation");
  const requestedTab = params.get("tab");
  const [search, setSearch] = useState("");
  const [create, setCreate] = useState(false);
  const draft = params.get("person") ? { userId: params.get("person")!, displayName: params.get("name") || "TrainFlow member", username: params.get("username") || "" } : null;
  const direct = useFeatureAccess("messaging.direct");
  const groups = useFeatureAccess("messaging.groups");
  const tab = direct.allowed && (requestedTab === "requests" || requestedTab === "blocked") ? requestedTab : "conversations";
  const groupManage = useFeatureAccess("messaging.group.manage").allowed;
  const allowed = direct.allowed || groups.allowed;
  const canCreate = direct.allowed || (groups.allowed && groupManage);
  const realtime = useMessagingRealtime();
  const list = useChatQuery<Conversation[]>(`${root}/conversations`, { search, limit: 100 }, allowed);
  const requests = useChatQuery<Request[]>(`${root}/requests`, undefined, direct.allowed);
  const { account } = useAccountContext();
  const unreadRequests = requests.data?.filter((r) => r.recipientUserId === account.userId && r.state === "Pending").length ?? 0;
  const select = (value: string | null) => setParams(value ? { conversation: value } : { view: "list" });
  useEffect(() => {
    const first = list.data?.[0];
    // Only an explicit return to the mobile list suppresses the default conversation.
    if (!allowed || !first || id || tab !== "conversations" || params.has("person") || params.get("view") === "list" || create) return;
    setParams({ conversation: first.id }, { replace: true });
  }, [allowed, create, id, list.data, params, tab, setParams]);

  if (direct.pending || groups.pending)
    return (
      <div className={styles.center}>
        <LoadingState label="Loading messages" />
      </div>
    );
  if (!allowed)
    return (
      <div className={styles.center}>
        <EmptyState icon={<MessageCircle />} title="Messaging is not available" description="Your account does not currently have messaging access." />
      </div>
    );

  return (
    <div className={styles.shell} data-selected={Boolean(id) || Boolean(draft) || tab !== "conversations"}>
      <section className={styles.main}>
        {draft ? <DraftChat key={draft.userId} person={draft} back={() => setParams({})} open={select} /> : tab !== "conversations" ? (
          <div className={styles.pane}>
            <header className={styles.paneHeader}>
              <IconButton className={styles.back} label="Back to conversations" icon={<ArrowLeft />} variant="ghost" size="sm" onPress={() => setParams({})} />
              <div>
                <h1>{tab === "requests" ? "Message requests" : "Blocked people"}</h1>
                <p>{tab === "requests" ? "People who want to start a conversation with you." : "They can't message you or send requests."}</p>
              </div>
            </header>
            <div className={styles.paneBody}>
              <Requests kind={tab} requests={requests} open={select} />
            </div>
          </div>
        ) : id ? (
          <Thread key={id} id={id} back={() => select(null)} realtime={realtime} />
        ) : (
          <div className={styles.center}>
            <div className={styles.welcome}>
              <span className={styles.welcomeIcon} aria-hidden="true">
                <MessageCircle />
              </span>
              <h2>Pick a conversation</h2>
              <p>Choose a chat on the right or start a new one. Messages and shared files stay together.</p>
              {canCreate ? (
                <Button variant="primary" iconStart={<Plus />} onPress={() => setCreate(true)}>
                  New conversation
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <aside className={styles.sidebar} aria-label="Conversations">
        <header className={styles.sidebarHeader}>
          <h1>Chats</h1>
          {canCreate ? <IconButton label="New conversation" icon={<Plus />} variant="ghost" size="sm" onPress={() => setCreate(true)} /> : null}
        </header>
        {direct.allowed ? (
          <SegmentedControl
            aria-label="Messages sections"
            size="sm"
            className={styles.sections}
            selectedKeys={[tab]}
            onSelectionChange={(keys) => setParams([...keys][0] === "conversations" ? {} : { tab: String([...keys][0]) })}
          >
            <Segment id="conversations">Chats</Segment>
            <Segment id="requests">Requests{unreadRequests ? ` · ${unreadRequests}` : ""}</Segment>
            <Segment id="blocked">Blocked</Segment>
          </SegmentedControl>
        ) : null}
        <div className={styles.search}>
          <SearchInput aria-label="Search conversations" placeholder="Search" size="sm" value={search} onChange={setSearch} />
        </div>
        <div className={styles.list}>
          {list.isPending ? (
            <LoadingState size="sm" label="Loading conversations" />
          ) : list.isError ? (
            <Failure error={list.error} retry={() => void list.refetch()} />
          ) : list.data.length === 0 ? (
            <div className={styles.listState}>
              <p>{search ? "No conversations match your search." : "No conversations yet."}</p>
            </div>
          ) : (
            list.data.map((c) => {
              const unread = Number(c.unreadCount);
              return (
                <button key={c.id} type="button" className={styles.conversation} aria-current={c.id === id} onClick={() => select(c.id)}>
                  <ChatAvatar conversation={c} />
                  <span className={styles.summary}>
                    <span className={styles.summaryTop}>
                      <strong>{c.title || "Conversation"}</strong>
                      {c.lastMessage ? (
                        <time dateTime={c.lastMessage.createdAt} data-unread={unread > 0 || undefined}>
                          {unread > 0 ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
                          {shortStamp(c.lastMessage.createdAt)}
                        </time>
                      ) : null}
                    </span>
                    <span className={styles.summaryBottom}>
                      <small>{c.membershipState !== "Active" ? "Previous messages only" : (c.lastMessage?.deletedAt ? "This message was deleted" : c.lastMessage?.body) || (c.lastMessage ? c.lastMessage.type : "Start the conversation")}</small>
                      {unread > 0 ? (
                        <span key={unread} className={styles.count} aria-label={`${unread} unread`}>
                          {unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {create ? (
        <NewConversation
          start={(person) => { setCreate(false); setParams({ person: person.userId, name: person.displayName, username: person.username }); }}
          close={() => setCreate(false)}
          open={(value) => {
            setCreate(false);
            select(value);
          }}
        />
      ) : null}
    </div>
  );
}

function Thread({ id, back, realtime }: { id: string; back: () => void; realtime: ReturnType<typeof useRealtime> }) {
  const { api, account, accountKey } = useAccountContext();
  const cache = useQueryClient();
  const details = useChatQuery<Conversation>(`${root}/conversations/${id}`);
  const blocked = useChatQuery<string[]>("/api/v1/me/blocked-users", undefined, useFeatureAccess("messaging.direct").allowed);
  const history = useInfiniteQuery({
    queryKey: [accountKey, "messaging", "history", id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ signal, pageParam }) => (await api<Schema<"MessagePage">>({ path: `${root}/conversations/${id}/messages`, query: { before: pageParam, limit: 50 }, signal })).data,
    getNextPageParam: (last) => (last.items.length >= 50 ? (last.olderCursor ?? undefined) : undefined),
    refetchInterval: realtime.status === "Live" ? 60000 : 15000,
  });
  const messages = mergeMessages(...(history.data?.pages.map((p) => p.items) ?? []));
  const latest = messages.at(-1);
  // Messages newer than the history first shown animate in; the initial history does not.
  const shownSince = useRef<string | null>(null);
  if (shownSince.current === null && !history.isPending) shownSince.current = latest?.createdAt ?? "";
  const [members, setMembers] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [outgoing, setOutgoing] = useState<LocalOutgoing | null>(null);
  const [report, setReport] = useState<Message | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const read = useRef("");
  useEffect(() => {
    if (outgoing) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "instant" });
  }, [outgoing]);
  const manage = useFeatureAccess("messaging.group.manage").allowed;
  const canReport = useFeatureAccess("messaging.report").allowed;
  const self = details.data?.members.find((m) => m.userId === account.userId);
  const peer = details.data?.type === "Direct" ? details.data.members.find((m) => m.userId !== account.userId) : undefined;
  const isBlocked = peer && blocked.data?.includes(peer.userId);
  const action = useChatAction();
  useEffect(() => {
    if (!latest || !nearBottom || details.data?.membershipState !== "Active") return;
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "instant" });
    let disposed = false;
    const mark = () => {
      if (document.visibilityState !== "visible" || read.current === latest.id) return;
      read.current = latest.id;
      void api({ method: "POST", path: `${root}/conversations/${id}/read`, json: { messageId: latest.id } })
        .then(() => {
          if (!disposed) void cache.invalidateQueries({ queryKey: [accountKey, "messaging", `${root}/conversations`] });
        })
        .catch(() => {
          if (!disposed) read.current = "";
        });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", mark);
    };
  }, [latest, id, api, nearBottom, details.data?.membershipState, cache, accountKey]);

  if (details.isPending)
    return (
      <div className={styles.center}>
        <LoadingState label="Loading conversation" />
      </div>
    );
  if (details.isError)
    return (
      <div className={styles.center}>
        <Failure error={details.error} retry={() => void details.refetch()} />
        <Button onPress={back}>Back to conversations</Button>
      </div>
    );
  const c = details.data;
  const pendingVisible = outgoing !== null && !messages.some(message => message.senderUserId === account.userId && message.clientMessageId && message.clientMessageId === outgoing.clientMessageId);
  const statusMessageId = pendingVisible ? null : messages.findLast(message => message.senderUserId === account.userId)?.id;
  const nameOf = (userId: string) => (userId === account.userId ? "You" : c.members.find((m) => m.userId === userId)?.displayName || "Member");
  const subtitle = c.type === "Direct" ? (peer?.username ? `@${peer.username}` : "") : `${c.members.filter((m) => m.state === "Active").length} members`;
  const typing = (realtime.typing[id] ?? []).length > 0;

  return (
    <section className={styles.thread} aria-label={c.title}>
      <header className={styles.threadHeader}>
        <IconButton className={styles.back} label="Back to conversations" icon={<ArrowLeft />} variant="ghost" size="sm" onPress={back} />
        <ChatAvatar conversation={c} />
        <div className={styles.threadTitle}>
          <strong>{peer?.displayName || c.title}</strong>
          {subtitle ? <small>{subtitle}</small> : null}
        </div>
        <span className={styles.spacer} />
        {c.type !== "Direct" ? <IconButton label="Conversation members" icon={<Users />} variant="ghost" size="sm" onPress={() => setMembers(true)} /> : null}
        {peer ? (
          <DropdownMenuTrigger>
            <AriaButton className={styles.menuButton} aria-label="Conversation options">
              <MoreVertical aria-hidden="true" />
            </AriaButton>
            <DropdownMenu placement="bottom end" onAction={() => action.mutate({ method: isBlocked ? "DELETE" : "POST", path: `/api/v1/me/blocked-users/${peer.userId}` })}>
              <DropdownMenuItem id="block" tone={isBlocked ? undefined : "danger"}>
                {isBlocked ? `Unblock ${peer.displayName}` : `Block ${peer.displayName}`}
              </DropdownMenuItem>
            </DropdownMenu>
          </DropdownMenuTrigger>
        ) : null}
      </header>
      {action.isError ? <Failure error={action.error} /> : null}
      <div
        className={styles.messages}
        ref={scroll}
        onScroll={() => {
          const el = scroll.current;
          if (el) setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
        }}
        aria-label="Message history"
      >
        <div className={styles.messagesInner}>
          {history.hasNextPage ? (
            <Button
              size="sm"
              variant="ghost"
              className={styles.older}
              loading={history.isFetchingNextPage}
              onPress={() => {
                const el = scroll.current;
                const height = el?.scrollHeight ?? 0;
                const top = el?.scrollTop ?? 0;
                setNearBottom(false);
                void history.fetchNextPage().then(() =>
                  requestAnimationFrame(() => {
                    if (el) el.scrollTop = el.scrollHeight - height + top;
                  }),
                );
              }}
            >
              Load older messages
            </Button>
          ) : null}
          {history.isPending ? (
            <LoadingState size="sm" label="Loading messages" />
          ) : history.isError ? (
            <Failure error={history.error} retry={() => void history.refetch()} />
          ) : messages.length === 0 ? (
            <div className={styles.center}>
              <div className={styles.welcome}>
                <span className={styles.welcomeIcon} aria-hidden="true">
                  <MessageCircle />
                </span>
                <h2>Start the conversation</h2>
                <p>A quick check-in can make all the difference.</p>
              </div>
            </div>
          ) : (
            messages.map((message, index) => {
              const previous = messages[index - 1];
              const mine = message.senderUserId === account.userId;
              const newDay = !previous || !sameDay(new Date(previous.createdAt), new Date(message.createdAt));
              const firstOfRun = newDay || previous!.senderUserId !== message.senderUserId;
              const name = nameOf(message.senderUserId);
              return (
                <Fragment key={message.id}>
                  {newDay ? (
                    <p className={styles.dayDivider}>
                      <span>{dayLabel(message.createdAt)}</span>
                    </p>
                  ) : null}
                  <article
                    className={styles.message}
                    data-mine={mine || undefined}
                    data-first={firstOfRun || undefined}
                    data-new={(shownSince.current !== null && message.createdAt > shownSince.current) || undefined}
                    aria-label={`${name}, ${clock(message.createdAt)}`}>
                    {!mine ? (
                      <span className={styles.messageAvatar} aria-hidden="true">
                        {firstOfRun ? (
                          <span className={styles.avatar} data-size="sm">
                            {initials(name)}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <div className={styles.messageBody}>
                      {!mine && firstOfRun && c.type !== "Direct" ? <span className={styles.sender}>{name}</span> : null}
                      <div className={styles.bubbleRow}>
                        <div className={styles.bubble}>
                          {!message.deletedAt && message.replyToMessageId ? <blockquote className={styles.reply}>{(messages.find((m) => m.id === message.replyToMessageId)?.deletedAt ? "This message was deleted" : messages.find((m) => m.id === message.replyToMessageId)?.body) || "Reply to an earlier message"}</blockquote> : null}
                          {message.deletedAt ? <em>This message was deleted</em> : message.body}
                          {!message.deletedAt && message.attachments.map((a) => (
                            <Attachment key={a.mediaId} message={message.id} attachment={a} />
                          ))}
                        </div>
                        {!message.deletedAt && (mine || (c.membershipState === "Active" && !isBlocked) || (canReport && !mine)) ? <div className={styles.messageActions}>
                          <DropdownMenuTrigger>
                            <AriaButton className={styles.menuButton} aria-label="Message options"><MoreVertical aria-hidden="true" /></AriaButton>
                            <DropdownMenu aria-label="Message actions" onAction={key => { if (key === "reply") setReply(message); if (key === "report") setReport(message); if (key === "delete") action.mutate({ method: "DELETE", path: `${root}/messages/${message.id}` }); }}>
                              {c.membershipState === "Active" && !isBlocked ? <DropdownMenuItem id="reply">Reply</DropdownMenuItem> : null}
                              {canReport && !mine ? <DropdownMenuItem id="report" tone="danger">Report</DropdownMenuItem> : null}
                              {mine ? <DropdownMenuItem id="delete" tone="danger">Delete message</DropdownMenuItem> : null}
                            </DropdownMenu>
                          </DropdownMenuTrigger>
                        </div> : null}
                      </div>
                      {mine && message.id === statusMessageId ? <span className={styles.meta}>{messageWasRead(message, messages, peer?.lastReadMessageId) ? "Read" : "Sent"}</span> : null}
                    </div>
                  </article>
                </Fragment>
              );
            })
          )}
          {pendingVisible && outgoing ? <article className={styles.message} data-mine="true" data-new data-pending aria-label="Outgoing message"><div className={styles.messageBody}><div className={styles.bubble}>{outgoing.body}</div><span className={styles.meta} role="status">{outgoing.status}</span></div></article> : null}
        </div>
      </div>
      <div className={styles.typing} role="status">
        {typing ? (
          <span className={styles.typingDots}>
            <span aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Typing…
          </span>
        ) : null}
      </div>
      {c.membershipState !== "Active" || isBlocked ? (
        <p className={styles.closed}>{isBlocked ? "You blocked this person. Previous messages stay available." : "You no longer take part in this conversation. Your earlier history is available."}</p>
      ) : history.isSuccess ? (
        <Composer
          key={id}
          id={id}
          reply={reply}
          replyName={reply ? nameOf(reply.senderUserId) : ""}
          clearReply={() => setReply(null)}
          onSending={setOutgoing}
          onSent={() => setNearBottom(true)}
          typing={realtime.sendTyping}
        />
      ) : null}
      {members ? <GroupMembers conversation={c} canManage={manage && (self?.role === "Owner" || self?.role === "Admin")} close={() => setMembers(false)} /> : null}
      {report ? <ReportDialog message={report} close={() => setReport(null)} /> : null}
    </section>
  );
}

function Attachment({ message, attachment }: { message: string; attachment: Schema<"AttachmentDto"> }) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const resources = useRef<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const urls = resources.current;
    return () => {
      alive.current = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);
  const preview = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm)|audio\/wav)$/.test(attachment.contentType);
  const load = useMutation({
    mutationFn: async () => (await api<Blob>({ path: `${root}/messages/${message}/attachments/${attachment.mediaId}`, responseType: "blob" })).data,
    onSuccess: (blob) => {
      if (!alive.current) return;
      if (preview) {
        const objectUrl = URL.createObjectURL(blob);
        resources.current.push(objectUrl);
        setUrl(objectUrl);
      } else saveBlob(blob, `attachment.${attachment.contentType === "application/pdf" ? "pdf" : attachment.contentType === "text/plain" ? "txt" : "zip"}`);
    },
  });
  const voice = attachment.contentType.startsWith("audio/");
  const fetchVoice = load.mutate;
  useEffect(() => { if (voice) fetchVoice(); }, [voice, fetchVoice]);
  const label = attachment.contentType.startsWith("image/")
    ? "View image"
    : attachment.contentType.startsWith("video/")
      ? "Play video"
      : attachment.contentType.startsWith("audio/")
        ? "Play voice message"
        : "Download file";
  return (
    <div className={styles.attachment}>
      {url ? (
        attachment.contentType.startsWith("image/") ? (
          <img src={url} alt="Shared attachment" />
        ) : attachment.contentType.startsWith("video/") ? (
          <video src={url} controls />
        ) : (
          <audio src={url} controls preload="metadata" aria-label="Voice message" />
        )
      ) : (
        <Button size="sm" iconStart={voice ? undefined : <Download size={13} />} loading={load.isPending} onPress={() => load.mutate()}>
          {label} · {Math.max(1, Math.round(Number(attachment.size) / 1024))} KB
          {attachment.durationMs ? ` · ${Math.ceil(Number(attachment.durationMs) / 1000)}s` : ""}
        </Button>
      )}
      {load.error ? <p className={styles.error}>Could not download. Try again.</p> : null}
    </div>
  );
}

function Composer({
  id,
  reply,
  replyName,
  clearReply,
  onSent,
  onSending,
  typing,
}: {
  id: string;
  reply: Message | null;
  replyName: string;
  clearReply: () => void;
  onSent: () => void;
  onSending: (message: LocalOutgoing | null) => void;
  typing: (id: string, value: boolean) => void;
}) {
  const { api, accountKey } = useAccountContext();
  const cache = useQueryClient();
  const attachments = useFeatureAccess("messaging.attachments").allowed;
  const voice = useFeatureAccess("messaging.voice").allowed;
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const voiceFile = files.length === 1 && files[0]?.type === "audio/wav" ? files[0] : null;
  const input = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const controller = useRef(new AbortController());
  const tickets = useRef(new Map<File, Schema<"UploadTicket">>());
  const ready = useRef(new Map<File, string>());
  const retry = useRef({ payload: "", key: "" });
  useEffect(() => {
    if (controller.current.signal.aborted) controller.current = new AbortController();
    const current = controller.current;
    return () => current.abort();
  }, []);
  useEffect(() => {
    if (reply) text.current?.focus();
  }, [reply]);
  // The field grows with the text up to a few lines.
  useEffect(() => {
    const el = text.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);
  const dirty = Boolean(body.trim() || files.length || busy || recording);
  useUnsavedWorkGuard(() => dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  function addFiles(next: File[]) {
    try {
      messageKind(next);
      if (!voice && next.some((f) => f.type.startsWith("audio/"))) throw new Error("Voice messages are not available for this account.");
      setFiles(next);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function send() {
    if (busy || recording || (!body.trim() && !files.length)) return;
    setBusy(true);
    const preview = body.trim() || files.map(file => file.name).join(", ");
    onSending({ body: preview, status: "Sending…" });
    setBody("");
    setError("");
    const signal = controller.current.signal;
    try {
      const type = messageKind(files);
      const mediaIds: string[] = [];
      for (const file of files) {
        if (!ready.current.has(file)) {
          let ticket = tickets.current.get(file);
          if (!ticket) {
            ticket = (await api<Schema<"UploadTicket">>({ method: "POST", path: `${root}/uploads/`, json: { name: file.name, contentType: file.type, size: file.size }, signal })).data;
            tickets.current.set(file, ticket);
          }
          // Keep tickets and successful media IDs across retries; send uses the same message key.
          const upload = await fetch(ticket.uploadUrl, { method: ticket.method, headers: { "Content-Type": file.type }, body: file, signal, credentials: "omit" });
          if (!upload.ok && upload.status !== 409 && upload.status !== 400) throw new Error("The upload failed. Retry to continue.");
          const finalized = (await api<Schema<"MediaDto">>({ method: "POST", path: `${root}/uploads/${ticket.file.id}/finalize`, signal })).data;
          ready.current.set(file, finalized.id);
        }
        mediaIds.push(ready.current.get(file)!);
      }
      const payload = { type, body: body.trim() || null, replyToMessageId: reply?.id ?? null, mediaIds };
      const serialized = JSON.stringify(payload);
      if (retry.current.payload !== serialized) retry.current = { payload: serialized, key: crypto.randomUUID() };
      onSending({ body: preview, status: "Sending…", clientMessageId: retry.current.key });
      const sent = (await api<Message>({ method: "POST", path: `${root}/conversations/${id}/messages`, json: payload, idempotencyKey: retry.current.key, signal })).data;
      if (signal.aborted) return;
      await cache.cancelQueries({ queryKey: [accountKey, "messaging", "history", id] });
      if (signal.aborted) return;
      cacheMessage(cache, accountKey, sent);
      onSending(null);
      setBody("");
      setFiles([]);
      clearReply();
      retry.current = { payload: "", key: "" };
      typing(id, false);
      onSent();
      void cache.invalidateQueries({ queryKey: [accountKey, "messaging", `${root}/conversations`] });
    } catch (e) {
      if (!signal.aborted) {
        setBody(body);
        onSending({ body: preview, status: "Not sent — retry below", clientMessageId: retry.current.key });
        setError(e instanceof Error ? e.message : "Could not send. Your draft is still here.");
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <AlertDialog
        isOpen={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title="Discard this draft?"
        tone="danger"
        confirmLabel="Discard draft"
        cancelLabel="Keep writing"
        onConfirm={() => {
          if (blocker.state === "blocked") blocker.proceed();
        }}
      >
        Your message has not been sent yet. If you leave now, the draft is deleted and the person never sees it.
      </AlertDialog>
      <div className={styles.composerBox}>
        {reply ? (
          <div className={styles.replying}>
            <span>
              Replying to <strong>{replyName}</strong>
              <small>{reply.body || reply.type}</small>
            </span>
            <IconButton label="Cancel reply" icon={<X />} variant="ghost" size="sm" onPress={clearReply} />
          </div>
        ) : null}
        {voiceFile ? <VoicePreview file={voiceFile} disabled={busy} cancel={() => setFiles([])} /> : files.length ? (
          <ul className={styles.files}>
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <Paperclip aria-hidden="true" />
                <span>{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => setFiles(files.filter((x) => x !== f))}>
                  <X aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={styles.composerRow}>
          {attachments ? (
            <>
              <input
                ref={input}
                type="file"
                hidden
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,application/zip,video/mp4,video/webm,audio/wav"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <IconButton label="Attach files" icon={<Plus />} variant="ghost" size="sm" isDisabled={busy || recording || Boolean(voiceFile)} onPress={() => input.current?.click()} />
              {voice ? <VoiceRecorder disabled={busy || Boolean(voiceFile)} onBusyChange={setRecording} onFile={(file) => addFiles([file])} /> : null}
            </>
          ) : null}
          <textarea
            ref={text}
            rows={1}
            aria-label="Message"
            placeholder="Send message…"
            value={body}
            maxLength={8000}
            disabled={busy || recording || Boolean(voiceFile)}
            onChange={(e) => {
              setBody(e.target.value);
              onSending(null);
              typing(id, Boolean(e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button type="submit" className={styles.send} aria-label="Send" disabled={busy || recording || (!body.trim() && files.length === 0)}>
            {busy ? <Spinner size="sm" label="Sending" /> : <SendHorizontal aria-hidden="true" />}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : (
        <p className={styles.keyboardHint}>Enter to send · Shift + Enter for a new line</p>
      )}
    </form>
  );
}

function ReportDialog({ message, close }: { message: Message; close: () => void }) {
  const [details, setDetails] = useState("");
  const action = useChatAction(close);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Report message"
      description="The report includes a copy of this message for review."
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate({ method: "POST", path: `${root}/messages/${message.id}/report`, json: { category: "UserReport", details } });
        }}
      >
        <TextArea label="Reason for reporting" placeholder="What is wrong with this message?" value={details} onChange={setDetails} isRequired maxLength={2000} />
        {action.error ? <Failure error={action.error} /> : null}
        <DialogFooter>
          <Button onPress={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={action.isPending} isDisabled={!details.trim()}>
            Send report
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
