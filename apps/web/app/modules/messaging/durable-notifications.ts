import { useEffect, useState } from "react";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountContext, useApi } from "~/shared/session";
import { apiBaseUrl } from "~/shared/http";
import { MOCK_MODE } from "~/shared/dev/mockMode";
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
};
type Page = {
    items: DurableNotification[];
    page: number;
    pageSize: number;
    total: number;
};
export function useDurableNotifications(activeConversation: string | null, open: boolean) {
    const api = useApi();
    const cache = useQueryClient();
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
                accessTokenFactory: async () => (await lifecycle.accessToken({ signal: controller.signal })) ?? "",
            })
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Error)
            .build();
        const signal = lifecycle.signal();
        const stop = () => { void hub.stop(); };
        signal.addEventListener("abort", stop, { once: true });
        hub.on("NotificationCreated", refreshCurrent);
        hub.on("UnreadCountChanged", refreshCurrent);
        const connected = () => {
            if (!current()) { stop(); return; }
            setConnectedAccount(accountKey);
            refreshCurrent();
        };
        const disconnected = () => {
            if (current()) setConnectedAccount(null);
        };
        hub.onreconnecting(disconnected);
        hub.onclose(disconnected);
        hub.onreconnected(connected);
        void hub
            .start()
            .then(connected)
            .catch(disconnected);
        return () => {
            controller.abort();
            signal.removeEventListener("abort", stop);
            void hub.stop();
        };
    }, [account.slot, account.userId, accountKey, lifecycle, cache]);
    const rows = list.data?.items ?? [];
    const visible = rows.filter(
        (n) =>
            !(n.type === "MessageCreated" && n.sourceId === activeConversation),
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
        read: async (id: string) => {
            await api({
                path: `/api/v1/me/notifications/${id}/read`,
                method: "POST",
            });
            await refresh();
        },
        readAll: async () => {
            await api({
                path: "/api/v1/me/notifications/read-all",
                method: "POST",
            });
            await refresh();
        },
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
export function notificationTitle(type: string) {
    return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}
