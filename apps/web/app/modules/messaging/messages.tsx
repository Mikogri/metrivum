import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useBlocker } from "react-router";
import { Button as AriaButton, Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";
import { ArrowLeft, Download, FileText, Film, MessageCircle, MoreVertical, Paperclip, Plus, SendHorizontal, Users, X } from "lucide-react";
import type { Schema } from "@trainflow/api-client-web";
import {
  AlertDialog,
  toast,
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
  useMobileLayout,
} from "@trainflow/ui-web";
import { useAccountContext, useApi, useUnsavedWorkGuard } from "~/shared/session";
import { useFeatureAccess } from "~/shared/access";
import { saveBlob, type ApiRequest } from "~/shared/http";
import { privateMeta } from "~/shared/i18n/site";
import { cacheMessage, root, useChatQuery, type useRealtime } from "./api";
import { mergeMessages, messageKind, messageWasRead, type LocalOutgoing, type Conversation, type Message } from "./model";
import { useMessagingRealtime } from "./provider";
import { DraftChat } from "./draft-chat";
import { NewConversation, GroupMembers, BlockedPeople } from "./dialogs";
import { CoachingActions, CoachingCard, coachingCard, MessageText } from "./coaching-actions";
import { VoicePlayer, VoicePreview, VoiceRecorder } from "./voice";
import { optimisticRead } from "./read-cache";
import styles from "./messaging.module.css";

export const meta = () => privateMeta("Messages — Metrivum");
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
  const { accountKey } = useAccountContext();
  const mobile = useMobileLayout();
  const [params, setParams] = useSearchParams();
  const id = params.get("conversation");
  const requestedTab = params.get("tab");
  const [filter, setFilter] = useState({ accountKey, search: "", page: 1 });
  if (filter.accountKey !== accountKey) setFilter({ accountKey, search: "", page: 1 });
  const search = filter.accountKey === accountKey ? filter.search : "";
  const settledSearch = useDebounced(search);
  const page = filter.accountKey === accountKey && search === settledSearch ? filter.page : 1;
  const [create, setCreate] = useState(false);
  const draft = params.get("person") ? { userId: params.get("person")!, displayName: params.get("name") || "Metrivum member", username: params.get("username") || "" } : null;
  const direct = useFeatureAccess("messaging.direct");
  const groups = useFeatureAccess("messaging.groups");
  const tab = direct.allowed && requestedTab === "blocked" ? requestedTab : "conversations";
  const groupManage = useFeatureAccess("messaging.group.manage").allowed;
  const allowed = direct.allowed || groups.allowed;
  const canCreate = direct.allowed || (groups.allowed && groupManage);
  const realtime = useMessagingRealtime();
  const list = useChatQuery<Conversation[]>(`${root}/conversations`, { search: settledSearch, page, limit: 25 }, allowed && tab === "conversations" && search === settledSearch);
  const select = (value: string | null) => setParams(value ? { conversation: value } : { view: "list" });
  useEffect(() => {
    const first = list.data?.[0];
    // Phone history must return to the inbox without immediately reopening a thread.
    if (mobile || !allowed || !first || id || page !== 1 || search || tab !== "conversations" || params.has("person") || params.get("view") === "list" || create) return;
    setParams({ conversation: first.id }, { replace: true });
  }, [mobile, allowed, create, id, list.data, page, search, params, tab, setParams]);

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
                <h1>Blocked people</h1>
                <p>They can't message you or send requests.</p>
              </div>
            </header>
            <div className={styles.paneBody}>
              <BlockedPeople />
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
            onSelectionChange={(keys) => {
              const value = String([...keys][0]);
              if (value === "conversations") setFilter({ accountKey, search: "", page: 1 });
              setParams(value === "conversations" ? {} : { tab: value }, { replace: true });
            }}
          >
            <Segment id="conversations">Chats</Segment>
            <Segment id="blocked">Blocked</Segment>
          </SegmentedControl>
        ) : null}
        {tab === "conversations" ? <><div className={styles.search}>
          <SearchInput aria-label="Search conversations" placeholder="Search" size="sm" value={search} onChange={(value) => setFilter({ accountKey, search: value, page: 1 })} />
        </div>
        <div className={styles.list}>
          {list.isPending ? (
            <LoadingState size="sm" label="Loading conversations" />
          ) : list.isError ? (
            <Failure error={list.error} retry={() => void list.refetch()} />
          ) : list.data.length === 0 ? (
            <div className={styles.listState}>
              <p>{page > 1 ? "No more conversations." : search ? "No conversations match your search." : "No conversations yet."}</p>
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
        <nav className={styles.pagination} aria-label="Conversation pages">
          <Button size="sm" variant="ghost" isDisabled={page === 1 || list.isFetching || search !== settledSearch} onPress={() => setFilter({ accountKey, search, page: page - 1 })}>Previous</Button>
          <span aria-live="polite">Page {page}</span>
          <Button size="sm" variant="ghost" isDisabled={list.isFetching || list.isError || search !== settledSearch || (list.data?.length ?? 0) < 25 || page >= 1000000} onPress={() => setFilter({ accountKey, search, page: page + 1 })}>Next</Button>
        </nav></> : null}
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
  const { api, account, accountKey, lifecycle } = useAccountContext();
  const showError = useErrorToast();
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
  const latestId = latest?.id;
  // Messages newer than the history first shown animate in; the initial history does not.
  const shownSince = useRef<string | null>(null);
  if (shownSince.current === null && !history.isPending) shownSince.current = latest?.createdAt ?? "";
  const [members, setMembers] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [outgoing, setOutgoing] = useState<LocalOutgoing | null>(null);
  const [report, setReport] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState<Message | null>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const read = useRef("");
  const pendingReads = useRef(0);
  useEffect(() => {
    if (outgoing) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "instant" });
  }, [outgoing]);
  const manage = useFeatureAccess("messaging.group.manage").allowed;
  const canReport = useFeatureAccess("messaging.report").allowed;
  const self = details.data?.members.find((m) => m.userId === account.userId);
  const peer = details.data?.type === "Direct" ? details.data.members.find((m) => m.userId !== account.userId) : undefined;
  const isBlocked = peer && blocked.data?.includes(peer.userId);
  const action = useChatAction();
  const followBottom = useRef(true);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    const bottom = () => { if (followBottom.current) el.scrollTop = el.scrollHeight; };
    bottom();
    const observer = new ResizeObserver(bottom);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("load", bottom, true);
    return () => { observer.disconnect(); el.removeEventListener("load", bottom, true); };
  }, [details.isSuccess, history.isSuccess, latest?.id]);
  useEffect(() => {
    if (!latestId || !nearBottom || details.data?.membershipState !== "Active") return;
    const messageId = latestId;
    const mark = () => {
      if (document.visibilityState !== "visible" || read.current === messageId || !lifecycle.isCurrent()) return;
      read.current = messageId;
      // Cancel older summary responses before applying the local read marker.
      void cache.cancelQueries({ queryKey: [accountKey, "messaging", `${root}/conversations`] });
      void cache.cancelQueries({ queryKey: [accountKey, "messaging", `${root}/conversations/${id}`] });
      pendingReads.current++;
      const rollback = optimisticRead(cache, accountKey, id, account.userId, messageId);
      void api({ method: "POST", path: `${root}/conversations/${id}/read`, json: { messageId }, signal: lifecycle.signal() })
        .then(() => {
          rollback.commit();
          if (lifecycle.isCurrent()) void cache.invalidateQueries({ queryKey: [accountKey, "notifications"] });
        })
        .catch(() => {
          rollback();
          if (!lifecycle.isCurrent()) return;
          if (read.current === messageId) read.current = "";
        }).finally(() => {
          pendingReads.current--;
          if (!lifecycle.isCurrent() || pendingReads.current) return;
          void cache.invalidateQueries({ queryKey: [accountKey, "messaging", `${root}/conversations`] });
          void cache.invalidateQueries({ queryKey: [accountKey, "messaging", `${root}/conversations/${id}`] });
        });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => { document.removeEventListener("visibilitychange", mark); };
  }, [latestId, id, api, nearBottom, details.data?.membershipState, cache, accountKey, account.userId, lifecycle]);

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
  const canSend = c.canSendMessages !== false && c.membershipState === "Active" && !isBlocked;
  const pendingRequest = c.request?.state === "Pending" ? c.request : null;

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
          if (el) {
            followBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
            setNearBottom(followBottom.current);
          }
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
                followBottom.current = false;
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
              const images = message.attachments.filter(a => a.contentType.startsWith("image/"));
              const hasImages = !message.deletedAt && images.length > 0;
              const card = !message.deletedAt && !message.replyToMessageId && !message.attachments.length ? coachingCard(message.body, message.coachingEntry) : null;
              const messageMenu = !message.deletedAt && (mine || (canSend) || (canReport && !mine)) ? <div className={styles.messageActions}>
                          <DropdownMenuTrigger>
                            <AriaButton className={styles.menuButton} aria-label="Message options"><MoreVertical aria-hidden="true" /></AriaButton>
                            <DropdownMenu aria-label="Message actions" onAction={key => { if (key === "reply") setReply(message); if (key === "report") setReport(message); if (key === "delete") setDeleting(message); }}>
                              {canSend ? <DropdownMenuItem id="reply">Reply</DropdownMenuItem> : null}
                              {canReport && !mine ? <DropdownMenuItem id="report" tone="danger">Report</DropdownMenuItem> : null}
                              {mine ? <DropdownMenuItem id="delete" tone="danger">Delete message</DropdownMenuItem> : null}
                            </DropdownMenu>
                          </DropdownMenuTrigger>
                        </div> : null;
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
                        <div className={styles.messageContent}>
                        {card ? <CoachingCard card={card} mine={mine} /> : message.deletedAt || message.body || message.replyToMessageId || message.attachments.some(a => !a.contentType.startsWith("image/")) ? <div className={styles.bubble}>
                          {!message.deletedAt && message.replyToMessageId ? <blockquote className={styles.reply}>{(messages.find((m) => m.id === message.replyToMessageId)?.deletedAt ? "This message was deleted" : messages.find((m) => m.id === message.replyToMessageId)?.body) || "Reply to an earlier message"}</blockquote> : null}
                          {message.deletedAt ? <em className={styles.deletedMessage}>This message was deleted</em> : <MessageText body={message.body ?? ""} />}
                          {!message.deletedAt && message.attachments.filter(a => !a.contentType.startsWith("image/")).map((a) => (
                            <Attachment key={a.mediaId} message={message.id} attachment={a} mine={mine} />
                          ))}
                        </div> : null}
                        {hasImages && images.map((a, imageIndex) => <div key={a.mediaId} className={styles.imageRow}><Attachment message={message.id} attachment={a} mine={mine} />{imageIndex === images.length - 1 ? messageMenu : null}</div>)}
                        </div>
                        {!hasImages && messageMenu}
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
      {pendingRequest ? <div className={styles.closed} role="status">
        <p>{pendingRequest.recipientUserId === account.userId ? "Accept this conversation to reply." : "Message sent. Waiting for this person to accept."}</p>
        {pendingRequest.recipientUserId === account.userId ? <div className={styles.actions}>
          <Button size="sm" loading={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${pendingRequest.id}/accept` })}>Accept</Button>
          <Button size="sm" isDisabled={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${pendingRequest.id}/decline` })}>Decline</Button>
        </div> : null}
      </div> : null}
      {c.membershipState !== "Active" || isBlocked ? (
        <p className={styles.closed}>{isBlocked ? "You blocked this person. Previous messages stay available." : "You no longer take part in this conversation. Your earlier history is available."}</p>
      ) : history.isSuccess ? (
        <Composer
          key={id}
          id={id}
          recipient={peer?.username ?? undefined}
          recipientId={peer?.userId}
          disabled={!canSend}
          uploadsDisabled={c.canUploadAttachments === false}
          reply={reply}
          replyName={reply ? nameOf(reply.senderUserId) : ""}
          clearReply={() => setReply(null)}
          onSending={setOutgoing}
          onSent={() => {
            // A first-contact introduction consumes the one permitted send immediately.
            if (c.canUploadAttachments === false) cache.setQueryData([accountKey, "messaging", `${root}/conversations/${id}`, undefined], { ...c, canSendMessages: false });
            void details.refetch();
            followBottom.current = true; setNearBottom(true); scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "instant" });
          }}
          typing={realtime.sendTyping}
        />
      ) : null}
      <AlertDialog isOpen={Boolean(deleting)} isConfirming={action.isPending} onOpenChange={open => { if (!open && !action.isPending) setDeleting(null); }} title="Delete this message?" tone="danger" confirmLabel="Delete message" cancelLabel="Keep message" onConfirm={() => {
        if (deleting) action.mutate({ method: "DELETE", path: `${root}/messages/${deleting.id}` }, {
          onSuccess: () => { if (lifecycle.isCurrent()) { setDeleting(null); toast({ tone: "success", title: "Message deleted" }); } },
          onError: error => { if (lifecycle.isCurrent()) showError(error, "Could not delete the message. Please retry."); },
        });
      }}>This message will be deleted for everyone in the conversation.</AlertDialog>
      {members ? <GroupMembers conversation={c} canManage={manage && (self?.role === "Owner" || self?.role === "Admin")} close={() => setMembers(false)} /> : null}
      {report ? <ReportDialog message={report} close={() => setReport(null)} /> : null}
    </section>
  );
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
};

function Attachment({ message, attachment, mine }: { message: string; attachment: Schema<"AttachmentDto">; mine: boolean }) {
  const api = useApi();
  const [file, setFile] = useState<{ url: string; blob: Blob } | null>(null);
  const [zoom, setZoom] = useState(false);
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
  const type = attachment.contentType;
  const image = /^image\/(png|jpeg|gif|webp)$/.test(type);
  const voice = type.startsWith("audio/");
  const video = /^video\/(mp4|webm)$/.test(type);
  const name = `attachment.${EXTENSION[type] ?? "bin"}`;
  const load = useMutation({
    mutationFn: async () => (await api<Blob>({ path: `${root}/messages/${message}/attachments/${attachment.mediaId}`, responseType: "blob" })).data,
    onSuccess: (blob) => {
      if (!alive.current) return;
      if (image || voice || video) {
        const objectUrl = URL.createObjectURL(blob);
        resources.current.push(objectUrl);
        setFile({ url: objectUrl, blob });
      } else saveBlob(blob, name);
    },
  });
  // Images and voice messages show in the conversation right away; other files wait for a click.
  const fetchNow = load.mutate;
  useEffect(() => {
    if (image || voice) fetchNow();
  }, [image, voice, fetchNow]);
  const size = `${Math.max(1, Math.round(Number(attachment.size) / 1024))} KB`;

  if (voice) {
    return (
      <div className={styles.attachment}>
        <VoicePlayer src={file?.url ?? null} label="Voice message" seed={attachment.mediaId} durationMs={attachment.durationMs ? Number(attachment.durationMs) : null} tone={mine ? "mine" : "default"} />
        {load.error ? <p className={styles.error}>Could not load the voice message.</p> : null}
      </div>
    );
  }

  if (image) {
    return (
      <div className={styles.attachment}>
        {file ? (
          <button type="button" className={styles.thumb} aria-label="Open image" onClick={() => setZoom(true)}>
            <img src={file.url} alt="Shared image" />
          </button>
        ) : (
          <span className={styles.thumbLoading} aria-busy={load.isPending || undefined}>
            {load.error ? "Could not load the image." : <Spinner size="sm" label="Loading image" />}
          </span>
        )}
        {file && zoom ? (
          <ModalOverlay isOpen isDismissable onOpenChange={setZoom} className={styles.lightboxOverlay}>
            <Modal className={styles.lightbox}>
              <AriaDialog aria-label="Image preview" className={styles.lightboxDialog}>
                <div className={styles.lightboxBar}>
                  <span>{size}</span>
                  <Button size="sm" iconStart={<Download />} onPress={() => saveBlob(file.blob, name)}>
                    Download
                  </Button>
                  <IconButton label="Close preview" icon={<X />} variant="ghost" size="sm" onPress={() => setZoom(false)} />
                </div>
                <img src={file.url} alt="Shared image, enlarged" className={styles.lightboxImage} />
              </AriaDialog>
            </Modal>
          </ModalOverlay>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.attachment}>
      {file && video ? (
        <video src={file.url} controls />
      ) : (
        <button type="button" className={styles.fileChip} disabled={load.isPending} onClick={() => load.mutate()}>
          <span className={styles.fileIcon} aria-hidden="true">
            {video ? <Film /> : <FileText />}
          </span>
          <span className={styles.fileText}>
            <span>{video ? "Play video" : "Download file"}</span>
            <small>
              {(EXTENSION[type] ?? "file").toUpperCase()} · {size}
            </small>
          </span>
          {load.isPending ? <Spinner size="sm" label="Loading" /> : <Download aria-hidden="true" />}
        </button>
      )}
      {load.error ? <p className={styles.error}>Could not download. Try again.</p> : null}
    </div>
  );
}

function Composer({
  recipient,
  recipientId,
  disabled = false,
  uploadsDisabled = false,
  id,
  reply,
  replyName,
  clearReply,
  onSent,
  onSending,
  typing,
}: {
  id: string;
  recipient?: string;
  recipientId?: string;
  disabled?: boolean;
  uploadsDisabled?: boolean;
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
  // The recorder unmounts as soon as its file is ready, before it can report that it stopped.
  useEffect(() => {
    if (voiceFile) setRecording(false);
  }, [voiceFile]);
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
    if (disabled || busy || recording || (!body.trim() && !files.length)) return;
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
            ticket = (await api<Schema<"UploadTicket">>({ method: "POST", path: `${root}/uploads/`, query: { conversationId: id }, json: { name: file.name, contentType: file.type, size: file.size }, signal })).data;
            tickets.current.set(file, ticket);
          }
          // Keep tickets and successful media IDs across retries; send uses the same message key.
          const upload = await fetch(ticket.uploadUrl, { method: ticket.method, headers: { "Content-Type": file.type }, body: file, signal, credentials: "omit" });
          if (!upload.ok && upload.status !== 409 && upload.status !== 400) throw new Error("The upload failed. Retry to continue.");
          const finalized = (await api<Schema<"MediaDto">>({ method: "POST", path: `${root}/uploads/${ticket.file.id}/finalize`, query: { conversationId: id }, signal })).data;
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
        {!voiceFile && files.length ? (
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
          {voiceFile ? (
            <VoicePreview file={voiceFile} disabled={busy} cancel={() => setFiles([])} />
          ) : (
            <>
              {recipient && !recording ? <CoachingActions conversationId={id} username={recipient} recipientId={recipientId!} disabled={disabled || busy} onSent={onSent} /> : null}
              {attachments && !recording ? (
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
                  <IconButton label="Attach files" icon={<Plus />} variant="ghost" size="sm" isDisabled={disabled || uploadsDisabled || busy} onPress={() => input.current?.click()} />
                </>
              ) : null}
              {/* While recording, the recorder takes the place of the text field. */}
              {attachments && voice ? <VoiceRecorder disabled={disabled || uploadsDisabled || busy} onBusyChange={setRecording} onFile={(file) => addFiles([file])} /> : null}
              {!recording ? (
                <textarea
                  ref={text}
                  rows={1}
                  aria-label="Message"
                  placeholder="Send message…"
                  value={body}
                  maxLength={8000}
                  disabled={disabled || busy}
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
              ) : null}
            </>
          )}
          <button type="submit" className={styles.send} aria-label="Send" disabled={disabled || busy || recording || (!body.trim() && files.length === 0)}>
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
