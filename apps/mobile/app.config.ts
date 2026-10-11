import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
    name: "TrainFlow",
    slug: "trainflow",
    scheme: "trainflow",
    version: "0.1.0",
    orientation: "default",
    userInterfaceStyle: "automatic",
    platforms: ["ios", "android"],
    ios: { bundleIdentifier: "com.trainflow.app", supportsTablet: true },
    android: { package: "com.trainflow.app", allowBackup: false },
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
                    "Allow TrainFlow to record voice messages.",
            },
        ],
        [
            "expo-image-picker",
            {
                photosPermission:
                    "Choose a photo or video to share in TrainFlow.",
            },
        ],
    ],
    extra: {
        eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined },
    },
};
export default config;
