import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import {
    Button,
    EmptyState,
    ErrorState,
    ListItem,
    LoadingState,
    Screen,
    Section,
    useTheme,
    type IconName,
} from "@metrivum/ui-mobile";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { mobileDestination } from "../../infrastructure/networking/links";
import { formatDateTime, humanize } from "../shared/format";
import { Pagination } from "../training/components";

type Notification = {
    id: string;
    type: string;
    deepLink: string | null;
    createdAt: string;
    readAt: string | null;
};
const pageSize = 25;
const iconFor = (type: string): IconName =>
    /message/i.test(type)
        ? "messages"
        : /checkin/i.test(type)
          ? "checkIn"
          : /workout|training|assignment/i.test(type)
            ? "workout"
            : /payment|billing|order/i.test(type)
              ? "payments"
              : "notifications";

export function NotificationsScreen() {
 const nativeCopy = useNativeCopy().t;

    const { api } = useMobile();
    const theme = useTheme();
    const [page, setPage] = useState(1);
    const [read, setRead] = useState(new Set<string>());
    const [error, setError] = useState<unknown>();
    const [busy, setBusy] = useState(false);
    const query = useApiQuery<{ items: Notification[]; total: number }>(
        "/api/v1/me/notifications",
        { page, pageSize },
    );
    async function open(item: Notification) {
        setRead((previous) => new Set(previous).add(item.id));
        try {
            await api({
                path: `/api/v1/me/notifications/${item.id}/read`,
                method: "POST",
            });
            const path = mobileDestination(item.deepLink);
            if (path) router.push(path as "/notifications");
        } catch (failure) {
            setRead((previous) => {
                const next = new Set(previous);
                next.delete(item.id);
                return next;
            });
            setError(failure);
        }
    }
    const hasUnread = query.data?.items.some(
        (item) => !item.readAt && !read.has(item.id),
    );
    return (
        <Screen
            title={nativeCopy("interface.Notifications")}
            actions={
                hasUnread ? (
                    <View style={{ flexDirection: "row" }}>
                        <Button
                            size="sm"
                            icon="read"
                            title={nativeCopy("interface.Mark all as read")}
                            loading={busy}
                            onPress={async () => {
                                setBusy(true);
                                try {
                                    await api({
                                        path: "/api/v1/me/notifications/read-all",
                                        method: "POST",
                                    });
                                    await query.refetch();
                                } catch (failure) {
                                    setError(failure);
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        />
                    </View>
                ) : undefined
            }
        >
            {!!error && <ErrorState error={error} />}
            {query.isPending ? (
                <LoadingState />
            ) : query.error ? (
                <ErrorState
                    error={query.error}
                    retry={() => void query.refetch()}
                />
            ) : query.data?.items.length ? (
                <Section>
                    {query.data.items.map((item) => {
                        const unread = !item.readAt && !read.has(item.id);
                        return (
                            <ListItem
                                key={item.id}
                                icon={iconFor(item.type)}
                                title={
                                    item.type === "MessageCreated"
                                        ? nativeCopy("interface.Message received")
                                        : humanize(item.type)
                                }
                                subtitle={formatDateTime(item.createdAt)}
                                trailing={
                                    unread ? (
                                        <View
                                            accessibilityLabel={nativeCopy("interface.Unread")}
                                            style={{
                                                width: 8,
                                                height: 8,
                                                borderRadius: 4,
                                                backgroundColor:
                                                    theme.colors.brand,
                                            }}
                                        />
                                    ) : undefined
                                }
                                onPress={() => void open(item)}
                            />
                        );
                    })}
                    <Pagination
                        data={{
                            items: query.data.items,
                            page,
                            pageSize,
                            total: query.data.total,
                        }}
                        onChange={setPage}
                    />
                </Section>
            ) : (
                <EmptyState
                    icon="notifications"
                    title={nativeCopy("interface.No notifications")}
                    description={nativeCopy("interface.Messages, check-ins and coaching updates appear here.")}
                />
            )}
        </Screen>
    );
}
