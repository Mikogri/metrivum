import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert, AlertDialog, toast } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { newIdempotencyKey } from "~/shared/http/transport";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { publishRevision } from "../api";
import { trainingKeys } from "../queries";

/**
 * Applies the saved draft. One Idempotency-Key per apply attempt: retrying after a network
 * failure resends the same key so the server returns the original revision instead of a second one.
 */
export function PublishDialog({ planId, version, isOpen, onOpenChange }: { planId: string; version: number; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useT();
  const t = m.training.detail;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const key = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) key.current = newIdempotencyKey();
  }, [isOpen, version]);

  const mutation = useMutation({
    mutationFn: () => publishRevision(api, planId, version, key.current ?? (key.current = newIdempotencyKey())),
    onSuccess: (revision) => {
      key.current = null;
      void queryClient.invalidateQueries({ queryKey: trainingKeys.all(a) });
      void queryClient.invalidateQueries({ queryKey: [a, "coaching"] });
      toast({ tone: "success", title: t.published(revision.number) });
      onOpenChange(false);
    },
  });

  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) mutation.reset();
        onOpenChange(open);
      }}
      title={t.publishTitle}
      confirmLabel={t.publish}
      cancelLabel={m.common.cancel}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <p>{t.publishBody}</p>
      {mutation.error ? <Alert tone="danger" title={errorText(m, mutation.error)} /> : null}
    </AlertDialog>
  );
}
