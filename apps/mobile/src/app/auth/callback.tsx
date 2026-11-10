import { router } from "expo-router";
import { Screen, Text, Button } from "@metrivum/ui-mobile";
import { useI18n } from "../../infrastructure/i18n";

/** MobileSession owns validation and code exchange, including cold-start links before login. */
export default function AuthCallbackRoute() {
  const { t } = useI18n();
  return (
    <Screen title={t("route.auth")}>
      <Text>{t("auth.callbackExplanation")}</Text>
      <Button
        title={t("common.continue")}
        onPress={() => router.replace("/(tabs)")}
      />
    </Screen>
  );
}
