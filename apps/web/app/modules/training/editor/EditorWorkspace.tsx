import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useNavigateUp } from "~/shared/lib/navigateUp";
import { flushSync } from "react-dom";
import { CellValidationContext } from "./cell-validation";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Download, Lock, Redo2, Rocket, Sparkles, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useBlocker, useNavigate } from "react-router";
import type { PlanDto } from "@metrivum/api-client-web";
import { Alert, Badge, Button, IconButton, Segment, SegmentedControl, Tooltip, TooltipTrigger, toast } from "@metrivum/ui-web";
import { useExerciseNames } from "~/modules/exercises";
import { UpgradeBanner, UpgradeLink, useFeatures } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { createPlan, getPlan } from "../api";
import { PublishDialog } from "../components/PublishDialog";
import { useDocumentIssues } from "./useDocumentIssues";
import { useFormatRefusal } from "../components/FormatBanner";
import { FormatIssues } from "../components/FormatIssues";
import { DraftState } from "../components/DraftState";
import { FormulaDialog } from "../components/FormulaDialog";
import { FormulaHelp } from "../components/FormulaHelp";
import { ExportDialog } from "../import-export/ExportDialog";
import { trainingKeys } from "../queries";
import { ConflictDialog } from "./components/ConflictDialog";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { NodeDialog } from "./components/NodeDialog";
import { FormulaMark } from "../components/FormulaMark";
import { SaveStatus } from "./components/SaveStatus";
import { SheetCanvas, usePersistentSheet } from "./components/SheetCanvas";
import { WeekView } from "./components/WeekView";
import { uniqueExerciseIds } from "./model/document";
import { isSimpleShape } from "./model/structure";
import { usesProFeatures } from "./model/pro-features";
import { hasActiveWorkout } from "./model/workouts";
import { storedMode, storeMode, type EditorMode } from "./mode-preference";
import { useEditor } from "./useEditor";
import { ClientFormulaContext } from "./client-context";
import { usePlanClientContext } from "./ClientPlanContext";
import styles from "./EditorWorkspace.module.css";

function isTextTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

export function EditorWorkspace({ plan, version }: { plan: PlanDto; version: number }) {
  const uiCopy = useUiCopy();

  const m = useT();
  const t = m.editor;
  const navigate = useNavigate();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const access = useFeatures(["training.programs.manage", "training.templates.manage", "training.sets.advanced", "training.formulas.custom", "training.builder.advanced"] as const);
  const canEdit = access["training.programs.manage"].allowed && (plan.kind === "Program" || access["training.templates.manage"].allowed);
  // A plan made with Pro tools (custom cycles, formulas, maxes, advanced sets…) can't be edited without them:
  // it opens read-only rather than half-editable, until the plan includes the advanced builder again.
  const builderAccess = access["training.builder.advanced"];
  const proLocked = !builderAccess.pending && !builderAccess.allowed && usesProFeatures(plan.document);
  const readOnly = !canEdit || plan.archived || proLocked;
  const editor = useEditor(plan, version, { readOnly });
  // The last mode picked in this browser wins; without one, plans shaped like one week open in simple
  // mode and others in advanced. Simple only limits what can be created, it never changes the structure.
  const [mode, setModeState] = useState<EditorMode>(() => storedMode() ?? (isSimpleShape(plan.document) ? "simple" : "advanced"));
  // Picked on this page: without the advanced builder the plan opens as a table, and the sheet shows its notice
  // only when someone picks it here.
  const [picked, setPicked] = useState(false);
  const setMode = (next: EditorMode) => {
    setPicked(true);
    setModeState(next);
    storeMode(next);
  };
  // The sheet needs the advanced builder (Pro and above). Without it the page is blurred behind a notice.
  const builder = access["training.builder.advanced"];
  const activeMode: EditorMode = !picked && !builder.pending && !builder.allowed ? "simple" : mode;
  const builderLocked = activeMode === "advanced" && !builder.pending && !builder.allowed;
  // Sheet arrangement: remembered in this browser per plan (disconnected cycles stay in memory only).
  const [sheet, setSheet] = usePersistentSheet(plan.id);
  const [editNode, setEditNode] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const leaving = useRef(false);
  const { confirm, dialog } = useDiscardConfirm();
  const names = useExerciseNames(uniqueExerciseIds(editor.doc));
  // Problems the server would refuse on apply, with their place in the plan (hover the status to read them).
  const docIssues = useDocumentIssues(editor.doc, names);
  const [refusal] = useFormatRefusal(plan.id);
  const { mode: workspaceMode } = useWorkspace();
  const clientContext = usePlanClientContext(plan.id, workspaceMode === "coach" && canEdit && plan.kind === "Program" && !plan.archived);
  const up = useNavigateUp();
  const detailPath = workspaceMode === "client" ? `/app/training-plans/${plan.id}` : `/app/programs/${plan.id}`;

  const hasUnsavedWork = useCallback(() => {
    // A cell still being typed counts: commit it first so the check (and autosave) sees it.
    flushSync(() => window.dispatchEvent(new Event("training:commit-cell")));
    return editor.isDirty();
  }, [editor]);
  useUnsavedWorkGuard(hasUnsavedWork);

  // In-app navigation away from unsaved work asks first (browser unload is handled by the guard).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !leaving.current && hasUnsavedWork() && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    // Autosave covers leaving too: save what is left, and ask only when that save did not go through.
    void editor.save().then(async () => {
      if (!editor.isDirty() || (await confirm())) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm, editor]);

  // Switching tabs or closing the window saves right away instead of waiting for the autosave pause.
  useEffect(() => {
    if (readOnly) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && hasUnsavedWork()) void editor.save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [editor, hasUnsavedWork, readOnly]);

  const saveDraft = useCallback(() => {
    // Capture the focused cell before serializing history, including unfinished formulas.
    flushSync(() => window.dispatchEvent(new Event("training:commit-cell")));
    return editor.save();
  }, [editor]);

  // Editor shortcuts: save works everywhere; undo/redo only outside text fields so typing keeps native undo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveDraft();
      } else if ((key === "z" || key === "y") && !isTextTarget(event.target)) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, saveDraft]);

  const reload = useMutation({
    mutationFn: () => getPlan(api, plan.id),
    onSuccess: (result) => {
      queryClient.setQueryData(trainingKeys.plan(a, plan.id), result);
      editor.reset(result.data, result.version);
    },
  });
  const saveCopy = useMutation({
    mutationFn: () =>
      createPlan(api, { name: t.conflict.copyName(editor.meta.name || plan.name), description: editor.meta.description, kind: plan.kind, folderId: editor.meta.folderId, document: editor.doc }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.conflict.copied });
      leaving.current = true;
      navigate(data.kind === "Template" ? `/app/templates/${data.id}/edit` : `/app/programs/${data.id}/edit`, { replace: true });
    },
  });

  const [invalidCells, setInvalidCells] = useState<Map<string, string>>(() => new Map());
  const reportInvalid = useCallback((id: string, invalid: boolean, detail = "Invalid cell") => setInvalidCells(current => {
    if (invalid ? current.get(id) === detail : !current.has(id)) return current;
    const next = new Map(current); if (invalid) next.set(id, detail); else next.delete(id); return next;
  }), []);
  // A failed save shows next to the save state with the plan's other problems, never as a page-wide banner.
  const saveFailure = editor.status !== "error" ? null
    : editor.error instanceof ApiError && editor.error.status === 400 ? editor.error.problem?.detail ?? m.editor.issues.title
    : errorText(m, editor.error);

  // Everything the status shows: problems in the plan, cells the server refused and a failed save.
  const allIssues = [...docIssues, ...invalidCells.values(), ...(saveFailure ? [saveFailure] : []), ...(refusal && !docIssues.length ? [refusal] : [])];

  return (
    <CellValidationContext.Provider value={reportInvalid}><ClientFormulaContext.Provider value={clientContext.value}>
    <div className={styles.workspace} data-locked={builderLocked || undefined}>
      <div className={styles.lockable} inert={builderLocked} aria-hidden={builderLocked || undefined}>
      <header className={styles.toolbar} role="toolbar" aria-label={t.toolbar}>
        <RouterLink
          to={detailPath}
          className={styles.back}
          aria-label={t.back}
          // Back to the plan the way the browser would: the earlier entry, so the next back reaches the list.
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            up(detailPath);
          }}
        >
          <ArrowLeft aria-hidden="true" />
        </RouterLink>
        <div className={styles.titleBox}>
          <label className="tf-visually-hidden" htmlFor="program-name">
            {m.training.library.createDialog.name}
          </label>
          <input
            id="program-name"
            className={styles.title}
            value={editor.meta.name}
            readOnly={readOnly}
            maxLength={200}
            onChange={(event) => editor.updateMeta({ name: event.target.value })}
            placeholder={t.untitled}
          />
          {plan.kind === "Template" ? <Badge size="sm" tone="violet">{m.training.library.templateBadge}</Badge> : null}
          {/* Only the save state here; format problems and applied/draft sit next to "View as". */}
          <SaveStatus status={editor.status} />
          <span className={styles.planState}>
            <FormatIssues compact issues={allIssues} />
            {plan.kind === "Program" ? <DraftState compact planId={plan.id} draftVersion={editor.version} /> : null}
          </span>
        </div>
        {clientContext.toolbar}
        <TooltipTrigger delay={400}>
          <SegmentedControl
            aria-label={t.mode.label}
            size="sm"
            selectedKeys={[activeMode]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next === "simple" || next === "advanced") setMode(next);
            }}
          >
            <Segment id="simple">{t.mode.simple}</Segment>
            <Segment id="advanced">{t.mode.advanced}</Segment>
          </SegmentedControl>
          <Tooltip>{t.mode.simpleHint}</Tooltip>
        </TooltipTrigger>
        <div className={styles.tools}>
          {activeMode === "advanced" ? <>
            <IconButton size="sm" label={uiCopy["training"]["formulas"]["createTitle"]} icon={<FormulaMark />} isDisabled={readOnly || !access["training.formulas.custom"].allowed} onPress={() => setFormulaOpen(true)} />
            <FormulaHelp compact />
          </> : null}
          <IconButton label={t.undo} icon={<Undo2 />} onPress={editor.undo} isDisabled={readOnly || !editor.canUndo} />
          <IconButton label={t.redo} icon={<Redo2 />} onPress={editor.redo} isDisabled={readOnly || !editor.canRedo} />
          <KeyboardHelp />
          <IconButton size="sm" label={t.export} icon={<Download />} onPress={() => setExportOpen(true)} />
          {clientContext.assign}
          <TooltipTrigger delay={200}>
            <Button size="sm" variant="primary" iconStart={<Rocket />} isDisabled={readOnly} onPress={async () => { await saveDraft(); if (!editor.isDirty()) setPublishOpen(true); }}>
              {t.publish}
            </Button>
            {editor.dirty ? <Tooltip>{t.publishDirty}</Tooltip> : <Tooltip>{m.training.detail.revisionsBody}</Tooltip>}
          </TooltipTrigger>
        </div>
      </header>

      {clientContext.banners}

      {plan.archived ? <Alert tone="warning" title={t.readOnly} className={styles.banner} /> : null}
      {proLocked && !plan.archived ? <div className={styles.banner}><UpgradeBanner title={t.proLocked.title} body={t.proLocked.body} action={t.proLocked.action} /></div> : null}
      {editor.status === "offline" ? <Alert tone="warning" title={m.errors.network} className={styles.banner} /> : null}

      <div className={styles.body}>
        {activeMode === "simple" ? (
          <WeekView doc={editor.doc} apply={readOnly ? undefined : editor.apply} names={names}
            pro={builder.allowed ? { editor, advancedAllowed: access["training.sets.advanced"].allowed, customFormulas: access["training.formulas.custom"].allowed, onEditNode: setEditNode } : undefined} />
        ) : (
          <SheetCanvas
            doc={editor.doc}
            apply={readOnly ? undefined : editor.apply}
            editor={editor}
            sheet={sheet}
            onSheetChange={setSheet}
            names={names}
            advancedAllowed={access["training.sets.advanced"].allowed}
            customFormulas={access["training.formulas.custom"].allowed}
            onEditNode={setEditNode}
          />
        )}
      </div>
      </div>

      {builderLocked ? (
        <div className={styles.lock} role="dialog" aria-modal="true" aria-labelledby="advanced-lock-title">
          <div className={styles.lockCard}>
            <div className={styles.lockHead}>
              <IconButton className={styles.lockClose} label={m.common.close} icon={<X />} variant="ghost" size="sm" onPress={() => setMode("simple")} />
              <span className={styles.lockBadge}><Sparkles aria-hidden="true" />Pro</span>
              <span className={styles.lockIcon} aria-hidden="true"><Lock /></span>
              <h2 id="advanced-lock-title" className={styles.lockTitle}>{t.locked.title}</h2>
              <p className={styles.lockBody}>{t.locked.body}</p>
            </div>
            <ul className={styles.lockList}>
              {t.locked.points.map((point) => <li key={point}><span className={styles.lockCheck} aria-hidden="true"><Check /></span>{point}</li>)}
            </ul>
            <div className={styles.lockActions}>
              <UpgradeLink href="/app/checkout?plan=Pro" size="lg">{t.locked.upgrade}</UpgradeLink>
              <Button variant="ghost" onPress={() => setMode("simple")}>{t.locked.simple}</Button>
              <p className={styles.lockNote}>{t.locked.note}</p>
            </div>
          </div>
        </div>
      ) : null}

      <NodeDialog editor={editor} nodeId={editNode} onClose={() => setEditNode(null)} />
      <PublishDialog planId={plan.id} version={editor.version} isOpen={publishOpen} onOpenChange={setPublishOpen} issues={[...(hasActiveWorkout(editor.doc) ? [] : [t.issues.noWorkouts]), ...docIssues, ...invalidCells.values()]} />
      <ExportDialog planId={plan.id} planName={editor.meta.name || plan.name} draft={editor.doc} issues={allIssues} beforeExport={saveDraft} isOpen={exportOpen} onOpenChange={setExportOpen} />
      <ConflictDialog
        isOpen={editor.status === "conflict"}
        onReload={() => reload.mutate()}
        onSaveCopy={() => saveCopy.mutate()}
        reloading={reload.isPending}
        savingCopy={saveCopy.isPending}
      />
      {dialog}
      {clientContext.dialogs}
      {formulaOpen ? <FormulaDialog formula="new" onClose={() => setFormulaOpen(false)} /> : null}
    </div>
    </ClientFormulaContext.Provider></CellValidationContext.Provider>
  );
}
