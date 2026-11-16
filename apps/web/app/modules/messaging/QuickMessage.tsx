import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  Button,
  Chip,
  ChipGroup,
  TextArea,
  toast,
} from "@portable-ui/react";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useAccountContext } from "~/shared/session";
import { root } from "./api";
import type { Message } from "./model";
import styles from "./QuickMessage.module.css";

export type QuickTemplate = { id: string; label: string; text: string };

/**
 * A short message to one person without leaving the page: pick a prepared text, adjust it and send it into your
 * direct conversation (created when there is none). When the person only accepts message requests, the draft
 * chat opens instead so the request can be sent there.
 */
export function QuickMessage({
  person,
  templates,
  title = "Message",
}: {
  person: Schema<"PersonDto">;
  templates: QuickTemplate[];
  title?: string;
}) {
  const uiCopy = useUiCopy();

  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const access = useFeatureAccess("messaging.direct");
  const [template, setTemplate] = useState(templates[0]?.id ?? "");
  const [text, setText] = useState(templates[0]?.text ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  if (!access.allowed) return null;
  const draftChat = () =>
    navigate(
      `/app/messages?${new URLSearchParams({ person: person.id, name: person.displayName, username: person.username ?? "" })}`,
    );

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      // The messaging service returns the existing direct pair before creating one.
      const conversation = (
        await api<Schema<"ConversationDto">>({
          method: "POST",
          path: `${root}/conversations/direct`,
          json: { userId: person.id },
          signal: lifecycle.signal(),
        })
      ).data;
      await api<Message>({
        method: "POST",
        path: `${root}/conversations/${conversation.id}/messages`,
        json: { type: "Text", body, replyToMessageId: null, mediaIds: [] },
        idempotencyKey: key,
        signal: lifecycle.signal(),
      });
      if (!lifecycle.isCurrent()) return;
      void cache.invalidateQueries({ queryKey: [accountKey, "messaging"] });
      toast({
        tone: "success",
        title: `Message sent to ${person.displayName}`,
        action: {
          label: uiCopy["ui"]["Open chat"],
          onAction: () =>
            navigate(`/app/messages?conversation=${conversation.id}`),
        },
      });
      setKey(crypto.randomUUID());
    } catch (caught) {
      if (!lifecycle.isCurrent()) return;
      if (
        caught instanceof ApiError &&
        caught.code === "MESSAGE_REQUEST_REQUIRED"
      )
        draftChat();
      else
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not send. Try again.",
        );
    } finally {
      if (lifecycle.isCurrent()) setSending(false);
    }
  }

  return (
    <section
      className={styles.quick}
      aria-label={`${title} ${person.displayName}`}
    >
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true">
          <MessageCircle />
        </span>
        <div className={styles.headText}>
          <strong>
            {title} {person.displayName}
          </strong>
          {person.username ? <span>@{person.username}</span> : null}
        </div>
      </header>
      {templates.length > 1 ? (
        <ChipGroup
          aria-label={uiCopy["ui"]["Message templates"]}
          disallowEmptySelection
          selectedKeys={[template]}
          onSelectionChange={(keys) => {
            const next = templates.find((item) => keys.has(item.id));
            if (!next) return;
            setTemplate(next.id);
            setText(next.text);
          }}
        >
          {templates.map((item) => (
            <Chip key={item.id} id={item.id}>
              {item.label}
            </Chip>
          ))}
        </ChipGroup>
      ) : null}
      <TextArea
        aria-label={formatInterfaceText(uiCopy["ui"]["Message to {0}"], [
          person.displayName,
        ])}
        value={text}
        onChange={setText}
        maxLength={4000}
        isDisabled={sending}
      />
      {error ? <Alert tone="danger" live="assertive" title={error} /> : null}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          onPress={draftChat}
          isDisabled={sending}
        >
          {uiCopy["ui"]["Open chat"]}
        </Button>
        <Button
          size="sm"
          variant="primary"
          iconStart={<Send />}
          loading={sending}
          isDisabled={!text.trim()}
          onPress={() => void send()}
        >
          {uiCopy["ui"]["Send"]}
        </Button>
      </div>
    </section>
  );
}
