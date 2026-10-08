import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Alert, AlertDialog, Breadcrumbs, Button, Card, Dialog, EmptyState, ErrorState, PageHeader, Skeleton, Spinner, TextArea, TextField, toast } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http/errors";
import { formatDateTime } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useFeatureAccess } from "~/shared/access";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { cancelAnalysis, updateAnalysis } from "../api";
import { AnalysisStage, ResultView } from "../components/ResultView";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalysis, useAnalysisResult, videoKeys } from "../queries";
import styles from "./analysis-detail.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Analysis — TrainFlow");

export default function AnalysisDetail() {
  const { analysisId = "" } = useParams();
  const m = useT();
  const t = m.video.detail;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const manage = useFeatureAccess("video.library.manage");
  const query = useAnalysis(analysisId);
  const analysis = query.data?.data;
  const result = useAnalysisResult(analysisId, analysis?.status === "Completed");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const cancel = useMutation({
    mutationFn: () => cancelAnalysis(api, analysisId, query.data!.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
      setCancelOpen(false);
      toast({ tone: "success", title: t.cancelled });
    },
    onError: (error) => {
      setCancelOpen(false);
      showError(error);
    },
  });
  const save = useMutation({
    mutationFn: () => updateAnalysis(api, analysisId, { name: name.trim(), note: note.trim() || null, tags: tags.split(",").map((x) => x.trim()).filter(Boolean) }, query.data!.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
      setEditOpen(false);
      toast({ tone: "success", title: t.detailsSaved });
    },
  });

  if (query.isPending) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="14rem" radius="lg" />
      </div>
    );
  }
  if (query.isError || !analysis) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? t.notFound : errorText(m, query.error)}
        reference={traceIdOf(query.error)}
        actions={notFound ? undefined : <Button onPress={() => void query.refetch()}>{m.common.retry}</Button>}
      />
    );
  }

  const active = analysis.status === "Queued" || analysis.status === "Processing";
  const failure = analysis.failureCode ? (t.failureCodes[analysis.failureCode] ?? t.unknownFailure(analysis.failureCode)) : null;

  const editDetails = () => {
    setName(analysis.name);
    setNote(analysis.note ?? "");
    setTags(analysis.tags.join(", "));
    save.reset();
    setEditOpen(true);
  };

  // Left column: what this analysis is and what you can do with it.
  const aside = (
    <div className={styles.aside}>
      <dl className={styles.facts}>
        <div>
          <dt>{t.created}</dt>
          <dd>{formatDateTime(locale, analysis.createdAt)}</dd>
        </div>
        {analysis.completedAt ? (
          <div>
            <dt>{t.completed}</dt>
            <dd>{formatDateTime(locale, analysis.completedAt)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{m.video.new.tags}</dt>
          <dd className={styles.tags}>
            {analysis.tags.length
              ? analysis.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))
              : "—"}
          </dd>
        </div>
      </dl>
      <div className={styles.asideActions}>
        <Button iconStart={<Pencil />} isDisabled={!manage.allowed} onPress={editDetails}>
          {t.editDetails}
        </Button>
        {active ? (
          <Button variant="danger" iconStart={<Ban />} onPress={() => setCancelOpen(true)}>
            {t.cancel}
          </Button>
        ) : null}
      </div>
    </div>
  );

  const status = (
    <>
      {active ? (
        <Card padding="lg" className={styles.waiting} role="status" aria-live="polite">
          <div className={styles.stage}>
            <Spinner tone="accent" />
            <div>
              <p className={styles.stageTitle}>{m.video.statuses[analysis.status]}</p>
              <p className={styles.muted}>{t.waitingBody}</p>
            </div>
          </div>
          {/* Indeterminate on purpose: the API reports stages, not percentages. */}
          <div className={styles.indeterminate} aria-hidden="true">
            <span />
          </div>
          <p className={styles.muted}>
            {t.noProgress} {hidden ? t.pollingPaused : t.polling}.
          </p>
        </Card>
      ) : null}
      {failure ? <Alert tone="danger" title={t.failure}>{failure}</Alert> : null}
    </>
  );

  return (
    <>
      <PageHeader
        context={<Breadcrumbs items={[{ id: "list", label: m.video.list.title, href: "/app/video-analyses" }, { id: "current", label: analysis.name }]} />}
        title={analysis.name}
        description={analysis.note || undefined}
        meta={
          <>
            <StatusBadge status={analysis.status} />
            <span className={styles.muted}>{t.attempts(analysis.attempts)}</span>
          </>
        }
      />

      <section aria-labelledby="result-title" className={styles.section}>
        <h2 id="result-title" className="tf-visually-hidden">
          {t.result}
        </h2>
        {analysis.status === "Completed" && result.data ? (
          <ResultView result={result.data} mediaId={analysis.mediaId} aside={aside} />
        ) : (
          <AnalysisStage aside={aside} mediaId={analysis.mediaId}>
            {status}
            {analysis.status !== "Completed" ? (
              active ? null : <EmptyState size="sm" title={t.noResultYet} />
            ) : result.isError ? (
              <ErrorState title={errorText(m, result.error)} actions={<Button onPress={() => void result.refetch()}>{m.common.retry}</Button>} />
            ) : (
              <Skeleton height="16rem" radius="lg" />
            )}
          </AnalysisStage>
        )}
      </section>

      <AlertDialog
        isOpen={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t.cancelTitle}
        tone="danger"
        confirmLabel={t.cancel}
        cancelLabel={m.common.keepEditing}
        isConfirming={cancel.isPending}
        onConfirm={() => cancel.mutate()}
      >
        <p>{t.cancelBody}</p>
      </AlertDialog>
      <Dialog
        isOpen={editOpen}
        placement="right"
        onOpenChange={setEditOpen}
        title={t.editDetails}
        closeLabel={m.common.close}
        footer={(close) => (
          <>
            <Button variant="secondary" onPress={close}>
              {m.common.cancel}
            </Button>
            <Button variant="primary" loading={save.isPending} isDisabled={!name.trim()} onPress={() => save.mutate()}>
              {m.common.save}
            </Button>
          </>
        )}
      >
        <div className={styles.form}>
          {save.error ? <Alert tone="danger" title={errorText(m, save.error)} /> : null}
          <TextField placeholder={m.common.ph.analysisName} label={m.video.new.name} value={name} onChange={setName} isRequired autoFocus />
          <TextField placeholder={m.common.ph.tags} label={m.video.new.tags} value={tags} onChange={setTags} description={m.video.new.tagsHint} />
          <TextArea placeholder={m.common.ph.note} label={m.video.new.note} value={note} onChange={setNote} rows={3} />
        </div>
      </Dialog>
    </>
  );
}
