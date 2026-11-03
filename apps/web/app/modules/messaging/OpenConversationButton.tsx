import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import { useNavigate } from "react-router";
import { MessageCircle } from "lucide-react";
import { Button } from "@metrivum/ui-web";
import type { Schema } from "@metrivum/api-client-web";
import { useAccountContext } from "~/shared/session";
import { useFeatureAccess } from "~/shared/access";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { ApiError } from "~/shared/http";

export function OpenConversationButton({ person }: { person: Schema<"PersonDto"> }) {
  const uiCopy = useUiCopy();

  const { api, lifecycle } = useAccountContext();
  const navigate = useNavigate();
  const access = useFeatureAccess("messaging.direct");
  const [pending, setPending] = useState(false);
  const showError = useErrorToast();
  async function open() {
    if (pending) return;
    setPending(true);
    try {
      // The messaging service resolves the existing direct pair before creating a conversation.
      const response = await api<Schema<"ConversationDto">>({ method: "POST", path: "/api/v1/messaging/conversations/direct", json: { userId: person.id } });
      if (lifecycle.isCurrent()) navigate(`/app/messages?conversation=${response.data.id}`);
    } catch (error) {
      if (!lifecycle.isCurrent()) return;
      if (error instanceof ApiError && error.code === "MESSAGE_REQUEST_REQUIRED") {
        navigate(`/app/messages?${new URLSearchParams({ person: person.id, name: person.displayName, username: person.username ?? "" })}`);
      } else showError(error, "Could not open conversation");
    } finally { if (lifecycle.isCurrent()) setPending(false); }
  }
  return access.allowed ? <Button iconStart={<MessageCircle />} loading={pending} onPress={() => void open()}>{uiCopy["profile"]["message"]}</Button> : null;
}
