import { Tabs } from "expo-router/tabs";
import { ScreenChromeProvider, useTheme } from "@metrivum/ui-mobile";
import { useI18n } from "../../infrastructure/i18n";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { HeaderProfile } from "../../features/shell/HeaderProfile";
import { FloatingTabBar, useTabBarInset } from "../../features/shell/TabBar";

export default function TabsLayout() {
  const { t } = useI18n();
  const { role } = useMobile();
  const theme = useTheme();
  const inset = useTabBarInset();
  const coach = role === "coach";
  return (
    <ScreenChromeProvider trailing={<HeaderProfile />} bottomInset={inset}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: "shift",
          sceneStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Tabs.Screen name="index" options={{ title: t("tabs.today") }} />
        {/* Guards add and remove the role's tabs in place: switching between the Coach and
                    Client view does not rebuild the navigator or the screens both views share. */}
        <Tabs.Protected guard={!coach}>
          <Tabs.Screen name="plans" options={{ title: t("tabs.plans") }} />
          <Tabs.Screen name="history" options={{ title: t("tabs.history") }} />
        </Tabs.Protected>
        <Tabs.Protected guard={coach}>
          <Tabs.Screen name="clients" options={{ title: t("tabs.clients") }} />
        </Tabs.Protected>
        <Tabs.Screen name="messages" options={{ title: t("tabs.messages") }} />
        <Tabs.Protected guard={coach}>
          <Tabs.Screen
            name="calendar"
            options={{ title: t("tabs.calendar") }}
          />
        </Tabs.Protected>
        <Tabs.Screen name="more" options={{ title: t("tabs.more") }} />
      </Tabs>
    </ScreenChromeProvider>
  );
}
