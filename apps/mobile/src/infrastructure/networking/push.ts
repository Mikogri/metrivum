import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import type { Transport } from "@trainflow/api-client-web/transport";
let installation: Promise<string> | undefined;
export function installationId() {
    return (installation ??= (async () => {
        const previous = await SecureStore.getItemAsync("push-installation");
        if (previous) return previous;
        const id = Crypto.randomUUID();
        await SecureStore.setItemAsync("push-installation", id);
        return id;
    })());
}
export async function registerPush(
    api: Transport,
    requestPermission: boolean,
    activeConversationId?: string,
) {
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    if (!projectId) {
        if (requestPermission)
            throw Error(
                "Push requires the configured Expo project and platform credentials in a development build.",
            );
        return;
    }
    if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
            name: "Metrivum",
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    const permission = requestPermission
        ? await Notifications.requestPermissionsAsync()
        : await Notifications.getPermissionsAsync();
    if (!permission.granted) {
        if (requestPermission)
            throw Error("Notifications are disabled in system settings.");
        return;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
        .data;
    await api({
        path: `/api/v1/me/notifications/devices/${await installationId()}`,
        method: "PUT",
        json: {
            expoPushToken: token,
            platform: Platform.OS,
            enabled: true,
            activeConversationId: activeConversationId ?? null,
        },
    });
}
export async function revokePush(api: Transport) {
    const id = await SecureStore.getItemAsync("push-installation");
    if (id)
        await api({
            path: `/api/v1/me/notifications/devices/${id}`,
            method: "DELETE",
        });
}
