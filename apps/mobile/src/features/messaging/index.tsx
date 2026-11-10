import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
  type ViewToken,
} from "react-native";
import Animated from "react-native-reanimated";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useIsFocused, usePreventRemove } from "expo-router/react-navigation";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";
import type { Schema } from "@metrivum/api-client-web";
import {
  ActionSheet,
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  IconButton,
  ListItem,
  LoadingState,
  Screen,
  SearchField,
  Section,
  Text,
  chooseAction,
  confirm,
  transitions,
  useTheme,
} from "@metrivum/ui-mobile";
import { useMobile } from "../../infrastructure/session/MobileSession";
import {
  useApiMutation,
  useApiQuery,
} from "../../infrastructure/networking/queries";
import {
  pickAndUpload,
  uploadFile,
} from "../../infrastructure/networking/uploads";
import {
  mergeMessages,
  wasRead,
  optimisticRead,
  rollbackRead,
  type ComposerDraft,
} from "./model";
import { Attachment } from "./Attachment";
import { VoiceRecorder } from "./VoiceRecorder";
import { ShareOffer } from "./ShareOffer";
import { CoachingEntry } from "./CoachingEntry";
import { formatDay } from "../shared/format";

const root = "/api/v1/messaging";
type Message = Schema<"MessageDto">;
type Conversation = Schema<"ConversationDto">;

function useForeground() {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  return focused && active;
}

export function MessagesScreen() {
  const nativeCopy = useNativeCopy().t;

  const foreground = useForeground();
  const [search, setSearch] = useState("");
  const [newMessage, setNewMessage] = useState(false);
  const list = useApiQuery<Conversation[]>(`${root}/conversations`, {
    search,
    limit: 100,
  });
  const refetchList = list.refetch;
  useEffect(() => {
    if (foreground) void refetchList();
  }, [foreground, refetchList]);
  const preview = (item: Conversation) =>
    item.lastMessage?.deletedAt
      ? "Message deleted"
      : item.lastMessage?.body ||
        (item.lastMessage
          ? item.lastMessage.type === "VoiceMessage"
            ? "Voice message"
            : "Attachment"
          : "No messages yet");
  return (
    <Screen
      title={nativeCopy("interface.Messages")}
      headerAction={
        <IconButton
          icon="edit"
          label={nativeCopy("interface.New message")}
          filled
          onPress={() => setNewMessage(true)}
        />
      }
    >
      <SearchField
        label={nativeCopy("interface.Search conversations")}
        value={search}
        onChangeText={setSearch}
      />
      <Section>
        {list.isPending ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState
            icon="messages"
            title={
              search
                ? nativeCopy("interface.No conversations match")
                : nativeCopy("interface.No conversations")
            }
            description={
              search
                ? undefined
                : nativeCopy(
                    "interface.Start one with the pencil button above.",
                  )
            }
          />
        ) : (
          list.data.map((item) => (
            <ListItem
              key={item.id}
              leading={<Avatar name={item.title} size={44} />}
              title={item.title}
              subtitle={preview(item)}
              subtitleLines={1}
              trailing={
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {item.lastMessage ? (
                    <Text variant="caption" tone="subtleText">
                      {formatDay(item.lastMessage.createdAt)}
                    </Text>
                  ) : null}
                  {item.unreadCount > 0 ? (
                    <Badge tone="brand">{item.unreadCount}</Badge>
                  ) : item.membershipState !== "Active" ? (
                    <Badge>{item.membershipState}</Badge>
                  ) : null}
                </View>
              }
              onPress={() =>
                router.push({
                  pathname: "/conversation/[id]",
                  params: { id: item.id },
                })
              }
            />
          ))
        )}
      </Section>
      <NewMessage open={newMessage} close={() => setNewMessage(false)} />
    </Screen>
  );
}

function NewMessage({ open, close }: { open: boolean; close: () => void }) {
  const nativeCopy = useNativeCopy().t;

  const [username, setUsername] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const reset = () => {
    setUsername("");
    setBody("");
    setSearch("");
  };
  const finish = () => {
    reset();
    close();
  };
  const people = useApiQuery<Schema<"AccountSearchEntry">[]>(
    `${root}/people`,
    { search: search.trim() },
    open && search.trim().length >= 2,
  );
  const direct = useApiMutation<Conversation>((value) => {
    finish();
    router.push({
      pathname: "/conversation/[id]",
      params: { id: value.id },
    });
  });
  const request = useApiMutation<Schema<"RequestDto">>((value) => {
    finish();
    if (value.conversationId)
      router.push({
        pathname: "/conversation/[id]",
        params: { id: value.conversationId },
      });
  });
  return (
    <BottomSheet
      title={nativeCopy("interface.New message")}
      open={open}
      size="full"
      // Typed text is kept until the person agrees to discard it, inside this sheet.
      dirty={Boolean(body || username)}
      discard={{
        title: nativeCopy("interface.Discard this message?"),
        message: "Your unsent message will be lost.",
      }}
      onClose={finish}
    >
      <SearchField
        label={nativeCopy("interface.Find a person")}
        value={search}
        onChangeText={setSearch}
      />
      {search.trim().length >= 2 &&
        (people.isPending ? (
          <LoadingState />
        ) : people.error ? (
          <ErrorState error={people.error} />
        ) : people.data?.length ? (
          <View>
            {people.data.map((person) => (
              <ListItem
                key={person.userId}
                leading={<Avatar name={person.displayName} size={36} />}
                title={
                  person.username ? `@${person.username}` : person.displayName
                }
                onPress={() => {
                  setUsername(person.username ?? "");
                  if (!direct.isPending)
                    direct.mutate({
                      method: "POST",
                      path: `${root}/conversations/direct`,
                      json: { userId: person.userId },
                    });
                }}
              />
            ))}
          </View>
        ) : (
          <Text variant="caption" tone="mutedText">
            {nativeCopy(
              "interface.No person matches. Try their exact username below.",
            )}
          </Text>
        ))}
      {direct.error && <ErrorState error={direct.error} />}
      <Section title={nativeCopy("interface.Message by username")} flat>
        <Text variant="caption" tone="mutedText">
          {nativeCopy(
            "interface.Start a conversation. Approval is only needed if this person requires it.",
          )}
        </Text>
        <Field
          label={nativeCopy("interface.Exact username")}
          placeholder={nativeCopy("interface.@username")}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <Field
          label={nativeCopy("interface.First message")}
          placeholder={nativeCopy("interface.Introduce yourself")}
          value={body}
          multiline
          maxLength={2000}
          onChangeText={setBody}
        />
        {request.error && <ErrorState error={request.error} />}
        <Button
          size="lg"
          tone="primary"
          title={nativeCopy("interface.Send message")}
          disabled={!username.trim() || !body.trim()}
          loading={request.isPending}
          onPress={() =>
            request.mutate({
              method: "POST",
              path: `${root}/requests/by-username`,
              json: {
                username: username.trim().replace(/^@/, ""),
                body: body.trim(),
              },
            })
          }
        />
      </Section>
    </BottomSheet>
  );
}

export function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accountId } = useMobile();
  return <Thread key={`${accountId}:${id}`} id={id} />;
}

function Thread({ id }: { id: string }) {
  const nativeCopy = useNativeCopy().t;

  const { api, accountId, accountSignal, role, profile, drafts } = useMobile();
  const theme = useTheme();
  const foreground = useForeground();
  const cache = useQueryClient();
  const navigation = useNavigation();
  const details = useApiQuery<Conversation>(`${root}/conversations/${id}`);
  const history = useInfiniteQuery({
    queryKey: [accountId, "mobile-messages", id],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (
        await api<Schema<"MessagePage">>({
          path: `${root}/conversations/${id}/messages`,
          query: { before: pageParam, limit: 50 },
          signal,
        })
      ).data,
    getNextPageParam: (page) => page.olderCursor || undefined,
  });
  const messages = useMemo(
    () =>
      mergeMessages(
        ...(history.data?.pages ?? []).map((page) => page.items).reverse(),
      ),
    [history.data],
  );
  const draftKey = `message:${id}`;
  const empty = (): ComposerDraft => ({
    body: "",
    replyToMessageId: null,
    mediaId: null,
    idempotencyKey: randomUUID(),
    attempted: false,
  });
  const [draft, setDraft] = useState<ComposerDraft>(empty);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<unknown>();
  const [localState, setLocalState] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const queue = useRef(Promise.resolve());
  const localRevision = useRef(0);
  const alive = useRef(true);
  const sendingNow = useRef(false);
  const read = useRef("");
  const [visible, setVisible] = useState<string>();
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set());
  const reading = useRef(false);
  const failedRead = useRef("");
  const [readRevision, setReadRevision] = useState(0);
  const deletingNow = useRef(false);
  const [deleting, setDeleting] = useState<string>();
  const dirty = Boolean(draft.body || draft.mediaId || draft.replyToMessageId);
  usePreventRemove(dirty || sending || uploading || voiceBusy, ({ data }) => {
    void confirm(
      "Leave conversation?",
      "Your text draft stays on this account. Unattached recordings are discarded. An in-flight send may still finish.",
      "Leave",
    ).then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });
  useEffect(() => {
    alive.current = true;
    void drafts
      .get<ComposerDraft>(draftKey)
      .then((value) => {
        if (alive.current) {
          if (value) setDraft(value.value);
          setLoaded(true);
        }
      })
      .catch((failure) => {
        if (alive.current) setError(failure);
      });
    return () => {
      alive.current = false;
    };
  }, [drafts, draftKey]);
  const refetchDetails = details.refetch;
  const refetchHistory = history.refetch;
  useEffect(() => {
    if (foreground) {
      void refetchDetails();
      void refetchHistory();
    }
  }, [foreground, refetchDetails, refetchHistory]);
  useEffect(() => {
    if (
      !foreground ||
      !visible ||
      reading.current ||
      failedRead.current === visible ||
      wasRead(
        visible,
        messages.map((message) => message.id),
        read.current,
      )
    )
      return;
    const target = visible;
    const filter = {
      predicate: (query: { queryKey: QueryKey }) =>
        query.queryKey[0] === accountId &&
        query.queryKey[1] === role &&
        (query.queryKey[2] === `${root}/conversations` ||
          query.queryKey[2] === `${root}/conversations/${id}`),
    };
    const timer = setTimeout(() => {
      void (async () => {
        reading.current = true;
        let snapshots: [QueryKey, Conversation | Conversation[] | undefined][] =
          [];
        try {
          await cache.cancelQueries(filter);
          if (!alive.current || accountSignal.aborted) return;
          snapshots = cache.getQueriesData<Conversation | Conversation[]>(
            filter,
          );
          for (const [key, value] of snapshots)
            cache.setQueryData(
              key,
              Array.isArray(value)
                ? value.map((item) =>
                    item.id === id
                      ? optimisticRead(item, messages, target, profile.id)
                      : item,
                  )
                : value && optimisticRead(value, messages, target, profile.id),
            );
          await api({
            method: "POST",
            path: `${root}/conversations/${id}/read`,
            json: { messageId: target },
          });
          read.current = target;
          failedRead.current = "";
        } catch (failure) {
          failedRead.current = target;
          if (!accountSignal.aborted) {
            for (const [key, value] of snapshots)
              cache.setQueryData<Conversation | Conversation[]>(
                key,
                (current) => {
                  if (!current || !value) return current;
                  if (Array.isArray(current) && Array.isArray(value))
                    return current.map((item) => {
                      const before = value.find(
                        (previous) => previous.id === item.id,
                      );
                      return item.id === id && before
                        ? rollbackRead(item, before, target, profile.id)
                        : item;
                    });
                  return !Array.isArray(current) && !Array.isArray(value)
                    ? rollbackRead<Conversation>(
                        current,
                        value,
                        target,
                        profile.id,
                      )
                    : current;
                },
              );
            if (alive.current) setError(failure);
          }
        } finally {
          reading.current = false;
          if (!accountSignal.aborted) void cache.invalidateQueries(filter);
          if (alive.current) setReadRevision((value) => value + 1);
        }
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [
    foreground,
    visible,
    api,
    id,
    cache,
    accountId,
    role,
    accountSignal,
    profile.id,
    messages,
    readRevision,
  ]);
  function update(next: ComposerDraft) {
    setDraft(next);
    setLocalState("Saving locally");
    const revision = ++localRevision.current;
    // Enqueue immediately: the account store owns ordering and drains accepted edits on switch.
    queue.current = drafts
      .put(draftKey, next, 1)
      .then(() => {
        if (alive.current && revision === localRevision.current)
          setLocalState("Saved locally");
      })
      .catch((failure) => {
        if (alive.current && revision === localRevision.current) {
          setError(failure);
          setLocalState("Local save failed");
        }
        throw failure;
      });
    void queue.current.catch(() => {});
  }
  async function send() {
    if (
      sendingNow.current ||
      !canSend ||
      (!draft.body.trim() && !draft.mediaId)
    )
      return;
    sendingNow.current = true;
    setSending(true);
    setError(undefined);
    const pending = { ...draft, attempted: true };
    update(pending);
    try {
      await queue.current;
      const sent = (
        await api<Message>({
          method: "POST",
          path: `${root}/conversations/${id}/messages`,
          idempotencyKey: pending.idempotencyKey,
          json: {
            type: pending.mediaId ? pending.mediaType || "File" : "Text",
            body: pending.body.trim() || null,
            mediaIds: pending.mediaId ? [pending.mediaId] : [],
            replyToMessageId: pending.replyToMessageId,
          } satisfies Schema<"SendMessageRequest">,
        })
      ).data;
      if (alive.current && !accountSignal.aborted)
        cache.setQueryData<InfiniteData<Schema<"MessagePage">>>(
          [accountId, "mobile-messages", id],
          (current) =>
            current && {
              ...current,
              pages: current.pages.map((page, index) =>
                index === 0
                  ? {
                      ...page,
                      items: mergeMessages(page.items, [sent]),
                    }
                  : page,
              ),
            },
        );
      if (
        alive.current &&
        !accountSignal.aborted &&
        details.data?.canUploadAttachments === false
      ) {
        cache.setQueriesData<Conversation>(
          {
            predicate: (query) =>
              query.queryKey[0] === accountId &&
              query.queryKey[2] === `${root}/conversations/${id}`,
          },
          (current) =>
            current ? { ...current, canSendMessages: false } : current,
        );
      }
      await drafts.remove(draftKey);
      if (alive.current && !accountSignal.aborted) {
        setDraft(empty());
        setLocalState("Sent");
        await history.refetch();
        void details.refetch();
      }
    } catch (failure) {
      if (alive.current) {
        setError(failure);
        setLocalState("Not sent — retry uses the same message key");
      }
    } finally {
      sendingNow.current = false;
      if (alive.current) setSending(false);
    }
  }
  async function attach() {
    if (!canSend || details.data?.canUploadAttachments === false) return;
    setUploading(true);
    setError(undefined);
    try {
      const mediaId = await pickAndUpload(api, root, accountSignal, {
        conversationId: id,
      });
      if (mediaId && alive.current && !accountSignal.aborted)
        update({ ...draft, mediaId, mediaType: "File" });
    } catch (failure) {
      if (alive.current) setError(failure);
    } finally {
      if (alive.current) setUploading(false);
    }
  }
  async function uploadVoice(uri: string) {
    if (!canSend || details.data?.canUploadAttachments === false) return;
    setUploading(true);
    setError(undefined);
    try {
      const mediaId = await uploadFile(
        api,
        root,
        { uri, name: "voice-message.wav", mimeType: "audio/wav" },
        accountSignal,
        { conversationId: id },
      );
      if (alive.current && !accountSignal.aborted)
        update({ ...draft, mediaId, mediaType: "VoiceMessage" });
    } finally {
      if (alive.current) setUploading(false);
    }
  }
  async function attachWav() {
    try {
      const selected = await DocumentPicker.getDocumentAsync({
        type: ["audio/wav", "audio/x-wav"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selected.canceled || !selected.assets[0]) return;
      const file = new File(selected.assets[0].uri);
      try {
        await uploadVoice(file.uri);
      } finally {
        if (file.exists) file.delete();
      }
    } catch (failure) {
      if (alive.current) setError(failure);
    }
  }
  async function deleteMessage(item: Message) {
    if (
      deletingNow.current ||
      item.senderUserId !== profile.id ||
      item.type === "System" ||
      item.deletedAt
    )
      return;
    deletingNow.current = true;
    try {
      if (
        !(await confirm(
          "Delete message?",
          "This message will be removed for everyone in the conversation.",
          "Delete",
        ))
      )
        return;
      setDeleting(item.id);
      setError(undefined);
      const deleted = (
        await api<Message>({
          method: "DELETE",
          path: `${root}/messages/${item.id}`,
        })
      ).data;
      if (!alive.current || accountSignal.aborted) return;
      cache.setQueryData<InfiniteData<Schema<"MessagePage">>>(
        [accountId, "mobile-messages", id],
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              items: page.items.map((message) =>
                message.id === deleted.id ? deleted : message,
              ),
            })),
          },
      );
      cache.setQueriesData<Conversation | Conversation[]>(
        {
          predicate: (query) =>
            query.queryKey[0] === accountId &&
            query.queryKey[1] === role &&
            (query.queryKey[2] === `${root}/conversations` ||
              query.queryKey[2] === `${root}/conversations/${id}`),
        },
        (current) => {
          const patch = (conversation: Conversation) =>
            conversation.lastMessage?.id === deleted.id
              ? { ...conversation, lastMessage: deleted }
              : conversation;
          return Array.isArray(current)
            ? current.map(patch)
            : current && patch(current);
        },
      );
      void details.refetch();
    } catch (failure) {
      if (alive.current && !accountSignal.aborted) setError(failure);
    } finally {
      deletingNow.current = false;
      if (alive.current) setDeleting(undefined);
    }
  }
  async function messageActions(item: Message) {
    if (item.deletedAt || deletingNow.current) return;
    const actions: {
      value: "reply" | "delete";
      label: string;
      icon: "reply" | "delete";
      destructive?: boolean;
    }[] = [];
    if (canSend && !draft.attempted && !sending && !uploading)
      actions.push({
        value: "reply",
        label: nativeCopy("interface.Reply"),
        icon: "reply",
      });
    if (item.senderUserId === profile.id && item.type !== "System")
      actions.push({
        value: "delete",
        label: nativeCopy("interface.Delete for everyone"),
        icon: "delete",
        destructive: true,
      });
    if (!actions.length) return;
    const choice = await chooseAction(
      "Message",
      actions,
      item.body ? item.body.slice(0, 80) : undefined,
    );
    if (choice === "reply") update({ ...draft, replyToMessageId: item.id });
    else if (choice === "delete") void deleteMessage(item);
  }
  const viewability = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Message>[] }) => {
      const shown = viewableItems
        .filter((item) => item.isViewable)
        .map((item) => item.item);
      setVisibleIds(new Set(shown.map((item) => item.id)));
      setVisible(
        mergeMessages(
          shown.filter((item) => item.senderUserId !== profile.id),
        ).at(-1)?.id,
      );
    },
  ).current;
  const canSend =
    loaded &&
    details.data?.membershipState === "Active" &&
    details.data?.canSendMessages !== false;
  const request =
    details.data?.request?.state === "Pending" ? details.data.request : null;
  const approval = useApiMutation(() => {
    void details.refetch();
  });
  const ids = messages.map((message) => message.id);
  const reversed = [...messages].reverse();
  const pending =
    draft.attempted &&
    !messages.some(
      (message) =>
        message.clientMessageId === draft.idempotencyKey &&
        message.senderUserId === profile.id,
    );
  const lastOutgoing = reversed.find(
    (message) =>
      message.senderUserId === profile.id && message.type !== "System",
  )?.id;
  const title = details.data?.title;
  useEffect(() => {
    // The native header carries the conversation name; the thread itself runs edge to edge.
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [shareKind, setShareKind] = useState<"form" | "invitation" | null>(
    null,
  );
  const peer =
    details.data?.type === "Direct"
      ? details.data.members.find((member) => member.userId !== profile.id)
      : undefined;
  const canShare = Boolean(
    peer?.username && profile.contexts.includes("Coach"),
  );
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => {
    if (draft.mediaId) setVoiceOpen(false);
  }, [draft.mediaId]);
  if (details.error)
    return (
      <Screen title={nativeCopy("interface.Conversation unavailable")}>
        <ErrorState
          error={details.error}
          retry={() => void details.refetch()}
        />
      </Screen>
    );
  const group = (details.data?.members.length ?? 0) > 2;
  const replyTarget = draft.replyToMessageId
    ? messages.find((message) => message.id === draft.replyToMessageId)
    : undefined;
  const composerLocked = !canSend || sending || uploading || draft.attempted;
  const bubble = (mine: boolean) => ({
    maxWidth: "82%" as const,
    alignSelf: mine ? ("flex-end" as const) : ("flex-start" as const),
    gap: 4,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md - 2,
    borderRadius: theme.radii.lg,
    borderBottomRightRadius: mine ? theme.radii.sm - 4 : theme.radii.lg,
    borderBottomLeftRadius: mine ? theme.radii.lg : theme.radii.sm - 4,
    backgroundColor: mine ? theme.colors.surfaceRaised : theme.colors.surface,
    borderWidth: theme.hairline,
    borderColor: mine ? theme.colors.borderStrong : theme.colors.border,
  });
  return (
    <Screen
      title={title || nativeCopy("interface.Conversation")}
      scroll={false}
      bare
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          data={reversed}
          inverted
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
          }}
          onViewableItemsChanged={viewability}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 70,
            minimumViewTime: 500,
          }}
          ListHeaderComponent={
            pending ? (
              <View style={[bubble(true), { opacity: 0.6 }]}>
                <Text>{draft.body || nativeCopy("interface.Attachment")}</Text>
                <Text variant="caption" tone="mutedText">
                  {sending
                    ? nativeCopy("interface.Sending…")
                    : nativeCopy(
                        "interface.Not confirmed yet. Use Retry below.",
                      )}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            history.isPending ? (
              <LoadingState />
            ) : history.error ? (
              <ErrorState
                error={history.error}
                retry={() => void history.refetch()}
              />
            ) : (
              // The list is inverted, so its empty state is flipped back.
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState
                  icon="messages"
                  title={nativeCopy("interface.No messages yet")}
                  description={nativeCopy(
                    "interface.Say hello to start the conversation.",
                  )}
                />
              </View>
            )
          }
          ListFooterComponent={
            history.hasNextPage ? (
              <Button
                size="sm"
                tone="ghost"
                title={nativeCopy("interface.Load older messages")}
                loading={history.isFetchingNextPage}
                onPress={() => void history.fetchNextPage()}
              />
            ) : null
          }
          renderItem={({ item, index }) => {
            const mine = item.senderUserId === profile.id;
            const system = item.type === "System";
            const sender = details.data?.members.find(
              (member) => member.userId === item.senderUserId,
            )?.displayName;
            const reply = item.replyToMessageId
              ? messages.find((message) => message.id === item.replyToMessageId)
              : undefined;
            const hasActions =
              !item.deletedAt &&
              ((canSend && !draft.attempted) || (mine && !system));
            const read =
              !pending && item.id === lastOutgoing && !item.deletedAt
                ? details.data?.members.some(
                    (member) =>
                      member.userId !== profile.id &&
                      wasRead(item.id, ids, member.lastReadMessageId),
                  )
                  ? "Read"
                  : "Sent"
                : "";
            const newDay =
              !reversed[index + 1] ||
              new Date(reversed[index + 1]!.createdAt).toDateString() !==
                new Date(item.createdAt).toDateString();
            // Only a message that has just arrived animates in; scrolling back
            // through history must not replay entrances.
            const fresh =
              Date.now() - new Date(item.createdAt).getTime() < 4000;
            return (
              <Animated.View
                entering={fresh ? transitions.enter : undefined}
                style={{ gap: theme.spacing.sm }}
              >
                {newDay && (
                  <Text
                    variant="caption"
                    tone="subtleText"
                    style={{ alignSelf: "center" }}
                  >
                    {formatDay(item.createdAt)}
                  </Text>
                )}
                {item.coachingEntry && !item.deletedAt ? (
                  <CoachingEntry entry={item.coachingEntry} mine={mine} />
                ) : system ? (
                  <Text
                    variant="caption"
                    tone="mutedText"
                    style={{ textAlign: "center" }}
                  >
                    {item.body}
                  </Text>
                ) : (
                  <View
                    style={{
                      flexDirection: mine ? "row-reverse" : "row",
                      alignItems: "flex-end",
                      gap: theme.spacing.xs,
                    }}
                  >
                    <Pressable
                      // Long-press is a shortcut; the "…" button beside
                      // the bubble opens the same sheet.
                      onLongPress={() => void messageActions(item)}
                      accessible={false}
                      style={bubble(mine)}
                    >
                      {!mine && group && (
                        <Text variant="caption" tone="brand">
                          {sender || nativeCopy("interface.Participant")}
                        </Text>
                      )}
                      {item.replyToMessageId && (
                        <View
                          style={{
                            paddingLeft: theme.spacing.sm,
                            borderLeftWidth: 2,
                            borderLeftColor: theme.colors.borderStrong,
                          }}
                        >
                          <Text
                            variant="caption"
                            tone="mutedText"
                            numberOfLines={2}
                          >
                            {reply?.body ||
                              nativeCopy("interface.Earlier message")}
                          </Text>
                        </View>
                      )}
                      {item.deletedAt ? (
                        <Text tone="subtleText">
                          {nativeCopy("interface.Message deleted")}
                        </Text>
                      ) : item.body ? (
                        <Text>{item.body}</Text>
                      ) : null}
                      {!item.deletedAt &&
                        item.attachments.map((attachment) => (
                          <Attachment
                            key={attachment.mediaId}
                            messageId={item.id}
                            attachment={attachment}
                            visible={foreground && visibleIds.has(item.id)}
                          />
                        ))}
                      <Text
                        variant="caption"
                        tone="subtleText"
                        style={{
                          alignSelf: mine ? "flex-end" : "flex-start",
                        }}
                      >
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {read ? ` · ${read}` : ""}
                      </Text>
                    </Pressable>
                    {hasActions && (
                      <IconButton
                        icon="more"
                        label={nativeCopy("interface.Message actions")}
                        tone="subtleText"
                        size={36}
                        disabled={!!deleting}
                        onPress={() => void messageActions(item)}
                      />
                    )}
                  </View>
                )}
              </Animated.View>
            );
          }}
        />
        <View
          style={{
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.sm,
            gap: theme.spacing.sm,
            borderTopWidth: theme.hairline,
            borderTopColor: theme.colors.border,
          }}
        >
          {!!error && (
            <ErrorState
              error={error}
              retry={
                failedRead.current
                  ? () => {
                      failedRead.current = "";
                      setError(undefined);
                      setReadRevision((value) => value + 1);
                    }
                  : undefined
              }
            />
          )}
          {history.error && !!messages.length && (
            <ErrorState
              error={history.error}
              retry={() => void history.refetch()}
            />
          )}
          {request && (
            <View style={{ gap: theme.spacing.sm }}>
              <Text tone="mutedText">
                {request.recipientUserId === profile.id
                  ? nativeCopy("interface.Accept this conversation to reply.")
                  : nativeCopy(
                      "interface.Message sent. Waiting for this person to accept.",
                    )}
              </Text>
              {request.recipientUserId === profile.id && (
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  <Button
                    title={nativeCopy("interface.Accept")}
                    loading={approval.isPending}
                    onPress={() =>
                      approval.mutate({
                        method: "POST",
                        path: `${root}/requests/${request.id}/accept`,
                      })
                    }
                  />
                  <Button
                    title={nativeCopy("interface.Decline")}
                    disabled={approval.isPending}
                    onPress={() =>
                      approval.mutate({
                        method: "POST",
                        path: `${root}/requests/${request.id}/decline`,
                      })
                    }
                  />
                </View>
              )}
              {approval.error && <ErrorState error={approval.error} />}
            </View>
          )}
          {(draft.replyToMessageId || draft.mediaId) && (
            <View style={{ gap: theme.spacing.xs }}>
              {draft.replyToMessageId && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.sm,
                  }}
                >
                  <Icon name="reply" tone="mutedText" size={theme.icon.sm} />
                  <Text
                    variant="caption"
                    tone="mutedText"
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {replyTarget?.body ||
                      nativeCopy("interface.Earlier message")}
                  </Text>
                  <IconButton
                    icon="close"
                    label={nativeCopy("interface.Remove reply")}
                    tone="mutedText"
                    size={32}
                    disabled={draft.attempted || sending}
                    onPress={() =>
                      update({
                        ...draft,
                        replyToMessageId: null,
                      })
                    }
                  />
                </View>
              )}
              {draft.mediaId && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: theme.spacing.sm,
                  }}
                >
                  <Icon
                    name={draft.mediaType === "VoiceMessage" ? "mic" : "attach"}
                    tone="brand"
                    size={theme.icon.sm}
                  />
                  <Text variant="caption" style={{ flex: 1 }}>
                    {draft.mediaType === "VoiceMessage"
                      ? nativeCopy("interface.Voice message attached")
                      : nativeCopy("interface.File attached")}
                  </Text>
                </View>
              )}
            </View>
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: theme.spacing.xs,
            }}
          >
            <IconButton
              icon="add"
              label={nativeCopy("interface.Attach a file or voice message")}
              filled
              disabled={composerLocked || voiceBusy || !!draft.mediaId}
              onPress={() => setAttachMenu(true)}
            />
            <View style={{ flex: 1 }}>
              <Field
                label={nativeCopy("interface.Message")}
                hideLabel
                placeholder={
                  canSend
                    ? nativeCopy("interface.Message")
                    : loaded
                      ? nativeCopy("interface.You cannot send messages here")
                      : nativeCopy("interface.Loading draft…")
                }
                value={draft.body}
                multiline
                maxLength={8000}
                editable={!composerLocked}
                onChangeText={(body) => update({ ...draft, body })}
                style={{ minHeight: 0, maxHeight: 120 }}
              />
            </View>
            <IconButton
              icon="send"
              label={
                draft.attempted
                  ? nativeCopy("interface.Retry send")
                  : nativeCopy("interface.Send")
              }
              filled
              tone="brand"
              disabled={
                !canSend ||
                sending ||
                uploading ||
                voiceBusy ||
                (!draft.body.trim() && !draft.mediaId)
              }
              onPress={() => void send()}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 20,
            }}
          >
            <Text
              variant="caption"
              tone="subtleText"
              accessibilityLiveRegion="polite"
            >
              {uploading
                ? nativeCopy("interface.Uploading…")
                : sending
                  ? nativeCopy("interface.Sending…")
                  : canSend
                    ? localState
                    : ""}
            </Text>
            {dirty && (
              <Button
                size="sm"
                tone="ghost"
                title={nativeCopy("interface.Discard draft")}
                disabled={sending || uploading}
                onPress={async () => {
                  if (
                    await confirm(
                      "Discard draft?",
                      draft.attempted
                        ? "A previous send may already have reached the server. Refresh before sending it again."
                        : "Delete this unsent message?",
                      "Discard",
                    )
                  ) {
                    await queue.current.catch(() => {});
                    await drafts.remove(draftKey);
                    setDraft(empty());
                    setError(undefined);
                    setLocalState("");
                  }
                }}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      <ActionSheet
        title={nativeCopy("interface.Add to message")}
        open={attachMenu}
        onClose={() => setAttachMenu(false)}
        actions={[
          {
            value: "file",
            label: nativeCopy("interface.File or photo"),
            icon: "attach",
            disabled: details.data?.canUploadAttachments === false,
          },
          {
            value: "record",
            label: nativeCopy("interface.Record a voice message"),
            icon: "mic",
            disabled: details.data?.canUploadAttachments === false,
          },
          {
            value: "wav",
            label: nativeCopy("interface.Existing WAV recording"),
            icon: "document",
            disabled: details.data?.canUploadAttachments === false,
          },
          ...(canShare
            ? [
                {
                  value: "form",
                  label: nativeCopy("interface.Send application form"),
                  icon: "document" as const,
                },
                {
                  value: "invitation",
                  label: nativeCopy("interface.Send invitation"),
                  icon: "mail" as const,
                },
              ]
            : []),
        ]}
        onSelect={(value) => {
          if (!canSend) return;
          if (value === "form" || value === "invitation") setShareKind(value);
          else if (value === "file") void attach();
          else if (value === "wav") void attachWav();
          else setVoiceOpen(true);
        }}
      />
      {shareKind && peer?.username && (
        <ShareOffer
          key={shareKind}
          kind={shareKind}
          userId={peer.userId}
          username={peer.username}
          close={() => setShareKind(null)}
          refresh={() => {
            void history.refetch();
            void details.refetch();
          }}
        />
      )}
      <BottomSheet
        title={nativeCopy("interface.Voice message")}
        open={voiceOpen}
        // A recording in progress is not thrown away by an accidental swipe.
        dirty={voiceBusy}
        discard={{
          title: nativeCopy("interface.Stop recording?"),
          message: "The recording will be discarded.",
        }}
        onClose={() => setVoiceOpen(false)}
      >
        {canSend &&
          details.data?.canUploadAttachments !== false &&
          !draft.attempted &&
          !draft.mediaId && (
            <VoiceRecorder
              disabled={sending || uploading}
              onReady={uploadVoice}
              onBusy={setVoiceBusy}
            />
          )}
      </BottomSheet>
    </Screen>
  );
}
