import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import type { Schema } from "@trainflow/api-client-web";
import {
    Avatar,
    Badge,
    Button,
    ErrorState,
    Field,
    Icon,
    ListItem,
    LoadingState,
    PressableScale,
    Screen,
    Section,
    SegmentedControl,
    Switch,
    Text,
    confirm,
    useTheme,
} from "@trainflow/ui-mobile";
import {
    useAccounts,
    useMobile,
} from "../../infrastructure/session/MobileSession";
import {
    useApiMutation,
    useApiQuery,
} from "../../infrastructure/networking/queries";
import { registerPush } from "../../infrastructure/networking/push";
import { useI18n } from "../../infrastructure/i18n";
import type { Locale } from "../../infrastructure/i18n/messages";
import { StatusBadge, formatDay } from "../shared/format";
import { NavIcon, type NavIconName } from "../shell/NavIcon";

type TileProps = {
    icon: NavIconName;
    title: string;
    badge?: number;
    onPress: () => void;
};
function Tile({ icon, title, badge, onPress }: TileProps) {
    const theme = useTheme();
    return (
        <PressableScale
            accessibilityRole="button"
            accessibilityLabel={badge ? `${title}: ${badge}` : title}
            onPress={onPress}
            style={{
                flex: 1,
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radii.lg,
                backgroundColor: theme.colors.surface,
            }}
        >
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <View
                    style={{
                        width: theme.control.md,
                        height: theme.control.md,
                        borderRadius: theme.radii.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.colors.selected,
                    }}
                >
                    <NavIcon name={icon} size={theme.icon.md} />
                </View>
                {badge ? <Badge tone="brand">{badge}</Badge> : null}
            </View>
            <Text variant="bodyStrong">{title}</Text>
        </PressableScale>
    );
}

/** The "More" tab: the features that have no tab of their own. Account settings are in Profile. */
export function MoreScreen() {
    const { role } = useMobile();
    const theme = useTheme();
    const { t } = useI18n();
    const unread = useApiQuery<{ count: number }>(
        "/api/v1/me/notifications/unread-count",
    );
    const tiles: TileProps[] = [
        {
            icon: "checkins",
            title: t("route.checkIns"),
            onPress: () => router.push("/check-ins"),
        },
        {
            icon: "bell",
            title: t("route.notifications"),
            badge: unread.data?.count || undefined,
            onPress: () => router.push("/notifications"),
        },
        // The Coach view has Calendar as a tab.
        ...(role === "coach"
            ? []
            : [
                  {
                      icon: "calendar" as const,
                      title: t("tabs.calendar"),
                      onPress: () => router.push("/events"),
                  },
              ]),
        {
            icon: "invitations",
            title: t("settings.coaches"),
            onPress: () => router.push("/coaches"),
        },
        {
            icon: "clients",
            title: t("route.team"),
            onPress: () => router.push("/team"),
        },
        {
            icon: "analysis",
            title: t("route.analysis"),
            onPress: () => router.push("/analysis"),
        },
    ];
    const rows: TileProps[][] = [];
    for (let index = 0; index < tiles.length; index += 2)
        rows.push(tiles.slice(index, index + 2));
    const gap = theme.spacing.sm + theme.spacing.xs;
    return (
        <Screen title={t("tabs.more")}>
            <View style={{ gap }}>
                {rows.map((row) => (
                    <View key={row[0]!.title} style={{ flexDirection: "row", gap }}>
                        {/* Plain equal columns: a lone last tile keeps the column width. */}
                        {row.map((tile) => (
                            <View key={tile.title} style={{ flex: 1 }}>
                                <Tile {...tile} />
                            </View>
                        ))}
                        {row.length === 1 && <View style={{ flex: 1 }} />}
                    </View>
                ))}
            </View>
            <Section>
                <ListItem
                    leading={<NavIcon name="settings" tone="mutedText" />}
                    title={t("settings.profile")}
                    onPress={() => router.push("/profile")}
                />
            </Section>
        </Screen>
    );
}

/** Account, Coach/Client view, language, appearance, notification settings and sign-out. */
export function ProfileScreen() {
    const { profile, role, setRole, api, refreshProfile } = useMobile();
    const accounts = useAccounts();
    const theme = useTheme();
    const { t, setLocale: persistLocale } = useI18n();
    const [name, setName] = useState(profile.displayName);
    const [locale, setLocale] = useState(profile.locale);
    const [error, setError] = useState<unknown>();
    const [pushBusy, setPushBusy] = useState(false);
    const subscription = useApiQuery<Schema<"PlatformSubscriptionDto">>(
        "/api/v1/me/platform-subscription",
    );
    const dues = useApiQuery<{
        items: Schema<"PaymentDueDto">[];
        total: number;
    }>("/api/v1/me/payment-dues", { page: 1, pageSize: 10 });
    const preferences = useApiQuery<{
        messaging: boolean;
        checkIns: boolean;
        coaching: boolean;
        system: boolean;
    }>("/api/v1/me/notification-preferences");
    const mutation = useApiMutation(async () => {
        await refreshProfile();
    });
    const messagePrivacy = useApiQuery<Schema<"MessagingPreferenceDto">>("/api/v1/me/messaging-preferences");
    const saveMessagePrivacy = useApiMutation(() => { void messagePrivacy.refetch(); });
    const selectLocale = async (next: Locale) => {
        try {
            await persistLocale(next);
            setLocale(next);
        } catch (failure) {
            setError(failure);
        }
    };
    const profileChanged =
        name.trim() !== profile.displayName || locale !== profile.locale;
    return (
        <Screen
            title={profile.displayName}
            subtitle={`@${profile.username}`}
            headerAction={<Avatar name={profile.displayName} size={48} />}
        >
            {profile.contexts.includes("Coach") && (
                <SegmentedControl
                    label={t("settings.currentView", {
                        role: t(role === "coach" ? "role.coach" : "role.client"),
                    })}
                    value={role}
                    options={[
                        { value: "coach", label: t("role.coach") },
                        { value: "client", label: t("role.client") },
                    ]}
                    onChange={setRole}
                />
            )}

            <Section title={t("settings.profile")}>
                <Field
                    label={t("settings.fullName")}
                    value={name}
                    onChangeText={setName}
                />
                <View style={{ gap: theme.spacing.xs + 2 }}>
                    <Text variant="label" tone="mutedText">
                        {t("settings.language")}
                    </Text>
                    <SegmentedControl
                        label={t("settings.language")}
                        value={locale === "pl" ? "pl" : "en"}
                        options={[
                            { value: "en", label: "English" },
                            { value: "pl", label: "Polski" },
                        ]}
                        onChange={(next) => void selectLocale(next)}
                    />
                </View>
                {profileChanged && (
                    <Button
                        tone="primary"
                        title={t("settings.save")}
                        loading={mutation.isPending}
                        disabled={!name.trim()}
                        onPress={() =>
                            mutation.mutate({
                                path: "/api/v1/me",
                                method: "PATCH",
                                ifMatch: profile.version,
                                json: {
                                    displayName: name,
                                    locale,
                                    timeZone: profile.timeZone,
                                },
                            })
                        }
                    />
                )}
            </Section>

            <Section title={t("settings.appearance")}>
                <SegmentedControl
                    label={t("settings.appearance")}
                    value={theme.mode}
                    options={(["system", "light", "dark"] as const).map(
                        (mode) => ({ value: mode, label: t(`theme.${mode}`) }),
                    )}
                    onChange={theme.setMode}
                />
            </Section>

            <Section title="Message privacy">
                <Text tone="mutedText">Anyone can message you by default. Require approval for new conversations; accepted chats stay open.</Text>
                {messagePrivacy.data && <ListItem title="Require approval" trailing={<Switch accessibilityLabel="Require approval for new conversations" value={messagePrivacy.data.requireApproval} disabled={saveMessagePrivacy.isPending} onValueChange={requireApproval => saveMessagePrivacy.mutate({ method: "PUT", path: "/api/v1/me/messaging-preferences", json: { requireApproval } })} />} />}
                {messagePrivacy.isPending && <LoadingState />}
                {messagePrivacy.error && <ErrorState error={messagePrivacy.error} retry={() => void messagePrivacy.refetch()} />}
                {saveMessagePrivacy.error && <ErrorState error={saveMessagePrivacy.error} />}
            </Section>
            <Section title={t("route.notifications")}>
                {preferences.data &&
                    (
                        ["messaging", "checkIns", "coaching", "system"] as const
                    ).map((key) => (
                        <ListItem
                            key={key}
                            title={t(`notification.${key}`)}
                            trailing={
                                <Switch
                                    accessibilityLabel={t(
                                        `notification.${key}`,
                                    )}
                                    value={preferences.data[key]}
                                    disabled={mutation.isPending}
                                    onValueChange={(value) =>
                                        mutation.mutate({
                                            path: "/api/v1/me/notification-preferences",
                                            method: "PATCH",
                                            json: {
                                                ...preferences.data,
                                                [key]: value,
                                            },
                                        })
                                    }
                                />
                            }
                        />
                    ))}
                {preferences.error && <ErrorState error={preferences.error} />}
                <ListItem
                    icon="notifications"
                    title={t("settings.enablePush")}
                    onPress={
                        pushBusy
                            ? undefined
                            : async () => {
                                  setPushBusy(true);
                                  try {
                                      await registerPush(api, true);
                                  } catch (failure) {
                                      setError(failure);
                                  } finally {
                                      setPushBusy(false);
                                  }
                              }
                    }
                />
            </Section>

            <Section title={t("settings.subscription")}>
                {subscription.error ? (
                    <ErrorState error={subscription.error} />
                ) : (
                    <View
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: theme.spacing.sm,
                        }}
                    >
                        <Text variant="bodyStrong">
                            {subscription.data
                                ? subscription.data.planId
                                : t("settings.loadingSubscription")}
                        </Text>
                        {subscription.data && (
                            <StatusBadge status={subscription.data.status} />
                        )}
                    </View>
                )}
                <Text variant="caption" tone="mutedText">
                    {t("settings.readOnlyBilling")}
                </Text>
                {dues.data?.items.map((due) => (
                    <ListItem
                        key={due.id}
                        icon="payments"
                        title={`${due.amount} ${due.currency}`}
                        subtitle={formatDay(due.dueAt)}
                        trailing={<StatusBadge status={due.status} />}
                    />
                ))}
                {dues.error && <ErrorState error={dues.error} />}
            </Section>

            <Section title={t("settings.accounts")}>
                {accounts.accounts.map((account) => (
                    <ListItem
                        key={account.slot}
                        icon="person"
                        title={account.session.user.email ?? ""}
                        trailing={
                            account.slot === accounts.active ? (
                                <Icon name="check" tone="brand" />
                            ) : undefined
                        }
                        onPress={
                            account.slot === accounts.active
                                ? undefined
                                : () => accounts.switchAccount(account.slot)
                        }
                    />
                ))}
                {accounts.accounts.length < 3 && (
                    <ListItem
                        icon="personAdd"
                        title={t("settings.addAccount")}
                        onPress={accounts.addAccount}
                    />
                )}
                <ListItem
                    icon="logout"
                    tone="danger"
                    title={t("settings.removeAccount")}
                    trailing={<View />}
                    onPress={async () => {
                        if (
                            await confirm(
                                t("settings.signOutTitle"),
                                t("settings.signOutWarning"),
                                t("auth.signOut"),
                            )
                        )
                            await accounts.signOut();
                    }}
                />
                {accounts.accounts.length > 1 && <ListItem icon="logout" tone="danger" title={t("auth.signOutAll")} onPress={async () => {
                    if (await confirm(t("settings.signOutTitle"), t("settings.signOutWarning"), t("auth.signOutAll"))) {
                        try { await accounts.signOutAll(); } catch (failure) { setError(failure); }
                    }
                }} />}
            </Section>
            {!!(error || mutation.error) && (
                <ErrorState error={error || mutation.error} />
            )}
        </Screen>
    );
}
