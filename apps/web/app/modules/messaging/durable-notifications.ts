import { useEffect, useRef, useState } from "react";
import { notificationTargetsView } from "./notification-target";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountContext, useApi } from "~/shared/session";
import { apiBaseUrl } from "~/shared/http";
import { MOCK_MODE } from "~/shared/dev/mockMode";
import { optimisticNotificationRead } from "./notification-read-cache";
export type DurableNotification = {
  id: string;
  type: string;
  category: string;
  sourceModule: string;
  sourceId: string;
  deepLink: string | null;
  createdAt: string;
  readAt: string | null;
};
export type Preferences = {
  messaging: boolean;
  checkIns: boolean;
  coaching: boolean;
  system: boolean;
  programEnding?: string[];
};
type Page = {
  items: DurableNotification[];
  page: number;
  pageSize: number;
  total: number;
};
export function useDurableNotifications(
  activeConversation: string | null,
  open: boolean,
  target: string | null = null,
  onArrived?: (created: DurableNotification) => void,
) {
  const api = useApi();
  const cache = useQueryClient();
  // Told about each notification as it arrives; kept in a ref so the hub does not reconnect on every render.
  const arrived = useRef(onArrived);
  arrived.current = onArrived;
  const { account, accountKey, lifecycle } = useAccountContext();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const interval = connectedAccount === accountKey ? 60000 : 15000;
  const prefix = [accountKey, "notifications"];
  const list = useQuery({
    enabled: open,
    queryKey: [...prefix, page, unreadOnly, activeConversation],
    queryFn: async ({ signal }) =>
      (
        await api<Page>({
          path: "/api/v1/me/notifications",
          query: {
            page,
            pageSize: 25,
            unread: unreadOnly,
            activeConversation: activeConversation ?? undefined,
          },
          signal,
        })
      ).data,
    refetchInterval: interval,
  });
  const count = useQuery({
    queryKey: [...prefix, "count", activeConversation],
    queryFn: async ({ signal }) =>
      (
        await api<{ count: number }>({
          path: "/api/v1/me/notifications/unread-count",
          query: {
            activeConversation: activeConversation ?? undefined,
          },
          signal,
        })
      ).data,
    refetchInterval: interval,
  });
  const pendingTargets = useRef(new Set<string>());
  const lastTargetFailure = useRef({ key: "", at: 0 });
  useEffect(() => {
    const acknowledge = async () => {
      if (
        !target ||
        document.visibilityState !== "visible" ||
        !lifecycle.isCurrent() ||
        !count.data?.count
      )
        return;
      const key = accountKey + target;
      if (
        pendingTargets.current.has(key) ||
        (lastTargetFailure.current.key === key &&
          Date.now() - lastTargetFailure.current.at < 15000)
      )
        return;
      pendingTargets.current.add(key);
      const pages = cache.getQueriesData<Page>({
        queryKey: [accountKey, "notifications"],
        predicate: (q) => typeof q.queryKey[2] === "number",
      });
      const ids = new Set(
        pages
          .flatMap(([, value]) => value?.items ?? [])
          .filter((n) => !n.readAt && notificationTargetsView(n, target))
          .map((n) => n.id),
      );
      void cache.cancelQueries({
        queryKey: [accountKey, "notifications"],
        predicate: (q) => q.queryKey[2] !== "preferences",
      });
      const changes = [...ids].map((id) =>
        optimisticNotificationRead(cache, accountKey, id),
      );
      try {
        const result = await api<{ count: number }>({
          path: "/api/v1/me/notifications/read-target",
          method: "POST",
          json: { target },
          signal: lifecycle.signal(),
        });
        changes.forEach((change) => change.commit());
        if (lifecycle.isCurrent() && result.data.count > 0)
          void cache.invalidateQueries({
            queryKey: [accountKey, "notifications"],
            predicate: (q) => q.queryKey[2] !== "preferences",
          });
      } catch {
        lastTargetFailure.current = { key, at: Date.now() };
        changes.forEach((change) => change());
        // A later poll or visibility change retries; passive reads never interrupt the user.
      } finally {
        pendingTargets.current.delete(key);
      }
    };
    void acknowledge();
    const onVisible = () => {
      void acknowledge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [
    target,
    accountKey,
    lifecycle,
    api,
    cache,
    count.data?.count,
    count.dataUpdatedAt,
  ]);
  const preferences = useQuery({
    enabled: open,
    queryKey: [...prefix, "preferences"],
    queryFn: async ({ signal }) =>
      (
        await api<Preferences>({
          path: "/api/v1/me/notification-preferences",
          signal,
        })
      ).data,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: prefix });
  useEffect(() => {
    setPage(1);
  }, [accountKey, unreadOnly]);
  useEffect(() => {
    if (MOCK_MODE) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && lifecycle.isCurrent();
    const refreshCurrent = () => {
      if (current())
        void cache.invalidateQueries({
          queryKey: [accountKey, "notifications"],
          predicate: (query) => query.queryKey[2] !== "preferences",
        });
    };
    const hub = new HubConnectionBuilder()
      .withUrl(`${apiBaseUrl()}/api/v1/notifications/hub`, {
        accessTokenFactory: async () =>
          (await lifecycle.accessToken({ signal: controller.signal })) ?? "",
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Error)
      .build();
    const signal = lifecycle.signal();
    const stop = () => {
      void hub.stop();
    };
    signal.addEventListener("abort", stop, { once: true });
    hub.on("NotificationCreated", (created: DurableNotification) => {
      refreshCurrent();
      if (current() && created && !created.readAt) arrived.current?.(created);
    });
    hub.on("UnreadCountChanged", refreshCurrent);
    const connected = () => {
      if (!current()) {
        stop();
        return;
      }
      setConnectedAccount(accountKey);
      refreshCurrent();
    };
    const disconnected = () => {
      if (current()) setConnectedAccount(null);
    };
    hub.onreconnecting(disconnected);
    hub.onclose(disconnected);
    hub.onreconnected(connected);
    void hub.start().then(connected).catch(disconnected);
    return () => {
      controller.abort();
      signal.removeEventListener("abort", stop);
      void hub.stop();
    };
  }, [account.slot, account.userId, accountKey, lifecycle, cache]);
  const pendingReads = useRef(0);
  const markRead = async (id?: string) => {
    if (!lifecycle.isCurrent()) return;
    pendingReads.current++;
    void cache.cancelQueries({
      queryKey: prefix,
      predicate: (query) => query.queryKey[2] !== "preferences",
    });
    const rollback = optimisticNotificationRead(cache, accountKey, id);
    try {
      await api({
        path: id
          ? `/api/v1/me/notifications/${id}/read`
          : "/api/v1/me/notifications/read-all",
        method: "POST",
        signal: lifecycle.signal(),
      });
      rollback.commit();
    } catch (error) {
      rollback();
      throw error;
    } finally {
      pendingReads.current--;
      if (lifecycle.isCurrent() && pendingReads.current === 0) void refresh();
    }
  };
  const rows = list.data?.items ?? [];
  const visible = rows.filter(
    (n) => !(n.type === "MessageCreated" && n.sourceId === activeConversation),
  );
  const hiddenUnread = rows.filter(
    (n) =>
      n.type === "MessageCreated" &&
      n.sourceId === activeConversation &&
      !n.readAt,
  ).length;
  return {
    items: visible,
    count: Math.max(0, (count.data?.count ?? 0) - hiddenUnread),
    loading: list.isPending,
    failed: list.isError,
    refresh,
    page,
    setPage,
    unreadOnly,
    setUnreadOnly,
    hasOlder: page * 25 < (list.data?.total ?? 0),
    preferences: preferences.data,
    read: (id: string) => markRead(id),
    readAll: () => markRead(),
    updatePreferences: async (value: Preferences) => {
      await api({
        path: "/api/v1/me/notification-preferences",
        method: "PATCH",
        json: value,
      });
      await refresh();
    },
  };
}
/**
 * Steps of a coaching collaboration (applications, invitations, the relationship itself) and forms a client sent
 * also pop up as a toast the moment they arrive, not only in the bell. Returns the toast tone, or null for no toast.
 */
const LIVE_TOASTS: Record<string, "success" | "neutral" | "warning"> = {
  ApplicationSubmitted: "neutral",
  ApplicationAccepted: "success",
  ApplicationRejected: "warning",
  InvitationReceived: "neutral",
  InvitationAccepted: "success",
  InvitationDeclined: "warning",
  InvitationRevoked: "warning",
  RelationshipActive: "success",
  RelationshipSuspended: "warning",
  RelationshipCompleted: "neutral",
  CheckInSubmitted: "neutral",
  CheckInReviewed: "success",
  "training.assigned": "success",
};
export function liveToast(type: string) {
  return LIVE_TOASTS[type] ?? null;
}

const TITLES: Record<string, string> = {
  ApplicationSubmitted: "A client sent you an application form",
  ApplicationAccepted: "Your coach accepted your application",
  ApplicationRejected: "Your application was not accepted",
  RelationshipActive: "Collaboration is active",
  RelationshipSuspended: "Collaboration paused",
  RelationshipCompleted: "Collaboration completed",
  CheckInSubmitted: "A client sent a check-in form",
  CheckInReviewed: "Your coach reviewed your check-in",
  MessageCreated: "Message received",
  MessageRequestCreated: "New message request",
  InvitationReceived: "Coaching invitation received",
  InvitationAccepted: "Invitation accepted",
  InvitationDeclined: "Invitation declined",
  InvitationRevoked: "Invitation revoked",
  PaymentDueSoon: "Payment due soon",
  CalendarInvitation: "New calendar event",
  "team.transfer.requested": "Team transfer requested",
  "team.transfer.decided": "Team transfer decided",
  "training.assigned": "Your coach assigned you a program",
  "training.completed": "Workout completed",
  "training.ending.last-block": "Client's plan: last block started",
  "training.ending.last-cycle": "Client's plan: last cycle started",
  "training.ending.last-week": "Client's plan ends in a week",
  "training.ending.last-workout": "Client's plan: last workout today",
  "documentation.shared": "Document shared with you",
};

export function notificationTitle(type: string) {
  const known = TITLES[type];
  if (known) return known;
  const words = type
    .replace(/[._]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}
