import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDialog, Button, Dialog, LoadingState, Switch, TextField, toast } from "@metrivum/ui-web";
import { SendToChat } from "~/modules/messaging";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { createShare, getShare, revokeShare, shareUrl } from "../api";
import styles from "./ShareAnalysisDialog.module.css";

/**
 * Share a completed analysis: create its read-only link once, then copy it or send it into a chat.
 * The link can be switched off again; it then stops working for everyone who has it.
 */
export function ShareAnalysisDialog({ analysisId, name, onClose }: { analysisId: string; name: string; onClose: () => void }) {
  const m = useT();
  const t = m.video.share;
  const api = useApi();
  const a = useAccountKey();
  const cache = useQueryClient();
  const key = [a, "video", "share", analysisId];
  const current = useQuery({ queryKey: key, queryFn: ({ signal }) => getShare(api, analysisId, signal) });
  const create = useMutation({ mutationFn: (allowSave?: boolean) => createShare(api, analysisId, allowSave), onSuccess: (share) => cache.setQueryData(key, share) });
  const revoke = useMutation({
    mutationFn: () => revokeShare(api, analysisId),
    onSuccess: () => {
      cache.setQueryData(key, null);
      setConfirm(false);
      toast({ tone: "success", title: t.revoked });
    },
  });
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = current.data ? shareUrl(current.data.token) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ tone: "success", title: t.copied, duration: 2500 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ tone: "danger", title: t.copyFailed });
    }
  }

  return (
    <Dialog isOpen title={t.title} description={name} onOpenChange={(open) => { if (!open) onClose(); }} size="md">
      <div className={styles.body}>
        <p className={styles.intro}>{t.intro}</p>
        {current.isPending ? (
          <LoadingState size="sm" />
        ) : current.isError ? (
          <Alert tone="danger" live="assertive" title={errorText(m, current.error)} actions={<Button size="sm" onPress={() => void current.refetch()}>{m.common.retry}</Button>} />
        ) : !current.data ? (
          <>
            {create.error ? <Alert tone="danger" live="assertive" title={errorText(m, create.error)} /> : null}
            <Button variant="primary" iconStart={<Link2 />} loading={create.isPending} onPress={() => create.mutate(undefined)} className={styles.create}>
              {t.create}
            </Button>
          </>
        ) : (
          <>
            <div className={styles.linkRow}>
              <TextField label={t.link} value={url} isReadOnly className={styles.link} onFocus={(event) => (event.target as HTMLInputElement).select()} />
              <Button iconStart={copied ? <Check /> : <Copy />} onPress={() => void copy()}>{t.copy}</Button>
            </div>
            <Switch isSelected={Boolean(current.data.allowSave)} isDisabled={create.isPending} onChange={(allow) => create.mutate(allow)}>
              Let people keep it in their library
            </Switch>
            <p className={styles.intro}>{current.data.allowSave
              ? "People with the link can save it to their own library. It stays one analysis: they see it through this link, and it disappears for them if you switch the link off."
              : "People with the link can only view it."}</p>
            <div className={styles.divider} role="presentation" />
            <SendToChat text={t.message(name, url)} label={t.chat} sentLabel={t.sent} hint={t.chatHint} />
            <div className={styles.footer}>
              <Button variant="danger-ghost" size="sm" iconStart={<Link2Off />} onPress={() => setConfirm(true)}>{t.revoke}</Button>
            </div>
          </>
        )}
      </div>
      <AlertDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        tone="danger"
        title={t.revokeTitle}
        confirmLabel={t.revoke}
        cancelLabel={m.common.cancel}
        isConfirming={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      >
        <p>{t.revokeBody}</p>
        {revoke.error ? <Alert tone="danger" title={errorText(m, revoke.error)} /> : null}
      </AlertDialog>
    </Dialog>
  );
}
