import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import type { DocumentKind, FolderDto, PlanListItem } from "@trainflow/api-client-web";
import { Alert, AlertDialog, Button, Dialog, Radio, RadioGroup, TextArea, TextField, toast, DialogFooter } from "@trainflow/ui-web";
import { useFeatureAccess } from "~/shared/access";
import { ApiError } from "~/shared/http/errors";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { copyPlan, createFolder, createPlan, deleteFolder, getPlan, saveDraft, updateFolder } from "../api";
import { emptyDocument } from "../editor/model/document";
import { trainingKeys } from "../queries";
import { FolderField } from "./FolderField";
import styles from "./dialogs.module.css";

function editorPath(kind: DocumentKind, planId: string) {
  return kind === "Template" ? `/app/templates/${planId}/edit` : `/app/programs/${planId}/edit`;
}

/** New plan: it goes into the folder that is open in the library (or the top level), so there is no folder field. */
export function CreatePlanDialog({ kind, folderId, folderName, isOpen, onOpenChange }: { kind: DocumentKind; folderId: string | null; folderName?: string; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const m = useT();
  const t = m.training.library.createDialog;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (isOpen) setSubmitted(false);
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: () => createPlan(api, { name: name.trim(), description: description.trim(), kind, folderId, document: emptyDocument() }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.created });
      onOpenChange(false);
      navigate(editorPath(kind, data.id));
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    mutation.mutate();
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={kind === "Template" ? t.templateTitle : t.programTitle} description={folderId && folderName ? t.savedIn(folderName) : undefined} closeLabel={m.common.close}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {mutation.error ? <Alert tone="danger" title={errorText(m, mutation.error)} /> : null}
        <TextField placeholder={m.common.ph.programName} label={t.name} value={name} onChange={setName} isRequired autoFocus isInvalid={submitted && !name.trim()} errorMessage={m.auth.errors.required} />
        <TextArea placeholder={m.common.ph.description} label={t.description} value={description} onChange={setDescription} rows={3} />
        <DialogFooter>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {m.common.cancel}
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {t.submit}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function CopyPlanDialog({ plan, fromTemplate, onClose }: { plan: PlanListItem | null; fromTemplate?: boolean; onClose: () => void }) {
  const m = useT();
  const t = m.training.library.copyDialog;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templatesAccess = useFeatureAccess("training.templates.manage");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("Program");
  const [folder, setFolder] = useState<string | null>(null);
  useEffect(() => {
    if (!plan) return;
    setName(fromTemplate ? plan.name : t.copyName(plan.name));
    setKind(fromTemplate ? "Program" : plan.kind);
    setFolder(plan.folderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, fromTemplate]);

  const mutation = useMutation({
    mutationFn: () => copyPlan(api, plan!.id, { name: name.trim(), kind, folderId: folder }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.created });
      onClose();
      navigate(data.kind === "Template" ? `/app/templates/${data.id}/edit` : `/app/programs/${data.id}`);
    },
  });

  return (
    <Dialog
      isOpen={plan !== null}
      onOpenChange={(open) => !open && onClose()}
      title={fromTemplate ? t.fromTemplateTitle : t.title}
      description={t.body}
      closeLabel={m.common.close}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) mutation.mutate();
        }}
        noValidate
      >
        {mutation.error ? <Alert tone="danger" title={errorText(m, mutation.error)} /> : null}
        <TextField placeholder={m.common.ph.folderName} label={t.name} value={name} onChange={setName} isRequired autoFocus />
        {fromTemplate ? null : (
          <RadioGroup label={t.kind} orientation="horizontal" value={kind} onChange={(value) => setKind(value as DocumentKind)}>
            <Radio value="Program">{t.program}</Radio>
            <Radio value="Template" isDisabled={!templatesAccess.allowed}>
              {t.template}
            </Radio>
          </RadioGroup>
        )}
        <FolderField label={t.folder} value={folder} onChange={setFolder} />
        <DialogFooter>
          <Button variant="secondary" onPress={onClose}>
            {m.common.cancel}
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {t.submit}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** Moving a document re-saves its draft with a new folder (the API has no separate move call). */
export function MovePlanDialog({ plan, onClose }: { plan: PlanListItem | null; onClose: () => void }) {
  const m = useT();
  const t = m.training.library.moveDialog;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<string | null>(null);
  useEffect(() => setFolder(plan?.folderId ?? null), [plan]);
  const mutation = useMutation({
    mutationFn: async () => {
      const current = await getPlan(api, plan!.id);
      return saveDraft(
        api,
        plan!.id,
        { name: current.data.name, description: current.data.description, folderId: folder, document: current.data.document },
        current.version,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trainingKeys.plans(a) });
      toast({ tone: "success", title: t.moved });
      onClose();
    },
  });
  return (
    <Dialog
      isOpen={plan !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t.title}
      size="sm"
      closeLabel={m.common.close}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close}>
            {m.common.cancel}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onPress={() => mutation.mutate()}>
            {t.submit}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {mutation.error ? <Alert tone="danger" title={errorText(m, mutation.error)} /> : null}
        <FolderField label={m.training.library.createDialog.folder} value={folder} onChange={setFolder} />
      </div>
    </Dialog>
  );
}

type FolderDialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "rename"; folder: FolderDto }
  | { mode: "move"; folder: FolderDto }
  | { mode: "delete"; folder: FolderDto }
  | null;

export function FolderDialogs({ state, onClose, onDeleted }: { state: FolderDialogState; onClose: () => void; onDeleted: (folder: FolderDto) => void }) {
  const m = useT();
  const t = m.training.library.folder;
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (state.mode === "create") {
      setName("");
      setParent(state.parentId);
    } else {
      setName(state.folder.name);
      setParent(state.folder.parentId);
    }
  }, [state]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: trainingKeys.folders(a) });

  const save = useMutation({
    mutationFn: async () => {
      if (!state || state.mode === "delete") return;
      if (state.mode === "create") return createFolder(api, { name: name.trim(), parentId: parent, position: 0 });
      const folder = state.folder;
      const nextParent = state.mode === "move" ? parent : folder.parentId;
      return updateFolder(api, folder.id, { name: state.mode === "rename" ? name.trim() : folder.name, parentId: nextParent, position: folder.position }, folder.version);
    },
    onSuccess: () => {
      void refresh();
      toast({ tone: "success", title: state?.mode === "create" ? t.created : state?.mode === "move" ? t.moved : t.renamed });
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => (state && state.mode === "delete" ? deleteFolder(api, state.folder.id, state.folder.version) : Promise.resolve()),
    onSuccess: () => {
      if (state && state.mode === "delete") onDeleted(state.folder);
      void refresh();
      toast({ tone: "success", title: t.deleted });
      onClose();
    },
  });

  useEffect(() => {
    save.reset();
    remove.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!state) return null;
  if (state.mode === "delete") {
    const notEmpty = remove.error instanceof ApiError && remove.error.status === 409;
    return (
      <AlertDialog
        isOpen
        onOpenChange={(open) => !open && onClose()}
        title={t.deleteTitle}
        tone="danger"
        confirmLabel={m.common.delete}
        cancelLabel={m.common.cancel}
        isConfirming={remove.isPending}
        onConfirm={() => remove.mutate()}
      >
        <p>{t.deleteBody}</p>
        {remove.error ? <Alert tone="danger" title={notEmpty ? t.notEmpty : errorText(m, remove.error)} className={styles.inlineAlert} /> : null}
      </AlertDialog>
    );
  }
  const title = state.mode === "create" ? t.createTitle : state.mode === "rename" ? t.renameTitle : t.moveTitle;
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={title}
      size="sm"
      closeLabel={m.common.close}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close}>
            {m.common.cancel}
          </Button>
          <Button variant="primary" loading={save.isPending} onPress={() => (state.mode === "move" || name.trim() ? save.mutate() : undefined)}>
            {m.common.save}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {save.error ? <Alert tone="danger" title={errorText(m, save.error)} /> : null}
        {state.mode !== "move" ? <TextField placeholder={m.common.ph.folderName} label={t.name} value={name} onChange={setName} isRequired autoFocus /> : null}
        {state.mode !== "rename" ? (
          <FolderField label={t.parent} value={parent} onChange={setParent} excludeId={state.mode === "move" ? state.folder.id : undefined} />
        ) : null}
      </div>
    </Dialog>
  );
}

export type { FolderDialogState };
