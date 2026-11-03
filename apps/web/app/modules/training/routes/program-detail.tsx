import { isUnavailableResource } from "~/shared/lib/ResourceError";
import { AssignProgramButton, AssignmentList } from "../delivery/Assignments";
import { Archive, ArchiveRestore, Copy, Download, Pencil, Rocket } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FileCard,
  LinkButton,
  PageHeader,
  Skeleton,
  toast,
  Segment,
  SegmentedControl,
} from "@metrivum/ui-web";
import { LockedReason, RequireFeature, useFeatures } from "~/shared/access";
import { formatDateTime, formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { setArchived } from "../api";
import { PublishDialog } from "../components/PublishDialog";
import { useFormatRefusal } from "../components/FormatBanner";
import { FormatIssues } from "../components/FormatIssues";
import { DraftState } from "../components/DraftState";
import { useDocumentIssues } from "../editor/useDocumentIssues";
import { useExerciseNames } from "~/modules/exercises";
import { SheetCanvas, usePersistentSheet } from "../editor/components/SheetCanvas";
import { WeekView } from "../editor/components/WeekView";
import { isSimpleShape } from "../editor/model/structure";
import { storedMode, storeMode, type EditorMode } from "../editor/mode-preference";
import { documentStats, uniqueExerciseIds } from "../editor/model/document";
import { ExportDialog } from "../import-export/ExportDialog";
import { CopyPlanDialog } from "../library/dialogs";
import { trainingKeys, usePlan, useRevisions } from "../queries";
import styles from "./program-detail.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Program — Metrivum");

function ProgramDetail() {
  const { programId = "" } = useParams();
  const m = useT();
  const t = m.training.detail;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const query = usePlan(programId);
  const revisions = useRevisions(programId);
  const access = useFeatures(["training.programs.manage", "training.programs.create", "training.templates.manage", "training.export.csv", "training.export.pdf"] as const);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [sheet, setSheet] = usePersistentSheet(programId);
  const [previewMode, setPreviewModeState] = useState<EditorMode | null>(storedMode);
  const setPreviewMode = (next: EditorMode) => {
    setPreviewModeState(next);
    storeMode(next);
  };
  const names = useExerciseNames(query.data ? uniqueExerciseIds(query.data.data.document) : []);
  const issues = useDocumentIssues(query.data?.data.document, names);
  const [refusal] = useFormatRefusal(programId);

  const archive = useMutation({
    mutationFn: (archived: boolean) => setArchived(api, programId, archived, query.data!.version),
    onSuccess: (result) => {
      queryClient.setQueryData(trainingKeys.plan(a, programId), result);
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: result.data.archived ? m.training.library.archived : m.training.library.restored });
    },
    onError: (error) => showError(error),
  });

  if (query.isPending) {
    return (
      <div className={styles.loading} aria-busy="true">
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="12rem" radius="lg" />
      </div>
    );
  }
  if (query.isError) {
    const notFound = isUnavailableResource(query.error);
    return (
      <ErrorState
        title={notFound ? t.notFound : errorText(m, query.error)}
        reference={traceIdOf(query.error)}
        actions={notFound ? undefined : <Button onPress={() => void query.refetch()}>{m.common.retry}</Button>}
      />
    );
  }

  const { data: plan, version } = query.data;
  const isTemplate = plan.kind === "Template";
  const canManage = access["training.programs.manage"].allowed && (!isTemplate || access["training.templates.manage"].allowed);
  const stats = documentStats(plan.document);
  const mode = previewMode ?? (isSimpleShape(plan.document) ? "simple" : "advanced");
  const editPath = isTemplate ? `/app/templates/${plan.id}/edit` : `/app/programs/${plan.id}/edit`;
  const canExport = access["training.export.csv"].allowed || access["training.export.pdf"].allowed;

  return (
    <>
      <PageHeader
        context={
          <Breadcrumbs
            items={[
              { id: "list", label: isTemplate ? m.training.templates.title : m.training.programs.title, href: isTemplate ? "/app/templates" : "/app/programs" },
              { id: "current", label: plan.name },
            ]}
          />
        }
        title={plan.name}
        description={plan.description || t.emptyDescription}
        meta={
          <>
            {isTemplate ? <Badge tone="violet">{m.training.library.templateBadge}</Badge> : null}
            {plan.archived ? <Badge tone="warning">{m.training.library.archivedBadge}</Badge> : null}
            <Badge>{m.common.updated(formatRelative(locale, plan.updatedAt))}</Badge>
          </>
        }
        actions={
          <>
            {!isTemplate && !plan.archived && <AssignProgramButton programId={plan.id} />}
            {plan.archived ? (
              <Button iconStart={<ArchiveRestore />} isDisabled={!canManage} loading={archive.isPending} onPress={() => archive.mutate(false)}>
                {m.common.restore}
              </Button>
            ) : (
              <Button variant="ghost" iconStart={<Archive />} isDisabled={!canManage} loading={archive.isPending} onPress={() => archive.mutate(true)}>
                {m.common.archive}
              </Button>
            )}
            <LockedReason access={access["training.programs.create"]}>
              <Button iconStart={<Copy />} isDisabled={!access["training.programs.create"].allowed} onPress={() => setCopyOpen(true)}>
                {isTemplate ? m.training.library.useTemplate : m.training.library.copy}
              </Button>
            </LockedReason>
            <LinkButton href={editPath} variant="primary" iconStart={<Pencil />} isDisabled={!canManage || plan.archived}>
              {t.openEditor}
            </LinkButton>
          </>
        }
      />

      {/* One strip of numbers, then the plan itself, then its published revisions. */}
      <section className={styles.summary} aria-labelledby="draft-title">
        <div className={styles.summaryHead}>
          <h2 id="draft-title" className={styles.title}>
            {t.draft}
          </h2>
          <Badge size="sm">{m.common.version(version)}</Badge>
          <DraftState planId={plan.id} draftVersion={version} />
          <FormatIssues compact issues={[...issues, ...(refusal && !issues.length ? [refusal] : [])]} />
        </div>
        <dl className={styles.stats}>
          {[stats.blocks, stats.cycles, stats.days, stats.exercises].map((n, i) => {
            // Plural form as a column label ("Blocks", "Training days"), the count above it.
            const word = [t.blocks, t.cycles, t.days, t.exercises][i]!(2).replace(/^\s*\d+\s*/, "");
            const text = word.charAt(0).toUpperCase() + word.slice(1);
            return (
              <div key={i}>
                <dd>{n}</dd>
                <dt>{text}</dt>
              </div>
            );
          })}
        </dl>
        <Button iconStart={<Rocket />} isDisabled={!canManage || plan.archived} onPress={() => setPublishOpen(true)}>
          {t.publish}
        </Button>
      </section>

      <section className={styles.preview} aria-labelledby="preview-title">
        <div className={styles.previewHead}>
          <h2 id="preview-title" className={styles.title}>
            {t.preview}
          </h2>
          <span className={styles.muted}>{mode === "simple" ? t.previewHintSimple : t.previewHint}</span>
          <SegmentedControl
            aria-label={m.editor.mode.label}
            size="sm"
            selectedKeys={[mode]}
            onSelectionChange={(keys) => setPreviewMode(([...keys][0] as "simple" | "advanced") ?? mode)}
            className={styles.previewMode}
          >
            <Segment id="simple">{m.editor.mode.simple}</Segment>
            <Segment id="advanced">{m.editor.mode.advanced}</Segment>
          </SegmentedControl>
        </div>
        {mode === "simple" ? (
          <div className={styles.previewSheet}>
            <WeekView doc={plan.document} names={names} />
          </div>
        ) : (
          <SheetCanvas doc={plan.document} sheet={sheet} onSheetChange={setSheet} names={names} initialZoom={0.7} className={styles.previewSheet} />
        )}
      </section>

      <Card as="section" padding="lg" aria-labelledby="revisions-title">
        <div className={styles.sectionHead}>
          <h2 id="revisions-title" className={styles.title}>
            {t.revisions}
          </h2>
          <LockedReason access={canExport ? access["training.export.pdf"] : access["training.export.csv"]}>
            <Button size="sm" iconStart={<Download />} isDisabled={!canExport} onPress={() => setExportOpen(true)}>
              {t.export}
            </Button>
          </LockedReason>
        </div>
        <p className={styles.muted}>{t.revisionsBody}</p>
        {revisions.isPending ? (
          <Skeleton height="6rem" />
        ) : revisions.isError ? (
          <p className={styles.muted}>{errorText(m, revisions.error)}</p>
        ) : revisions.data.items.length === 0 ? (
          <EmptyState size="sm" icon={<Rocket />} title={t.noRevisions} description={t.noRevisionsBody} />
        ) : (
          <ul className={styles.revisions}>
            {revisions.data.items.map((revision, i) => (
              <li key={revision.id} style={{ "--i": i } as React.CSSProperties}>
                <FileCard
                  name={t.revision(revision.number)}
                  kind={`R${revision.number}`}
                  meta={`${formatDateTime(locale, revision.publishedAt)} · ${t.fromDraft(revision.draftVersion)}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!isTemplate && <AssignmentList programId={plan.id} />}
      <PublishDialog planId={plan.id} version={version} isOpen={publishOpen} onOpenChange={setPublishOpen} issues={issues} />
      <ExportDialog planId={plan.id} planName={plan.name} draft={plan.document} isOpen={exportOpen} onOpenChange={setExportOpen} />
      <CopyPlanDialog
        plan={copyOpen ? { id: plan.id, name: plan.name, description: plan.description, kind: plan.kind, folderId: plan.folderId, archived: plan.archived, version, updatedAt: plan.updatedAt } : null}
        fromTemplate={isTemplate}
        onClose={() => setCopyOpen(false)}
      />
    </>
  );
}

export default function ProgramDetailRoute() {
  return (
    <RequireFeature feature="training.programs.read">
      <ProgramDetail />
    </RequireFeature>
  );
}
