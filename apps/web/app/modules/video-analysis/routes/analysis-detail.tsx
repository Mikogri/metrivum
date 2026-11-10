import { isUnavailableResource } from "~/shared/lib/ResourceError";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, GitCompare, Pencil, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Alert,
  AlertDialog,
  Breadcrumbs,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Spinner,
  TextArea,
  TextField,
  toast,
} from "@metrivum/ui-web";
import { formatDateTime, formatNumber } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useFeatureAccess } from "~/shared/access";
import {
  useAccountContext,
  useAccountKey,
  useApi,
} from "~/shared/session/AccountScope";
import { cancelAnalysis, updateAnalysis } from "../api";
import { AnalysisStage, ResultView } from "../components/ResultView";
import { StatusBadge } from "../components/StatusBadge";
import { ShareAnalysisDialog } from "../components/ShareAnalysisDialog";
import { CompareDialog, type CompareSource } from "../components/Compare";
import { WorkoutLink } from "../components/WorkoutLink";
import { MovementField } from "../components/MovementField";
import { engineMovement, movementLabel } from "../movement";
import { liftTempo } from "../tempo";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useAnalysis, useAnalysisResult, videoKeys } from "../queries";
import styles from "./analysis-detail.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Analysis — Metrivum");

export default function AnalysisDetail() {
  const { analysisId = "" } = useParams();
  const m = useT();
  const t = m.video.detail;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const { lifecycle } = useAccountContext();
  const showError = useErrorToast();
  const manage = useFeatureAccess("video.library.manage");
  const { mode } = useWorkspace();
  const [shareOpen, setShareOpen] = useState(false);
  // Other analyses compared with this one, in this page (their reps join the table and the charts).
  const navigate = useNavigate();
  const [compareOpen, setCompareOpen] = useState(false);
  const compareAccess = useFeatureAccess("video.analysis.compare");
  const query = useAnalysis(analysisId);
  const analysis = query.data?.data;
  const result = useAnalysisResult(
    analysisId,
    analysis?.status === "Completed",
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [exercise, setExercise] = useState<string | null>(null);
  const [initialExercise, setInitialExercise] = useState<string | null>(null);
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
    mutationFn: () =>
      updateAnalysis(
        api,
        analysisId,
        {
          name: name.trim(),
          note: note.trim() || null,
          tags: tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          // Only a changed movement is sent: it relabels the analysis, the result stays as it was calculated.
          ...(exercise && exercise !== initialExercise
            ? { movement: engineMovement(exercise), exercise }
            : {}),
        },
        query.data!.version,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
      setEditOpen(false);
      toast({ tone: "success", title: t.detailsSaved });
    },
  });
  const review = useMutation({
    mutationFn: ({
      number,
      performed,
    }: {
      number: number;
      performed: boolean | null;
    }) =>
      updateAnalysis(
        api,
        analysisId,
        {
          name: analysis!.name,
          note: analysis!.note,
          tags: analysis!.tags,
          repetitionReviews: [{ number, performed }],
        },
        query.data!.version,
      ),
    onSuccess: async () => {
      if (!lifecycle.isCurrent()) return;
      await queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
    },
    onError: (error) => {
      if (lifecycle.isCurrent()) showError(error);
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
    const notFound = isUnavailableResource(query.error);
    return (
      <ErrorState
        title={notFound ? t.notFound : errorText(m, query.error)}
        reference={traceIdOf(query.error)}
        actions={
          notFound ? undefined : (
            <Button onPress={() => void query.refetch()}>
              {m.common.retry}
            </Button>
          )
        }
      />
    );
  }

  const active =
    analysis.status === "Queued" || analysis.status === "Processing";
  const tracking = analysis.configuration?.tracking;
  const aspect =
    tracking?.videoWidth && tracking.videoHeight
      ? Number(tracking.videoWidth) / Number(tracking.videoHeight)
      : analysis.sourceVideo?.width && analysis.sourceVideo.height
        ? Number(analysis.sourceVideo.width) /
          Number(analysis.sourceVideo.height)
        : 9 / 16;
  const failure = analysis.failureCode
    ? (t.failureCodes[analysis.failureCode] ??
      t.unknownFailure(analysis.failureCode))
    : null;

  const configuration = analysis.configuration;
  const currentExercise =
    configuration?.exercise ??
    (configuration?.movement && configuration.movement !== "unspecified"
      ? movementLabel(configuration)
      : null);
  const tempo = result.data ? liftTempo(result.data) : null;
  const seconds = (value: number) => `${formatNumber(locale, value, 1)} s`;

  const editDetails = () => {
    setExercise(currentExercise);
    setInitialExercise(currentExercise);
    setName(analysis.name);
    setNote(analysis.note ?? "");
    setTags(analysis.tags.join(", "));
    save.reset();
    setEditOpen(true);
  };

  // The analysis sheet's details: read only here, changed with Edit at the top.
  const aside = (
    <div className={styles.aside}>
      <dl className={styles.facts}>
        <div>
          <dt>{m["video"]["new"]["movement"]}</dt>
          <dd>{currentExercise ?? "—"}</dd>
        </div>
        {tempo ? (
          <div className={styles.wide}>
            <dt>{m["ui"]["Tempo"]}</dt>
            <dd className={styles.tempo}>
              <strong
                title={
                  m["ui"][
                    "Lowering - pause - lifting - between reps, in whole seconds"
                  ]
                }
              >
                {tempo.notation}
              </strong>
              <span>
                {m["video"]["detail"]["phaseNames"]["eccentric"]}{" "}
                {seconds(tempo.lowering)} {m["ui"]["· pause"]}{" "}
                {seconds(tempo.pause)} {m["ui"]["· lifting"]}{" "}
                {seconds(tempo.lifting)}
                {tempo.between != null
                  ? ` · between reps ${seconds(tempo.between)}`
                  : ""}{" "}
                {m["ui"]["· mean of"]} {tempo.reps}{" "}
                {tempo.reps === 1 ? m["ui"]["rep"] : m["ui"]["reps"]}
              </span>
            </dd>
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
      </dl>
      {mode === "coach" ? (
        <WorkoutLink
          analysisId={analysis.id}
          version={Number(query.data!.version)}
          canEdit={false}
        />
      ) : null}
      <section className={styles.noteBlock} aria-labelledby="analysis-note">
        <h3 id="analysis-note" className={styles.noteLabel}>
          {m.video.new.note}
        </h3>
        {analysis.note ? (
          <p className={styles.note}>{analysis.note}</p>
        ) : (
          <p className={styles.notePlaceholder}>
            {
              m["ui"][
                "No note yet. Add what to look at in this lift with Edit."
              ]
            }
          </p>
        )}
      </section>
    </div>
  );

  const status = (
    <>
      {active ? (
        <div className={styles.waiting} role="status" aria-live="polite">
          <div className={styles.stage}>
            <Spinner tone="accent" />
            <div>
              <p className={styles.stageTitle}>
                {m.video.statuses[analysis.status]}
              </p>
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
        </div>
      ) : null}
      {failure ? (
        <Alert tone="danger" title={t.failure}>
          {failure}
        </Alert>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        context={
          <Breadcrumbs
            items={[
              {
                id: "list",
                label: m.video.list.title,
                href: "/app/video-analyses",
              },
              { id: "current", label: analysis.name },
            ]}
          />
        }
        title={analysis.name}
        meta={
          <>
            <StatusBadge status={analysis.status} />
            <span className={styles.muted}>
              {t.attempts(analysis.attempts)}
            </span>
          </>
        }
        actions={
          <>
            <Button
              iconStart={<Pencil />}
              isDisabled={!manage.allowed}
              onPress={editDetails}
            >
              {m["profile"]["showcase"]["edit"]}
            </Button>
            {analysis.status === "Completed" && compareAccess.allowed ? (
              <Button
                iconStart={<GitCompare />}
                onPress={() => setCompareOpen(true)}
              >
                {m["video"]["compare"]["submit"]}
              </Button>
            ) : null}
            {analysis.status === "Completed" ? (
              <Button iconStart={<Share2 />} onPress={() => setShareOpen(true)}>
                {m.video.share.action}
              </Button>
            ) : null}
            {active ? (
              <Button
                variant="danger"
                iconStart={<Ban />}
                onPress={() => setCancelOpen(true)}
              >
                {t.cancel}
              </Button>
            ) : null}
          </>
        }
      />
      {shareOpen ? (
        <ShareAnalysisDialog
          analysisId={analysis.id}
          name={analysis.name}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {compareOpen ? (
        <CompareDialog
          exclude={[`own:${analysis.id}`]}
          initial={[]}
          onClose={() => setCompareOpen(false)}
          onConfirm={(others) => {
            // The comparison opens on its own page, starting with this analysis.
            const sources: CompareSource[] = [
              {
                kind: "own",
                id: analysis.id,
                name: analysis.name,
                mediaId: analysis.mediaId,
              },
              ...others,
            ];
            navigate(
              `/app/video-analyses/compare?${new URLSearchParams({ with: encodeURIComponent(JSON.stringify(sources)) })}`,
            );
          }}
        />
      ) : null}

      <section aria-labelledby="result-title" className={styles.section}>
        <h2 id="result-title" className="tf-visually-hidden">
          {t.result}
        </h2>
        {analysis.status === "Completed" && result.data ? (
          <ResultView
            result={result.data}
            mediaId={analysis.mediaId ?? undefined}
            aside={aside}
            aspect={aspect}
            onReview={
              manage.allowed
                ? (number, performed) => {
                    if (!review.isPending) review.mutate({ number, performed });
                  }
                : undefined
            }
            reviewPending={review.isPending}
          />
        ) : (
          <AnalysisStage
            aside={aside}
            mediaId={analysis.mediaId ?? undefined}
            aspect={aspect}
          >
            {status}
            {analysis.status !== "Completed" ? (
              active ? null : (
                <EmptyState size="sm" title={t.noResultYet} />
              )
            ) : result.isError ? (
              <ErrorState
                title={errorText(m, result.error)}
                actions={
                  <Button onPress={() => void result.refetch()}>
                    {m.common.retry}
                  </Button>
                }
              />
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
        title={m["ui"]["Edit analysis"]}
        closeLabel={m.common.close}
        footer={(close) => (
          <>
            <Button variant="secondary" onPress={close}>
              {m.common.cancel}
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              isDisabled={!name.trim()}
              onPress={() => save.mutate()}
            >
              {m.common.save}
            </Button>
          </>
        )}
      >
        <div className={styles.form}>
          {save.error ? (
            <Alert tone="danger" title={errorText(m, save.error)} />
          ) : null}
          <TextField
            placeholder={m.common.ph.analysisName}
            label={m.video.new.name}
            value={name}
            onChange={setName}
            isRequired
            autoFocus
          />
          <div className={styles.fieldGroup}>
            <MovementField value={exercise} onChange={setExercise} />
            {exercise !== initialExercise ? (
              <p className={styles.muted}>
                {
                  m["ui"][
                    "Changes the label only; reps and phases stay as they were calculated."
                  ]
                }
              </p>
            ) : null}
          </div>
          <TextField
            placeholder={m.common.ph.tags}
            label={m.video.new.tags}
            value={tags}
            onChange={setTags}
            description={m.video.new.tagsHint}
          />
          <TextArea
            placeholder={m.common.ph.note}
            label={m.video.new.note}
            value={note}
            onChange={setNote}
            rows={4}
          />
          {mode === "coach" ? (
            <WorkoutLink
              analysisId={analysis.id}
              version={Number(query.data!.version)}
              canEdit={manage.allowed}
            />
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
