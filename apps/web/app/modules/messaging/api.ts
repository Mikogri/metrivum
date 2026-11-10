import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  HubConnectionBuilder,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";
import {
  type InfiniteData,
  type QueryClient,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAccountContext, useApi, useAccountKey } from "~/shared/session";
import { apiBaseUrl, type QueryValue } from "~/shared/http";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import type { Schema } from "@metrivum/api-client-web";
import { mergeMessages, type Message } from "./model";

export function cacheMessage(
  cache: QueryClient,
  account: string,
  message: Message,
) {
  cache.setQueryData<InfiniteData<Schema<"MessagePage">>>(
    [account, "messaging", "history", message.conversationId],
    (old) => {
      if (!old) return old;
      const exists = old.pages.some((page) =>
        page.items.some((item) => item.id === message.id),
      );
      return {
        ...old,
        pages: old.pages.map((page, index) => ({
          ...page,
          items: exists
            ? page.items.map((item) =>
                item.id === message.id ? message : item,
              )
            : index === 0
              ? mergeMessages(page.items, [message])
              : page.items,
        })),
      };
    },
  );
}

// Summary polling may discover a message before history polling does.
export async function syncMessage(
  cache: QueryClient,
  account: string,
  message: Message,
  recoverGaps = false,
) {
  const queryKey = [account, "messaging", "history", message.conversationId];
  const history =
    cache.getQueryData<InfiniteData<Schema<"MessagePage">>>(queryKey);
  if (
    !history ||
    history.pages.some((page) =>
      page.items.some((item) => item.id === message.id),
    )
  )
    return;
  await cache.cancelQueries({ queryKey });
  cacheMessage(cache, account, message);
  if (recoverGaps) void cache.invalidateQueries({ queryKey });
}

export const root = "/api/v1/messaging";
export const MessagingPollingContext = createContext(15000);
export function useChatQuery<T>(
  path: string,
  query?: Record<string, QueryValue>,
  enabled = true,
  interval?: number,
) {
  const api = useApi();
  const account = useAccountKey();
  const messagingInterval = useContext(MessagingPollingContext);
  return useQuery({
    queryKey: [account, "messaging", path, query],
    enabled,
    queryFn: async ({ signal }) => (await api<T>({ path, query, signal })).data,
    refetchInterval: path.startsWith(`${root}/`)
      ? (interval ?? messagingInterval)
      : 15000,
  });
}
/**
 * Several pages of one list, each cached exactly like a single useChatQuery page (same key shape and data), so the
 * live updates that patch list caches keep working. Only the first page polls; the rest refresh on invalidation.
 */
export function useChatPages<T extends { id: string }>(
  path: string,
  query: Record<string, QueryValue>,
  pageSize: number,
  pages: number,
  enabled = true,
) {
  const api = useApi();
  const account = useAccountKey();
  const messagingInterval = useContext(MessagingPollingContext);
  const results = useQueries({
    queries: Array.from({ length: pages }, (_, index) => {
      const pageQuery = { ...query, page: index + 1, limit: pageSize };
      return {
        queryKey: [account, "messaging", path, pageQuery],
        enabled,
        queryFn: async ({ signal }: { signal: AbortSignal }) =>
          (await api<T[]>({ path, query: pageQuery, signal })).data,
        refetchInterval: index === 0 ? messagingInterval : (false as const),
      };
    }),
  });
  const loaded = results.filter((result) => result.data);
  // Pages can overlap when a conversation moves up between requests: keep each item once, in first-seen order.
  const seen = new Set<string>();
  const items = loaded
    .flatMap((result) => result.data!)
    .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  const last = results[results.length - 1];
  return {
    items,
    isPending: results[0]?.isPending ?? true,
    isError: results[0]?.isError ?? false,
    error: results[0]?.error ?? null,
    refetch: () => results.forEach((result) => void result.refetch()),
    /** The newest page is still on its way. */
    isLoadingMore: pages > 1 && Boolean(last?.isPending),
    /** The last page came back full, so there may be more. */
    hasMore: Boolean(last?.data && last.data.length >= pageSize),
  };
}

export function useRealtime(
  enabled: boolean,
  onIncoming?: (event: {
    id: string;
    senderUserId: string;
    conversationId?: string | null;
  }) => void,
) {
  const incoming = useRef(onIncoming);
  useEffect(() => {
    incoming.current = onIncoming;
  }, [onIncoming]);
  const { account, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const connection = useRef<{
    hub: HubConnection;
    current: () => boolean;
  } | null>(null);
  const lastTyping = useRef({ id: "", at: 0 });
  const [status, setStatus] = useState("Connecting");
  const [typing, setTyping] = useState<
    Record<string, { userId: string; expiresAt: string }[]>
  >({});
  useEffect(() => {
    if (!enabled || MOCK_MODE) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && lifecycle.isCurrent();
    const refresh = () => {
      if (current())
        void cache.invalidateQueries({
          queryKey: [accountKey, "messaging"],
        });
    };
    const refreshConversation = (event?: { conversationId?: string }) => {
      if (!current()) return;
      if (!event?.conversationId) {
        refresh();
        return;
      }
      const id = event.conversationId;
      void cache.invalidateQueries({
        queryKey: [accountKey, "messaging"],
        predicate: ({ queryKey: key }) =>
          key[2] === `${root}/conversations` ||
          key[2] === `${root}/requests` ||
          key[2] === `${root}/conversations/${id}` ||
          (key[2] === "history" && key[3] === id),
      });
    };
    const hub = new HubConnectionBuilder()
      .withUrl(`${apiBaseUrl()}${root}/hub`, {
        accessTokenFactory: async () =>
          (await lifecycle.accessToken({ signal: controller.signal })) ?? "",
        withCredentials: false,
      })
      .configureLogging(LogLevel.None)
      .withAutomaticReconnect([0, 2000, 5000, 15000])
      .build();
    const signal = lifecycle.signal();
    const stop = () => {
      void hub.stop();
    };
    signal.addEventListener("abort", stop, { once: true });
    connection.current = { hub, current };
    for (const name of [
      "MessageDeleted",
      "ConversationUpdated",
      "MembershipChanged",
      "MessageRequestUpdated",
    ])
      hub.on(name, refreshConversation);
    hub.on(
      "MessageRequestCreated",
      (request: { id: string; senderUserId: string }) => {
        if (!current()) return;
        refresh();
        incoming.current?.(request);
      },
    );
    hub.on("ReadMarkerChanged", (event: { conversationId: string }) => {
      if (!current()) return;
      void cache.invalidateQueries({
        queryKey: [
          accountKey,
          "messaging",
          `${root}/conversations/${event.conversationId}`,
        ],
      });
      void cache.invalidateQueries({
        queryKey: [accountKey, "messaging", `${root}/conversations`],
      });
    });
    hub.on("MessageCreated", async (message: Message) => {
      if (!current()) return;
      const historyKey = [
        accountKey,
        "messaging",
        "history",
        message.conversationId,
      ];
      if (cache.getQueryData(historyKey))
        await cache.cancelQueries({ queryKey: historyKey });
      if (!current()) return;
      cacheMessage(cache, accountKey, message);
      incoming.current?.(message);
      void cache.invalidateQueries({
        queryKey: [accountKey, "messaging", `${root}/conversations`],
      });
    });
    hub.on(
      "TypingChanged",
      (event: {
        conversationId: string;
        userId: string;
        typing: boolean;
        expiresAt: string;
      }) => {
        if (!current() || event.userId === account.userId) return;
        setTyping((old) => ({
          ...old,
          [event.conversationId]: [
            ...(old[event.conversationId] ?? []).filter(
              (x) => x.userId !== event.userId,
            ),
            ...(event.typing
              ? [
                  {
                    userId: event.userId,
                    expiresAt: event.expiresAt,
                  },
                ]
              : []),
          ],
        }));
      },
    );
    hub.onreconnecting(() => {
      if (current()) setStatus("Reconnecting");
    });
    hub.onreconnected(() => {
      if (current()) {
        setStatus("Live");
        refresh();
      }
    });
    hub.onclose(() => {
      if (current()) setStatus("Syncing periodically");
    });
    void hub
      .start()
      .then(() => {
        if (!current()) void hub.stop();
        else {
          setStatus("Live");
          refresh();
        }
      })
      .catch(() => {
        if (current()) setStatus("Syncing periodically");
      });
    return () => {
      controller.abort();
      signal.removeEventListener("abort", stop);
      connection.current = null;
      void hub.stop();
    };
  }, [enabled, account.slot, account.userId, accountKey, lifecycle, cache]);
  useEffect(() => {
    const expiry = Math.min(
      ...Object.values(typing).flatMap((people) =>
        people.map((p) => Date.parse(p.expiresAt)),
      ),
    );
    if (!Number.isFinite(expiry)) return;
    // Wake only when an indicator expires; idle chat must not rerender the app each second.
    const timer = window.setTimeout(
      () => {
        if (!lifecycle.isCurrent()) return;
        setTyping((old) =>
          Object.fromEntries(
            Object.entries(old)
              .map(
                ([id, people]) =>
                  [
                    id,
                    people.filter((p) => Date.parse(p.expiresAt) > Date.now()),
                  ] as const,
              )
              .filter(([, people]) => people.length > 0),
          ),
        );
      },
      Math.max(0, expiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [typing, lifecycle]);
  return {
    status: MOCK_MODE ? "Preview" : status,
    typing,
    sendTyping: (id: string, value: boolean) => {
      const now = Date.now();
      if (
        value &&
        lastTyping.current.id === id &&
        now - lastTyping.current.at < 1500
      )
        return;
      lastTyping.current = { id, at: value ? now : 0 };
      if (
        connection.current?.current() &&
        connection.current.hub.state === "Connected"
      )
        void connection.current.hub.invoke("Typing", id, value).catch(() => {});
    },
  };
}
