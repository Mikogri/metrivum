import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, Archive, Dumbbell, ExternalLink, FileText, History, ListOrdered, Pencil } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useParams } from "react-router";
import {
  AlertDialog,
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Dialog,
  ErrorState,
  Link,
  PageHeader,
  Skeleton,
  TextArea,
  toast,
} from "@trainflow/ui-web";
import { RequireFeature, useFeatureAccess } from "~/shared/access";
import { formatDateTime } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { ApiError } from "~/shared/http/errors";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useFitHeight } from "~/shared/lib/useFitHeight";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { archiveExercise, updateExercise } from "../api";
import { FavoriteButton } from "../components/FavoriteButton";
import { exerciseKeys, useDictionaryLabel, useExercise, useExerciseHistory } from "../queries";
import { muscleGroup } from "../muscleGroup";
import { MusclePreview } from "~/modules/anatomy";
import listStyles from "./exercises.module.css";
import styles from "./exercise-detail.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Exercise — TrainFlow");

function safeHttps(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function ExerciseDetail() {
  const { exerciseId = "" } = useParams();
  const m = useT();
  const t = m.exercises.detail;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const query = useExercise(exerciseId);
  const history = useExerciseHistory(exerciseId);
  const dictLabel = useDictionaryLabel();
  const createAccess = useFeatureAccess("exercises.create");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  // Model and panels fill the window; only the text column scrolls when it is long.
  const { ref: fitRef, height: fit } = useFitHeight<HTMLDivElement>([query.isPending, query.isError]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: exerciseKeys.all(a) });

  const edit = useMutation({
    mutationFn: () => updateExercise(api, exerciseId, { expectedVersion: query.data!.version, description, instructions }),
    onSuccess: (updated) => {
      queryClient.setQueryData(exerciseKeys.detail(a, exerciseId), updated);
      void refresh();
      setEditOpen(false);
      toast({ tone: "success", title: t.updated });
    },
  });

  const archive = useMutation({
    mutationFn: () => archiveExercise(api, exerciseId, query.data!.version),
    onSuccess: () => {
      void refresh();
      setArchiveOpen(false);
      toast({ tone: "success", title: t.archived });
    },
    onError: (error) => {
      setArchiveOpen(false);
      showError(error);
    },
  });

  if (query.isPending) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="10rem" radius="lg" />
      </div>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        title={notFound ? t.notFound : errorText(m, query.error)}
        reference={traceIdOf(query.error)}
        actions={notFound ? undefined : <Button onPress={() => void query.refetch()}>{m.common.retry}</Button>}
      />
    );
  }
  const exercise = query.data;
  const canEdit = exercise.isAuthor && createAccess.allowed && !exercise.isArchived;
  const demo = safeHttps(exercise.demonstrationUrl);
  const conflict = edit.error instanceof ApiError && edit.error.code === "VERSION_CONFLICT";

  // One instruction per line reads as numbered steps.
  const steps = exercise.instructions.split("\n").map((line) => line.trim()).filter(Boolean);
  const muscleChips = (keys: string[], kind: "primary" | "secondary") => keys.length
    ? <span className={listStyles.chips}>{keys.map((k) => <span key={k} className={listStyles.chip} data-group={muscleGroup(k) ?? undefined} data-kind={kind}>{dictLabel("muscles", k)}</span>)}</span>
    : <span className={styles.muted}>—</span>;

  return (
    <>
      <PageHeader
        context={
          <Breadcrumbs
            items={[
              { id: "list", label: m.exercises.title, href: "/app/exercises" },
              { id: "current", label: exercise.name },
            ]}
          />
        }
        title={exercise.name}
        meta={
          <>
            {exercise.isArchived ? <Badge tone="warning">{t.archivedBadge}</Badge> : null}
            {exercise.isAuthor ? <Badge tone="accent">{t.authorBadge}</Badge> : null}
            <Badge>{m.common.version(exercise.version)}</Badge>
          </>
        }
        actions={
          <>
            <FavoriteButton id={exercise.id} isFavorite={exercise.isFavorite} isArchived={exercise.isArchived} />
            {canEdit ? (
              <>
                <Button
                  iconStart={<Pencil />}
                  onPress={() => {
                    setDescription(exercise.description);
                    setInstructions(exercise.instructions);
                    edit.reset();
                    setEditOpen(true);
                  }}
                >
                  {t.edit}
                </Button>
                <Button variant="danger" iconStart={<Archive />} onPress={() => setArchiveOpen(true)}>
                  {t.archive}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {exercise.isArchived ? <Alert tone="warning" title={t.archivedNote} className={styles.alert} /> : null}

      <div ref={fitRef} className={styles.layout} style={fit ? ({ "--fit": `${fit}px` } as CSSProperties) : undefined}>
        <Card as="section" padding="md" aria-labelledby="worked" className={styles.anatomy}>
          <h2 id="worked" className={styles.panelTitle}><Activity aria-hidden="true" />{t.musclesWorked}</h2>
          <MusclePreview primary={exercise.primaryMuscleKeys} secondary={exercise.secondaryMuscleKeys} />
        </Card>
        <div className={styles.main}>
          <Card as="section" padding="lg" aria-labelledby="overview">
            <h2 id="overview" className={styles.panelTitle}><Dumbbell aria-hidden="true" />{t.overview}</h2>
            <div className={styles.muscles}>
              <div className={styles.muscleRow}>
                <span className={styles.factLabel}><span className={styles.kindDot} data-kind="primary" aria-hidden="true" />{t.primaryMuscles}</span>
                {muscleChips(exercise.primaryMuscleKeys, "primary")}
              </div>
              <div className={styles.muscleRow}>
                <span className={styles.factLabel}><span className={styles.kindDot} data-kind="secondary" aria-hidden="true" />{t.secondaryMuscles}</span>
                {muscleChips(exercise.secondaryMuscleKeys, "secondary")}
              </div>
            </div>
            <dl className={styles.factRow}>
              <div>
                <dt className={styles.factLabel}>{t.patterns}</dt>
                <dd className={styles.tags}>{exercise.movementPatternKeys.length ? exercise.movementPatternKeys.map((k) => <Badge key={k}>{dictLabel("movementPatterns", k)}</Badge>) : <span className={styles.muted}>—</span>}</dd>
              </div>
              <div>
                <dt className={styles.factLabel}>{t.tags}</dt>
                <dd className={styles.tags}>{exercise.tags.length ? exercise.tags.map((tag) => <Badge key={tag.id}>{tag.name}</Badge>) : <span className={styles.muted}>—</span>}</dd>
              </div>
              <div>
                <dt className={styles.factLabel}>{t.demonstration}</dt>
                <dd>
                  {demo ? (
                    <Link href={demo} target="_blank" rel="noopener noreferrer nofollow" tone="accent">
                      {t.openDemonstration} <ExternalLink aria-hidden="true" className={styles.inlineIcon} />
                    </Link>
                  ) : <span className={styles.muted}>—</span>}
                </dd>
              </div>
            </dl>
          </Card>
          <Card as="section" padding="lg" aria-labelledby="desc">
            <h2 id="desc" className={styles.panelTitle}><FileText aria-hidden="true" />{t.description}</h2>
            <p className={styles.prose} data-empty={!exercise.description || undefined}>{exercise.description || t.noText}</p>
            <h2 id="instr" className={styles.panelTitle} data-spaced=""><ListOrdered aria-hidden="true" />{t.instructions}</h2>
            {steps.length > 1 ? (
              <ol className={styles.steps}>{steps.map((step, i) => <li key={i}><span className={styles.stepNo} aria-hidden="true">{i + 1}</span><span>{step}</span></li>)}</ol>
            ) : (
              <p className={styles.prose} data-empty={!exercise.instructions || undefined}>{exercise.instructions || t.noText}</p>
            )}
          </Card>
          <Card as="section" padding="lg" aria-labelledby="history">
            <h2 id="history" className={styles.panelTitle}><History aria-hidden="true" />{t.history}</h2>
            {history.isPending ? (
              <Skeleton height="4rem" />
            ) : history.isError ? (
              <p className={styles.muted}>{errorText(m, history.error)}</p>
            ) : history.data.length <= 1 ? (
              <p className={styles.muted}>{t.historyEmpty}</p>
            ) : (
              <ol className={styles.timeline}>
                {history.data.map((revision) => (
                  <li key={revision.version}>
                    <p className={styles.timelineTitle}>{t.historyItem(revision.version, formatDateTime(locale, revision.createdAt))}</p>
                    <p className={styles.timelineBody}>{revision.description || t.noText}</p>
                    {revision.isArchived ? <Badge tone="warning" size="sm">{t.archivedBadge}</Badge> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <Dialog
        isOpen={editOpen}
        placement="right"
        onOpenChange={setEditOpen}
        title={t.editTitle}
        size="lg"
        closeLabel={m.common.close}
        footer={(close) => (
          <>
            <Button variant="secondary" onPress={close}>
              {m.common.cancel}
            </Button>
            <Button variant="primary" loading={edit.isPending} onPress={() => edit.mutate()}>
              {m.common.saveChanges}
            </Button>
          </>
        )}
      >
        <div className={styles.form}>
          {edit.error ? (
            <Alert
              tone="danger"
              title={errorText(m, edit.error)}
              actions={
                conflict ? (
                  <Button
                    size="sm"
                    onPress={async () => {
                      await query.refetch();
                      edit.reset();
                    }}
                  >
                    {m.common.retry}
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          <TextArea placeholder={m.common.ph.description} label={t.description} value={description} onChange={setDescription} rows={4} />
          <TextArea placeholder={m.common.ph.instructions} label={t.instructions} value={instructions} onChange={setInstructions} rows={6} />
        </div>
      </Dialog>
      <AlertDialog
        isOpen={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t.archiveTitle}
        tone="danger"
        confirmLabel={t.archive}
        cancelLabel={m.common.cancel}
        isConfirming={archive.isPending}
        onConfirm={() => archive.mutate()}
      >
        <p>{t.archiveBody}</p>
      </AlertDialog>
    </>
  );
}

export default function ExerciseDetailRoute() {
  return (
    <RequireFeature feature="exercises.browse">
      <ExerciseDetail />
    </RequireFeature>
  );
}
