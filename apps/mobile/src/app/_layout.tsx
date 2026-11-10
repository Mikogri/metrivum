import { Stack } from "expo-router";
import { useEffect, useState, type PropsWithChildren } from "react";
import { Platform, StatusBar } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as SystemUI from "expo-system-ui";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import {
  ScreenChromeProvider,
  SheetBackdrop,
  SheetHost,
  ThemeProvider,
  ToastProvider,
  fonts,
  useTheme,
} from "@metrivum/ui-mobile";
import {
  MobileSession,
  useMobile,
} from "../infrastructure/session/MobileSession";
import { LocaleProvider, useI18n } from "../infrastructure/i18n";
import { Realtime } from "../infrastructure/networking/Realtime";

function Navigation() {
  const { profile } = useMobile();
  const theme = useTheme();
  const { t, applyProfileLocale } = useI18n();
  useEffect(
    () => applyProfileLocale(profile.locale),
    [profile.id, profile.locale, applyProfileLocale],
  );
  return (
    <>
      <Realtime />
      {/* The navigator is kept when the Coach/Client view changes: only the tabs of that view
                are swapped (see the tab layout), so the switch is immediate. */}
      <Stack
        screenLayout={({ children }) => (
          <ScreenChromeProvider underHeader>{children}</ScreenChromeProvider>
        )}
        screenOptions={{
          // The header sits on the page colour with no divider: the screen's own large
          // title carries the hierarchy, the bar only carries Back and a short label.
          headerStyle: { backgroundColor: theme.colors.background },
          headerShadowVisible: false,
          headerTintColor: theme.colors.text,
          headerTitleStyle: {
            fontFamily: fonts.semibold,
            fontSize: 15,
          },
          contentStyle: { backgroundColor: theme.colors.background },
          headerBackButtonDisplayMode: "minimal",
          // One horizontal push on both platforms; Android's default zoom is replaced.
          animation: Platform.OS === "android" ? "ios_from_right" : "default",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="profile"
          options={{
            title: t("settings.profile"),
            animation: "fade_from_bottom",
          }}
        />
        <Stack.Screen
          name="conversation/[id]"
          options={{ title: t("route.conversation") }}
        />
        <Stack.Screen
          name="workout/[id]"
          options={{ title: t("route.workout") }}
        />
        <Stack.Screen
          name="client/[id]"
          options={{ title: t("route.client") }}
        />
        <Stack.Screen
          name="check-in/[id]"
          options={{ title: t("route.checkIn") }}
        />
        <Stack.Screen name="plan/[id]" options={{ title: t("route.plan") }} />
        <Stack.Screen name="event/[id]" options={{ title: t("route.event") }} />
        <Stack.Screen
          name="notifications"
          options={{ title: t("route.notifications") }}
        />
        <Stack.Screen
          name="check-ins"
          options={{ title: t("route.checkIns") }}
        />
        <Stack.Screen name="team" options={{ title: t("route.team") }} />
        <Stack.Screen
          name="analysis"
          options={{ title: t("route.analysis") }}
        />
        <Stack.Screen name="coaches" options={{ title: t("route.coaches") }} />
        <Stack.Screen name="events" options={{ title: t("tabs.calendar") }} />
        <Stack.Screen
          name="training-plans"
          options={{ title: t("tabs.plans") }}
        />
        <Stack.Screen
          name="invitation/[id]"
          options={{ title: t("route.invitation") }}
        />
        <Stack.Screen
          name="application/[id]"
          options={{ title: t("route.application") }}
        />
        <Stack.Screen
          name="auth/callback"
          options={{ title: t("route.auth") }}
        />
      </Stack>
    </>
  );
}
function MobileTheme({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<"system" | "light" | "dark">("system");
  useEffect(() => {
    void SecureStore.getItemAsync("appearance").then((value) => {
      if (value === "light" || value === "dark") setMode(value);
    });
  }, []);
  return (
    <ThemeProvider
      initialMode={mode}
      onModeChange={(value) => {
        setMode(value);
        void SecureStore.setItemAsync("appearance", value);
      }}
    >
      {children}
    </ThemeProvider>
  );
}
/** Keeps system chrome in step with the theme: status bar icons and the window behind screens. */
function SystemChrome() {
  const theme = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(
      () => {},
    );
  }, [theme.colors.background]);
  return (
    <StatusBar
      barStyle={theme.dark ? "light-content" : "dark-content"}
      backgroundColor="transparent"
      translucent
    />
  );
}
export default function RootLayout() {
  // Text renders in the system face until the files are ready, then switches; nothing is blocked.
  useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold });
  return (
    <SafeAreaProvider>
      <MobileTheme>
        <SystemChrome />
        <LocaleProvider>
          <ToastProvider>
            <SheetBackdrop>
              <MobileSession>
                <Navigation />
              </MobileSession>
            </SheetBackdrop>
            <SheetHost />
          </ToastProvider>
        </LocaleProvider>
      </MobileTheme>
    </SafeAreaProvider>
  );
}
