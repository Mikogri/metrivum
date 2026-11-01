import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert, AlertDialog, toast } from "@metrivum/ui-web";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { newIdempotencyKey } from "~/shared/http/transport";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { publishRevision } from "../api";
import { trainingKeys } from "../queries";
import { IssueList } from "./FormatIssues";
import { useFormatRefusal } from "./FormatBanner";

/**
 * Applies the saved draft. One Idempotency-Key per apply attempt: retrying after a network
 * failure resends the same key so the server returns the original revision instead of a second one.
 */
/** `issues` are the plan's known format problems (see useDocumentIssues), listed in red before and after a refused apply. */
export function PublishDialog({ planId, version, isOpen, onOpenChange, issues = [] }: { planId: string; version: number; isOpen: boolean; onOpenChange: (open: boolean) => void; issues?: string[] }) {
  const m = useT();
  const t = m.training.detail;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const key = useRef<string | null>(null);
  const [, setRefusal] = useFormatRefusal(planId);

  useEffect(() => {
    if (isOpen) key.current = newIdempotencyKey();
  }, [isOpen, version]);

  const mutation = useMutation({
    mutationFn: () => publishRevision(api, planId, version, key.current ?? (key.current = newIdempotencyKey())),
    onSuccess: (revision) => {
      key.current = null;
      setRefusal(null);
      void queryClient.invalidateQueries({ queryKey: trainingKeys.all(a) });
      void queryClient.invalidateQueries({ queryKey: [a, "coaching"] });
      toast({ tone: "success", title: t.published(revision.number) });
      onOpenChange(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) setRefusal(error.problem?.detail ?? m.editor.issues.applyRefused);
    },
  });

  const refused = mutation.error instanceof ApiError && mutation.error.status === 400;
  const serverDetail = refused ? (mutation.error as ApiError).problem?.detail ?? null : null;
  const invalid = refused || issues.length > 0;

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
      // A plan with format problems is saved as a draft but can't be applied until they're fixed.
      isConfirmDisabled={issues.length > 0}
      onConfirm={() => mutation.mutate()}
    >
      <p>{t.publishBody}</p>
      {invalid ? (
        <Alert tone="danger" live="assertive" title={refused ? m.editor.issues.applyRefused : m.editor.issues.title}>
          {issues.length ? <><p>{m.editor.issues.intro}</p><IssueList issues={issues} /></> : serverDetail ? <p>{serverDetail}</p> : null}
        </Alert>
      ) : mutation.error ? <Alert tone="danger" live="assertive" title={errorText(m, mutation.error)} /> : null}
    </AlertDialog>
  );
}
