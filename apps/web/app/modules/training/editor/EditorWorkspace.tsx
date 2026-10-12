import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Redo2, Rocket, Save, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link as RouterLink, useBlocker, useNavigate } from "react-router";
import type { PlanDto } from "@trainflow/api-client-web";
import { Alert, Badge, Button, IconButton, Segment, SegmentedControl, Tooltip, TooltipTrigger, toast } from "@trainflow/ui-web";
import { useExerciseNames } from "~/modules/exercises";
import { useFeatures } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useDiscardConfirm } from "~/shared/lib/useConfirm";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { useUnsavedWorkGuard } from "~/shared/session/dirty-guard";
import { createPlan, getPlan } from "../api";
import { PublishDialog } from "../components/PublishDialog";
import { ExportDialog } from "../import-export/ExportDialog";
import { trainingKeys } from "../queries";
import { ConflictDialog } from "./components/ConflictDialog";
import { KeyboardHelp } from "./components/KeyboardHelp";
import { NodeDialog } from "./components/NodeDialog";
import { SaveStatus } from "./components/SaveStatus";
import { SheetCanvas, usePersistentSheet } from "./components/SheetCanvas";
import { WeekView } from "./components/WeekView";
import { locate, uniqueExerciseIds } from "./model/document";
import { isSimpleShape } from "./model/structure";
import { storedMode, storeMode, type EditorMode } from "./mode-preference";
import { useEditor } from "./useEditor";
import styles from "./EditorWorkspace.module.css";

function isTextTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

export function EditorWorkspace({ plan, version }: { plan: PlanDto; version: number }) {
  const m = useT();
  const t = m.editor;
  const navigate = useNavigate();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const access = useFeatures(["training.programs.manage", "training.templates.manage", "training.sets.advanced", "training.formulas.custom"] as const);
  const canEdit = access["training.programs.manage"].allowed && (plan.kind === "Program" || access["training.templates.manage"].allowed);
  const readOnly = !canEdit || plan.archived;
  const editor = useEditor(plan, version, { readOnly });
  // The last mode picked in this browser wins; without one, plans shaped like one week open in simple
  // mode and others in advanced. Simple only limits what can be created, it never changes the structure.
  const [mode, setModeState] = useState<EditorMode>(() => storedMode() ?? (isSimpleShape(plan.document) ? "simple" : "advanced"));
  const setMode = (next: EditorMode) => {
    setModeState(next);
    storeMode(next);
  };
  const activeMode = mode;
  // Sheet arrangement: remembered in this browser per plan (disconnected cycles stay in memory only).
  const [sheet, setSheet] = usePersistentSheet(plan.id);
  const [editNode, setEditNode] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const leaving = useRef(false);
  const { confirm, dialog } = useDiscardConfirm();
  const names = useExerciseNames(uniqueExerciseIds(editor.doc));
  const { mode: workspaceMode } = useWorkspace();
  const detailPath = workspaceMode === "client" ? `/app/training-plans/${plan.id}` : `/app/programs/${plan.id}`;

  // Cycles disconnected on the sheet exist only in memory; leaving would lose them like unsaved edits.
  const looseRef = useRef(false);
  looseRef.current = sheet.loose.some((cycle) => cycle.days.length > 0 && !locate(editor.doc, cycle.id));
  const hasUnsavedWork = useCallback(() => editor.isDirty() || looseRef.current, [editor]);
  useUnsavedWorkGuard(hasUnsavedWork);

  // In-app navigation away from unsaved work asks first (browser unload is handled by the guard).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !leaving.current && hasUnsavedWork() && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm().then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  // Editor shortcuts: save works everywhere; undo/redo only outside text fields so typing keeps native undo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void editor.save();
      } else if ((key === "z" || key === "y") && !isTextTarget(event.target)) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) editor.redo();
        else editor.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

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

  const validation = editor.status === "error" && editor.error instanceof ApiError && editor.error.status === 400;

  return (
    <div className={styles.workspace}>
      <header className={styles.toolbar} role="toolbar" aria-label={t.toolbar}>
        <RouterLink to={detailPath} className={styles.back} aria-label={t.back}>
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
        </div>
        <SaveStatus status={editor.status} />
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
          <IconButton label={t.undo} icon={<Undo2 />} onPress={editor.undo} isDisabled={readOnly || !editor.canUndo} />
          <IconButton label={t.redo} icon={<Redo2 />} onPress={editor.redo} isDisabled={readOnly || !editor.canRedo} />
          <KeyboardHelp />
          <Button size="sm" variant="ghost" iconStart={<Download />} onPress={() => setExportOpen(true)}>
            {t.export}
          </Button>
          <TooltipTrigger delay={200}>
            <Button size="sm" iconStart={<Rocket />} isDisabled={readOnly || editor.status === "saving"} onPress={async () => { await editor.save(); if (!editor.isDirty()) setPublishOpen(true); }}>
              {t.publish}
            </Button>
            {editor.dirty ? <Tooltip>{t.publishDirty}</Tooltip> : <Tooltip>{m.training.detail.revisionsBody}</Tooltip>}
          </TooltipTrigger>
          <Button size="sm" variant="primary" iconStart={<Save />} isDisabled={readOnly || !editor.dirty} loading={editor.status === "saving"} onPress={() => void editor.save()}>
            {t.save}
          </Button>
        </div>
      </header>

      {plan.archived ? <Alert tone="warning" title={t.readOnly} className={styles.banner} /> : null}
      {validation ? (
        <Alert tone="danger" title={t.validation} className={styles.banner} live="assertive">
          {(editor.error as ApiError).problem?.detail}
        </Alert>
      ) : editor.status === "error" ? (
        <Alert tone="danger" title={errorText(m, editor.error)} className={styles.banner} />
      ) : null}
      {editor.status === "offline" ? <Alert tone="warning" title={m.errors.network} className={styles.banner} /> : null}

      <div className={styles.body}>
        {activeMode === "simple" ? (
          <WeekView doc={editor.doc} apply={readOnly ? undefined : editor.apply} names={names} />
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

      <NodeDialog editor={editor} nodeId={editNode} onClose={() => setEditNode(null)} />
      <PublishDialog planId={plan.id} version={editor.version} isOpen={publishOpen} onOpenChange={setPublishOpen} />
      <ExportDialog planId={plan.id} planName={editor.meta.name || plan.name} isOpen={exportOpen} onOpenChange={setExportOpen} />
      <ConflictDialog
        isOpen={editor.status === "conflict"}
        onReload={() => reload.mutate()}
        onSaveCopy={() => saveCopy.mutate()}
        reloading={reload.isPending}
        savingCopy={saveCopy.isPending}
      />
      {dialog}
    </div>
  );
}
