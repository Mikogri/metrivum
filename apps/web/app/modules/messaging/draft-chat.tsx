import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useEffect, useState } from "react";
import { ArrowLeft, SendHorizontal } from "lucide-react";
import { useBlocker } from "react-router";
import { AlertDialog, Button, IconButton, Spinner } from "@metrivum/ui-web";
import { useAccountContext, useUnsavedWorkGuard } from "~/shared/session";
import { root, useChatQuery } from "./api";
import { Failure, useChatAction } from "./messages";
import type { ChatPerson } from "./dialogs";
import type { LocalOutgoing, Request } from "./model";
import styles from "./messaging.module.css";

/** Opening this pane sends nothing. Only submitting the first message notifies the recipient. */
export function DraftChat({ person, back, open }: { person: ChatPerson; back: () => void; open: (id: string) => void }) {
  const uiCopy = useUiCopy();

  const { account } = useAccountContext();
  const requests = useChatQuery<Request[]>(`${root}/requests`);
  const [body, setBody] = useState("");
  const [outgoing, setOutgoing] = useState<LocalOutgoing | null>(null);
  const [sent, setSent] = useState<Request | null>(null);
  const request = (sent ? requests.data?.find(r => r.id === sent.id && r.state !== "Pending") ?? sent : requests.data?.find(r => (r.senderUserId === person.userId || r.recipientUserId === person.userId) && (r.state === "Pending" || r.state === "Accepted")));
  const action = useChatAction<Request>(value => { setSent(value); setBody(""); setOutgoing(null); });
  const dirty = Boolean(body.trim() || action.isPending);
  useUnsavedWorkGuard(() => dirty);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  useEffect(() => { if (request?.conversationId) open(request.conversationId); }, [request, open]);
  const incoming = request?.recipientUserId === account.userId;
  function send() {
    if (!body.trim() || action.isPending || request || !requests.isSuccess) return;
    const text = body.trim();
    setOutgoing({ body: text, status: "Sending…" });
    setBody("");
    action.mutate({ method: "POST", path: `${root}/requests`, json: { userId: person.userId, body: text } }, {
      onError: () => { setOutgoing({ body: text, status: "Not sent — retry below" }); setBody(text); }
    });
  }
  return <section className={styles.thread} aria-label={person.displayName}>
    <AlertDialog isOpen={blocker.state === "blocked"} onOpenChange={open => { if (!open && blocker.state === "blocked") blocker.reset(); }} title={uiCopy["ui"]["Discard this draft?"]} tone="danger" confirmLabel={uiCopy["ui"]["Discard draft"]} cancelLabel={uiCopy["ui"]["Keep writing"]} onConfirm={() => { if (blocker.state === "blocked") blocker.proceed(); }}>{uiCopy["ui"]["Your message has not been sent yet. If you leave now, the draft is deleted and the person never sees it."]}</AlertDialog>
    <header className={styles.threadHeader}>
      <IconButton label={uiCopy["ui"]["Back to conversations"]} icon={<ArrowLeft />} variant="ghost" onPress={back} />
      <div className={styles.threadTitle}><strong>{person.displayName}</strong><small>@{person.username}</small></div>
    </header>
    <div className={styles.messages}><div className={styles.messagesInner}>
      {requests.isPending ? <Spinner label={uiCopy["ui"]["Loading conversation"]} /> : requests.error ? <Failure error={requests.error} retry={() => void requests.refetch()} /> : request ? <>
        <article className={styles.message} data-mine={!incoming || undefined}><div className={styles.messageBody}><div className={styles.bubble}>{request.body}</div>{!incoming ? <span className={styles.meta}>{uiCopy["ui"]["Sent"]}</span> : null}</div></article>
        <p className={styles.hint}>{request.state !== "Pending" ? `Request ${request.state.toLowerCase()}.` : incoming ? uiCopy["ui"]["Accept to continue the conversation."] : uiCopy["ui"]["Message sent. You can continue when they accept."]}</p>
        {incoming && request.state === "Pending" ? <div className={styles.actions}>{["accept", "decline"].map(operation => <Button key={operation} loading={action.isPending} onPress={() => action.mutate({ method: "POST", path: `${root}/requests/${request.id}/${operation}` })}>{operation === "accept" ? uiCopy["ui"]["Accept"] : uiCopy["ui"]["Decline"]}</Button>)}</div> : null}
      </> : <p className={styles.hint}>{uiCopy["ui"]["Send your first message here. If they require approval, you can continue after they accept."]}</p>}
      {outgoing && !request ? <article className={styles.message} data-mine="true" aria-label={uiCopy["ui"]["Outgoing message"]}><div className={styles.messageBody}><div className={styles.bubble}>{outgoing.body}</div><span className={styles.meta} role="status">{outgoing.status}</span></div></article> : null}
    </div></div>
    {<form className={styles.composer} onSubmit={event => { event.preventDefault(); send(); }}>
      <div className={styles.composerBox}><div className={styles.composerRow}>
        <textarea aria-label={uiCopy["profile"]["message"]} placeholder={uiCopy["ui"]["Send message…"]} rows={1} maxLength={2000} value={body} disabled={Boolean(request) || action.isPending} onChange={event => { setBody(event.target.value); setOutgoing(null); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <button className={styles.send} type="submit" aria-label={uiCopy["ui"]["Send"]} disabled={Boolean(request) || !body.trim() || action.isPending || !requests.isSuccess}>{action.isPending ? <Spinner size="sm" label={uiCopy["ui"]["Sending"]} /> : <SendHorizontal />}</button>
      </div></div>
    </form>}
    {action.error ? <Failure error={action.error} /> : null}
  </section>;
}
