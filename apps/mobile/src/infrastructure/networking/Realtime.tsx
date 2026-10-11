import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { Schema } from "@trainflow/api-client-web";
import { router, usePathname } from "expo-router";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import {
    API_URL,
    retainedAccountTransport,
    useAccounts,
    useMobile,
} from "../session/MobileSession";
import { registerPush } from "./push";
import {
    validPush,
    webDestination,
    mobileDestination,
    parsePendingPush,
    isVisibleConversation,
    type PushIdentity,
} from "./links";

export function Realtime() {
    const { api, accountId, accountSignal, getAccessToken } = useMobile();
    const { accounts, switchAccount } = useAccounts();
    const cache = useQueryClient();
    const pathname = usePathname();
    const handledPushes = useRef(new Set<string>());
    const accountActions = useRef({ accounts, switchAccount });
    accountActions.current = { accounts, switchAccount };
    const retainedIdentities = accounts
        .map((account) => `${account.slot}:${account.session.user.id}`)
        .sort()
        .join(",");
    useEffect(() => {
        const target = webDestination(pathname);
        if (!target) return;
        const acknowledge = () => {
            if (AppState.currentState === "active")
                void api<{ count: number }>({
                    path: "/api/v1/me/notifications/read-target",
                    method: "POST",
                    json: { target },
                })
                    .then((result) => {
                        if (result.data.count)
                            void cache.invalidateQueries({
                                predicate: (query) =>
                                    String(query.queryKey[2] ?? "").includes(
                                        "/notifications",
                                    ),
                            });
                    })
                    .catch(() => {});
        };
        acknowledge();
        const subscription = AppState.addEventListener("change", acknowledge);
        return () => subscription.remove();
    }, [api, pathname, cache]);
    useEffect(() => {
        let stopped = false;
        const refresh = (history = true) => {
            if (
                !stopped &&
                !accountSignal.aborted &&
                AppState.currentState === "active"
            )
                void cache.invalidateQueries({
                    queryKey: [accountId],
                    predicate: (query) =>
                        (history && query.queryKey[1] === "mobile-messages") ||
                        (typeof query.queryKey[2] === "string" &&
                            (query.queryKey[2].startsWith(
                                "/api/v1/messaging",
                            ) ||
                                query.queryKey[2].startsWith(
                                    "/api/v1/me/notifications",
                                ))),
                });
        };
        const hubs = ["messaging", "notifications"].map((module) =>
            new HubConnectionBuilder()
                .withUrl(`${API_URL}/api/v1/${module}/hub`, {
                    accessTokenFactory: async () => {
                        if (accountSignal.aborted)
                            throw Error("Session ended.");
                        return (await getAccessToken()) || "";
                    },
                    withCredentials: false,
                })
                .withAutomaticReconnect([0, 2000, 5000, 15000])
                .configureLogging(LogLevel.None)
                .build(),
        );
        hubs.forEach((hub) => {
            [
                "MessageDeleted",
                "ConversationUpdated",
                "MembershipChanged",
                "MessageRequestCreated",
                "MessageRequestUpdated",
                "ReadMarkerChanged",
                "NotificationCreated",
                "UnreadCountChanged",
            ].forEach((event) =>
                hub.on(event, () =>
                    refresh(
                        event === "MessageDeleted" ||
                            event === "MembershipChanged",
                    ),
                ),
            );
            hub.onreconnected(() => refresh());
        });
        hubs[0]!.on("MessageCreated", async (message: Schema<"MessageDto">) => {
            if (stopped || accountSignal.aborted) return;
            const key = [accountId, "mobile-messages", message.conversationId];
            await cache.cancelQueries({ queryKey: key });
            if (stopped || accountSignal.aborted) return;
            cache.setQueryData<InfiniteData<Schema<"MessagePage">>>(
                key,
                (data) =>
                    data && {
                        ...data,
                        pages: data.pages.map((page, index) =>
                            index === 0
                                ? {
                                      ...page,
                                      items: [
                                          message,
                                          ...page.items.filter(
                                              (item) => item.id !== message.id,
                                          ),
                                      ],
                                  }
                                : {
                                      ...page,
                                      items: page.items.filter(
                                          (item) => item.id !== message.id,
                                      ),
                                  },
                        ),
                    },
            );
            refresh(false);
        });
        let transition = Promise.resolve();
        const update = (state: string) => {
            transition = transition
                .catch(() => {})
                .then(async () => {
                    for (const hub of hubs) {
                        if (
                            !stopped &&
                            !accountSignal.aborted &&
                            state === "active"
                        ) {
                            if (hub.state === "Disconnected")
                                await hub
                                    .start()
                                    .then(() => refresh())
                                    .catch(() => {});
                        } else await hub.stop();
                    }
                });
        };
        update(AppState.currentState);
        const subscription = AppState.addEventListener("change", (state) => {
            update(state);
            if (state === "active") refresh();
        });
        const stop = () => {
            stopped = true;
            update("background");
        };
        accountSignal.addEventListener("abort", stop, { once: true });
        // Bounded fallback also recovers a failed initial connection (SignalR only reconnects after a successful start).
        const fallback = setInterval(() => {
            if (AppState.currentState === "active") {
                refresh();
                update("active");
            }
        }, 60_000);
        return () => {
            stop();
            clearInterval(fallback);
            subscription.remove();
            accountSignal.removeEventListener("abort", stop);
        };
    }, [accountId, accountSignal, getAccessToken, cache]);
    useEffect(() => {
        const conversation = /^\/conversation\/([^/]+)$/.exec(pathname)?.[1];
        Notifications.setNotificationHandler({
            handleNotification: async (notification) => {
                const data = notification.request.content.data;
                const visible = isVisibleConversation(
                    data ?? {},
                    accountId,
                    conversation,
                );
                return {
                    shouldShowBanner: !visible,
                    shouldShowList: !visible,
                    shouldPlaySound: true,
                    shouldSetBadge: false,
                };
            },
        });
        const register = async (active: boolean) => {
            await Promise.allSettled(
                accounts.map((account) =>
                    registerPush(
                        retainedAccountTransport(account, accountSignal),
                        false,
                        active && account.session.user.id === accountId
                            ? conversation
                            : undefined,
                    ),
                ),
            );
        };
        void register(AppState.currentState === "active");
        const token = Notifications.addPushTokenListener(() => {
            void register(AppState.currentState === "active");
        });
        const refresh = setInterval(() => {
            if (AppState.currentState === "active") void register(true);
        }, 60_000);
        const background = AppState.addEventListener("change", (state) => {
            void register(state === "active");
        });
        return () => {
            clearInterval(refresh);
            token.remove();
            background.remove();
        };
        // Token rotation uses each retained identity's own Auth client, never the active account token.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshed JWTs do not change device identity bindings
    }, [api, pathname, accountId, accountSignal, retainedIdentities]);
    useEffect(() => {
        let active = true;
        const navigate = async (data: PushIdentity) => {
            try {
                const result = await api<Schema<"NotificationDto">>({
                    path: `/api/v1/me/notifications/${data.notificationId}`,
                });
                if (!active || accountSignal.aborted) return;
                const path = mobileDestination(result.data.deepLink);
                router.push((path ?? "/notifications") as "/notifications");
                // Receiving a push never marks it read; only opening its authorized destination does.
                if (path && result.data.type !== "MessageCreated")
                    void api({
                        path: `/api/v1/me/notifications/${data.notificationId}/read`,
                        method: "POST",
                    }).catch(() => {});
            } catch {
                if (active && !accountSignal.aborted)
                    router.push("/notifications");
            }
        };
        const open = async (response: Notifications.NotificationResponse) => {
            const data = response.notification.request.content.data;
            if (!active || !data || !validPush(data)) return;
            const target = accountActions.current.accounts.find(
                (account) => account.session.user.id === data.accountId,
            );
            if (!target) return;
            const key = `${data.accountId}:${data.notificationId}`;
            if (handledPushes.current.has(key)) return;
            handledPushes.current.add(key);
            await Notifications.clearLastNotificationResponseAsync();
            const identity = {
                accountId: String(data.accountId),
                notificationId: String(data.notificationId),
            };
            if (data.accountId !== accountId) {
                await SecureStore.setItemAsync(
                    "pending-push-account",
                    JSON.stringify(identity),
                );
                await accountActions.current.switchAccount(target.slot);
            } else await navigate(identity);
        };
        const listener = Notifications.addNotificationResponseReceivedListener(
            (response) => {
                void open(response).catch(() => {});
            },
        );
        void Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (response) return open(response);
            })
            .catch(() => {});
        void SecureStore.getItemAsync("pending-push-account")
            .then(async (value) => {
                const pending = parsePendingPush(value);
                if (active && pending?.accountId === accountId) {
                    await SecureStore.deleteItemAsync("pending-push-account");
                    await navigate(pending);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
            listener.remove();
        };
    }, [api, accountId, accountSignal]);
    return null;
}
