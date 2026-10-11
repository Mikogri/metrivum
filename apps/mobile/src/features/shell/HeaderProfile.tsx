import { router } from "expo-router";
import { View } from "react-native";
import { Avatar, PressableScale, useTheme } from "@trainflow/ui-mobile";
import { useI18n } from "../../infrastructure/i18n";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { NavIcon } from "./NavIcon";

/**
 * Trailing controls of every tab screen title: notifications and the person's profile (account,
 * Coach/Client view, appearance, sign-out).
 */
export function HeaderProfile() {
    const theme = useTheme();
    const { t } = useI18n();
    const { profile } = useMobile();
    const unread = useApiQuery<{ count: number }>(
        "/api/v1/me/notifications/unread-count",
    );
    const count = unread.data?.count ?? 0;
    return (
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.xs,
            }}
        >
            <PressableScale
                accessibilityRole="button"
                accessibilityLabel={
                    count
                        ? `${t("route.notifications")}: ${count}`
                        : t("route.notifications")
                }
                hitSlop={6}
                scale={0.9}
                onPress={() => router.push("/notifications")}
                style={{
                    width: theme.control.md,
                    height: theme.control.md,
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <NavIcon name="bell" size={theme.icon.md} />
                {count ? (
                    <View
                        style={{
                            position: "absolute",
                            top: theme.spacing.sm,
                            right: theme.spacing.sm,
                            width: theme.spacing.sm,
                            height: theme.spacing.sm,
                            borderRadius: theme.spacing.xs,
                            backgroundColor: theme.colors.brand,
                            borderWidth: theme.hairline,
                            borderColor: theme.colors.background,
                        }}
                    />
                ) : null}
            </PressableScale>
            <PressableScale
                accessibilityRole="button"
                accessibilityLabel={`${t("settings.profile")}: ${profile.displayName}`}
                hitSlop={6}
                scale={0.92}
                onPress={() => router.push("/profile")}
            >
                <Avatar name={profile.displayName} size={theme.control.md - 4} />
            </PressableScale>
        </View>
    );
}
