import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { useFeatureAccess } from "~/shared/access";
import { useAccountContext } from "~/shared/session";
import {
  MessagingPollingContext,
  root,
  syncMessage,
  useChatQuery,
  useRealtime,
} from "./api";
import {
  notificationItems,
  type NotificationItem,
} from "./notifications-model";
import { useNotificationSound } from "./notification-sound";
import type { Conversation, Request } from "./model";

type Notifications = {
  items: NotificationItem[];
  unreadMessages: number;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  muted: boolean;
  toggleSound: () => void;
};
const MessagingContext = createContext<ReturnType<typeof useRealtime> | null>(
  null,
);
const NotificationsContext = createContext<Notifications | null>(null);
export function MessagingProvider({ children }: { children: ReactNode }) {
  const direct = useFeatureAccess("messaging.direct").allowed;
  const groups = useFeatureAccess("messaging.groups").allowed;
  const { account, accountKey } = useAccountContext();
  const cache = useQueryClient();
  const location = useLocation();
  const { play, muted, toggle } = useNotificationSound(account.userId);
  const seen = useRef(new Set<string>());
  const onIncoming = useCallback(
    (event: {
      id: string;
      senderUserId: string;
      conversationId?: string | null;
    }) => {
      if (event.senderUserId === account.userId || seen.current.has(event.id))
        return;
      seen.current.add(event.id);
      if (seen.current.size > 200)
        seen.current.delete(seen.current.values().next().value!);
      play();
    },
    [account.userId, play],
  );
  const realtime = useRealtime(direct || groups, onIncoming);
  const interval = realtime.status === "Live" ? 60000 : 15000;
  const conversations = useChatQuery<Conversation[]>(
    `${root}/conversations`,
    { search: "", limit: 100 },
    direct || groups,
    interval,
  );
  const requests = useChatQuery<Request[]>(
    `${root}/requests`,
    undefined,
    direct,
    interval,
  );
  const previous = useRef<{
    messages: Set<string> | null;
    requests: Set<string> | null;
  }>({ messages: null, requests: null });
  const previousAccount = useRef(accountKey);
  if (previousAccount.current !== accountKey) {
    previousAccount.current = accountKey;
    seen.current.clear();
    previous.current = { messages: null, requests: null };
  }
  useEffect(() => {
    if (conversations.data) {
      for (const conversation of conversations.data) {
        const message = conversation.lastMessage;
        if (message) void syncMessage(cache, accountKey, message, true);
        if (
          message &&
          Number(conversation.unreadCount) > 0 &&
          previous.current.messages &&
          !previous.current.messages.has(message.id)
        )
          onIncoming(message);
      }
      previous.current.messages = new Set(
        conversations.data.flatMap((c) =>
          c.lastMessage ? [c.lastMessage.id] : [],
        ),
      );
    }
    if (requests.data) {
      for (const request of requests.data)
        if (
          request.state === "Pending" &&
          previous.current.requests &&
          !previous.current.requests.has(request.id)
        )
          onIncoming(request);
      previous.current.requests = new Set(requests.data.map((r) => r.id));
    }
  }, [conversations.data, requests.data, onIncoming, cache, accountKey]);
  const activeConversation =
    location.pathname === "/app/messages"
      ? new URLSearchParams(location.search).get("conversation")
      : null;
  const items = notificationItems(
    direct || groups ? (conversations.data ?? []) : [],
    direct ? (requests.data ?? []) : [],
    [],
    account.userId,
    activeConversation,
  );
  const queries = [
    ...(direct || groups ? [conversations] : []),
    ...(direct ? [requests] : []),
  ];
  const value: Notifications = {
    items,
    unreadMessages: items
      .filter((item) => !item.invitation)
      .reduce((sum, item) => sum + item.count, 0),
    loading: queries.some((query) => query.isPending),
    failed: queries.some((query) => query.isError),
    retry: () => {
      queries.forEach((query) => void query.refetch());
    },
    muted,
    toggleSound: toggle,
  };
  return (
    <MessagingContext.Provider value={realtime}>
      <MessagingPollingContext.Provider value={interval}>
        <NotificationsContext.Provider value={value}>
          {children}
        </NotificationsContext.Provider>
      </MessagingPollingContext.Provider>
    </MessagingContext.Provider>
  );
}
export function useMessagingRealtime() {
  const value = useContext(MessagingContext);
  if (!value) throw new Error("MessagingProvider is required");
  return value;
}
export function useNotifications() {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error("MessagingProvider is required");
  return value;
}
