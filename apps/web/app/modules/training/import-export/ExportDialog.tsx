import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TrainingDocument } from "@metrivum/api-client-web";
import { Alert, AlertDialog, Button, Dialog, FileCard, Option, Radio, RadioGroup, Select, Spinner, toast, DialogFooter } from "@metrivum/ui-web";
import { useFeatures } from "~/shared/access";
import { formatBytes, formatDateTime } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { isAbortError } from "~/shared/http/errors";
import { safeFileName, saveBlob } from "~/shared/http/download";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { exportRevision, getRevision, type ExportScope } from "../api";
import { trainingKeys, useRevisions } from "../queries";
import { useExerciseNames } from "~/modules/exercises";
import { uniqueExerciseIds } from "../editor/model/document";
import { useDocumentIssues } from "../editor/useDocumentIssues";
import styles from "./ExportDialog.module.css";

function scopeItems(doc: TrainingDocument | undefined, scope: ExportScope, dayLabel: (n: number) => string) {
  if (!doc || scope === "program") return [];
  const items: Array<{ id: string; label: string }> = [];
  for (const block of doc.blocks) {
    // Holders of a cycle or workout outside a block or cycle are not exported on their own.
    if (scope === "block" && !block.implicit) items.push({ id: block.id, label: block.name });
    for (const cycle of block.cycles) {
      if (scope === "cycle" && !cycle.implicit) items.push({ id: cycle.id, label: block.implicit ? cycle.name : `${block.name} › ${cycle.name}` });
      for (const day of cycle.days)
        for (const workout of day.workouts)
          if (scope === "workout") items.push({ id: workout.id, label: cycle.implicit ? workout.name : `${cycle.name} › ${dayLabel(day.dayNumber)} › ${workout.name}` });
    }
  }
  return items;
}

type DownloadState = { status: "idle" } | { status: "working" } | { status: "done"; name: string; size: number } | { status: "error"; error: unknown };

/**
 * Downloads a server-generated CSV/PDF of the current draft or of an applied revision (never a browser-made
 * substitute). The draft exports even with problems in it, after a warning. Pass `beforeExport` to save first.
 */
export function ExportDialog({ planId, planName, draft, issues: known, beforeExport, isOpen, onOpenChange }: {
  planId: string;
  planName: string;
  draft: TrainingDocument;
  /** Problems already known (the editor's status); without them the dialog checks the draft itself. */
  issues?: string[];
  beforeExport?: () => Promise<unknown>;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useT();
  const t = m.training.export;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const access = useFeatures(["training.export.csv", "training.export.pdf"] as const);
  const revisions = useRevisions(planId);
  const [revision, setRevision] = useState<number | "draft">("draft");
  const [warning, setWarning] = useState(false);
  const names = useExerciseNames(uniqueExerciseIds(draft));
  const found = useDocumentIssues(draft, names);
  const issues = known ?? found;
  const [format, setFormat] = useState<"csv" | "pdf">("pdf");
  const [scope, setScope] = useState<ExportScope>("program");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [delimiter, setDelimiter] = useState<"comma" | "semicolon" | "tab">("comma");
  const [state, setState] = useState<DownloadState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!access["training.export.pdf"].allowed && access["training.export.csv"].allowed) setFormat("csv");
  }, [access]);
  useEffect(() => {
    // Closing the dialog cancels a running download.
    if (!isOpen) {
      controller.current?.abort();
      setState({ status: "idle" });
    }
  }, [isOpen]);

  const snapshot = useQuery({
    queryKey: [...trainingKeys.revisions(a, planId), "snapshot", revision],
    queryFn: ({ signal }) => getRevision(api, planId, revision as number, signal),
    enabled: isOpen && revision !== "draft" && scope !== "program",
    staleTime: Infinity,
  });
  const items = useMemo(() => scopeItems(revision === "draft" ? draft : snapshot.data?.snapshot.document, scope, m.editor.dayLabel), [revision, draft, snapshot.data, scope, m.editor.dayLabel]);
  useEffect(() => setScopeId(items[0]?.id ?? null), [items]);

  const formatAllowed = access[format === "csv" ? "training.export.csv" : "training.export.pdf"].allowed;
  const canDownload = formatAllowed && (scope === "program" || scopeId !== null) && state.status !== "working";

  async function download() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState({ status: "working" });
    try {
      if (revision === "draft") await beforeExport?.();
      const blob = await exportRevision(api, planId, revision, { format, scope, scopeId: scopeId ?? undefined, delimiter }, abort.signal);
      // CORS doesn't expose Content-Disposition, so the name is built here (see api-gaps.md).
      const suffix = scope === "program" ? "" : `-${scope}`;
      const name = `${safeFileName(planName)}${revision === "draft" ? "" : `-r${revision}`}${suffix}.${format}`;
      saveBlob(blob, name);
      setState({ status: "done", name, size: blob.size });
      toast({ tone: "success", title: t.ready(name) });
    } catch (error) {
      if (isAbortError(error)) return;
      setState({ status: "error", error });
    }
  }

  // A draft with problems still exports, but only after the coach saw that it has them.
  const start = () => (revision === "draft" && issues.length ? setWarning(true) : void download());

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={t.title} description={t.body} placement="right" closeLabel={m.common.close}>
      <div className={styles.form}>
        {revisions.isError ? <Alert tone="danger" live="assertive" title={errorText(m, revisions.error)} /> : null}
        {(
          <>
            <Select label={t.revision} selectedKey={revision} onSelectionChange={(key) => setRevision(key === "draft" ? "draft" : Number(key))}>
              <Option key="draft" id="draft">{t.draft}</Option>
              {(revisions.data?.items ?? []).map((item) => (
                <Option key={item.number} id={item.number}>
                  {`${m.training.detail.revision(item.number)} · ${formatDateTime(locale, item.publishedAt)}`}
                </Option>
              ))}
            </Select>
            <RadioGroup label={t.format} orientation="horizontal" value={format} onChange={(value) => setFormat(value as "csv" | "pdf")}>
              <Radio value="pdf" isDisabled={!access["training.export.pdf"].allowed}>
                PDF
              </Radio>
              <Radio value="csv" isDisabled={!access["training.export.csv"].allowed}>
                CSV
              </Radio>
            </RadioGroup>
            <Select label={t.scope} selectedKey={scope} onSelectionChange={(key) => setScope(key as ExportScope)}>
              {(["program", "block", "cycle", "workout"] as const).map((key) => (
                <Option key={key} id={key}>
                  {t.scopes[key]}
                </Option>
              ))}
            </Select>
            {scope !== "program" ? (
              snapshot.isPending ? (
                <Spinner size="sm" />
              ) : (
                <Select label={t.item} selectedKey={scopeId} onSelectionChange={(key) => setScopeId(String(key))}>
                  {items.map((item) => (
                    <Option key={item.id} id={item.id}>
                      {item.label}
                    </Option>
                  ))}
                </Select>
              )
            ) : null}
            {format === "csv" ? (
              <Select label={t.delimiter} selectedKey={delimiter} onSelectionChange={(key) => setDelimiter(key as typeof delimiter)}>
                {(["comma", "semicolon", "tab"] as const).map((key) => (
                  <Option key={key} id={key}>
                    {t.delimiters[key]}
                  </Option>
                ))}
              </Select>
            ) : null}
            {state.status !== "idle" ? (
              <FileCard
                name={state.status === "done" ? state.name : `${safeFileName(planName)}.${format}`}
                kind={format.toUpperCase()}
                meta={revision === "draft" ? `${format.toUpperCase()} · ${t.draft}` : t.fileCard(format, revision)}
                status={
                  state.status === "working" ? (
                    <span className={styles.working}>
                      <Spinner size="sm" /> {t.preparing}
                    </span>
                  ) : state.status === "done" ? (
                    formatBytes(locale, state.size)
                  ) : (
                    <span className={styles.error}>{errorText(m, state.error)}</span>
                  )
                }
              />
            ) : null}
          </>
        )}
        <DialogFooter>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {m.common.close}
          </Button>
          <Button variant="primary" iconStart={<Download />} isDisabled={!canDownload} loading={state.status === "working"} onPress={start}>
            {t.submit}
          </Button>
        </DialogFooter>
      </div>
      <AlertDialog
        isOpen={warning}
        onOpenChange={setWarning}
        title={t.issuesTitle}
        confirmLabel={t.issuesConfirm}
        cancelLabel={m.common.cancel}
        onConfirm={() => { setWarning(false); void download(); }}
      >
        {t.issuesBody(issues.length)}
      </AlertDialog>
    </Dialog>
  );
}
