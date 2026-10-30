import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
    name: "Metrivum",
    icon: "./assets/brand/icon.png",
    slug: "trainflow",
    scheme: "trainflow",
    version: "0.1.0",
    orientation: "default",
    userInterfaceStyle: "automatic",
    platforms: ["ios", "android"],
    ios: { bundleIdentifier: "com.trainflow.app", supportsTablet: true },
    android: {
        package: "com.trainflow.app",
        allowBackup: false,
        adaptiveIcon: {
            foregroundImage: "./assets/brand/adaptive-icon.png",
            backgroundColor: "#0d0f0e",
        },
    },
    plugins: [
        "./plugins/withAndroidShortCxx.cjs",
        "expo-router",
        ["expo-secure-store", { configureAndroidBackup: true }],
        ["expo-sqlite", { useSQLCipher: true }],
        "expo-notifications",
        [
            "expo-audio",
            {
                microphonePermission:
                    "Allow Metrivum to record voice messages.",
            },
        ],
        [
            "expo-image-picker",
            {
                photosPermission:
                    "Choose a photo or video to share in Metrivum.",
            },
        ],
    ],
    extra: {
        eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined },
    },
};
export default config;
