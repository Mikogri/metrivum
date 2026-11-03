import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Button, Option, Select, toast } from "@metrivum/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { useAccountContext } from "~/shared/session";
import { root, useChatQuery } from "./api";
import type { Conversation, Message } from "./model";
import styles from "./messaging.module.css";

/**
 * Pick one of your conversations and send a prepared text into it (e.g. a shared link).
 * Only conversations that currently accept messages are offered.
 */
export function SendToChat({ text, label, sentLabel, hint }: { text: string; label: string; sentLabel: string; hint?: string }) {
 const uiCopy = useUiCopy();

  const { api, accountKey, lifecycle } = useAccountContext();
  const cache = useQueryClient();
  const direct = useFeatureAccess("messaging.direct").allowed;
  const groups = useFeatureAccess("messaging.groups").allowed;
  const allowed = direct || groups;
  const list = useChatQuery<Conversation[]>(`${root}/conversations`, { search: "", limit: 100 }, allowed);
  const [conversation, setConversation] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const open = (list.data ?? []).filter((c) => c.canSendMessages);
  if (!allowed) return null;
  async function send() {
    if (!conversation || sending) return;
    setSending(true);
    setError("");
    try {
      await api<Message>({ method: "POST", path: `${root}/conversations/${conversation}/messages`, json: { type: "Text", body: text, replyToMessageId: null, mediaIds: [] }, idempotencyKey: key, signal: lifecycle.signal() });
      if (!lifecycle.isCurrent()) return;
      void cache.invalidateQueries({ queryKey: [accountKey, "messaging"] });
      toast({ tone: "success", title: sentLabel });
      setKey(crypto.randomUUID());
      setConversation("");
    } catch (e) {
      if (lifecycle.isCurrent()) setError(e instanceof Error ? e.message : "Could not send. Try again.");
    } finally {
      if (lifecycle.isCurrent()) setSending(false);
    }
  }
  return (
    <div className={styles.sendToChat}>
      <div className={styles.sendToChatRow}>
        <Select
          label={label}
          description={hint}
          placeholder={list.isPending ? uiCopy["ui"]["Loading conversations…"] : open.length ? uiCopy["ui"]["Choose a conversation"] : uiCopy["ui"]["No conversations yet"]}
          isDisabled={!open.length || sending}
          selectedKey={conversation || null}
          onSelectionChange={(k) => setConversation(String(k))}
          className={styles.sendToChatSelect}
        >
          {open.map((c) => <Option key={c.id} id={c.id}>{c.title}</Option>)}
        </Select>
        <Button variant="primary" loading={sending} isDisabled={!conversation} onPress={() => void send()}>
          {label}
        </Button>
      </div>
      {error ? <Alert tone="danger" live="assertive" title={error} /> : null}
    </div>
  );
}
