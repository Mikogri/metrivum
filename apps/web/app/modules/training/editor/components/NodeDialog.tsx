import { useEffect, useState } from "react";
import type { TrainingDocument } from "@trainflow/api-client-web";
import { Alert, Button, Dialog, NumberInput, TextArea, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { locate, updateNode } from "../model/document";
import type { EditorApi } from "../useEditor";
import styles from "./NodeDialog.module.css";

/** Rename / edit a block, cycle, day or workout. */
export function NodeDialog({ editor, nodeId, onClose }: { editor: EditorApi; nodeId: string | null; onClose: () => void }) {
  const m = useT();
  const t = m.editor;
  const doc = editor.doc;
  const at = nodeId ? locate(doc, nodeId) : null;
  const node = at ? resolve(doc, at) : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dayNumber, setDayNumber] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) return;
    setName("name" in node ? node.name : "");
    setDescription("description" in node ? node.description : "");
    if ("dayNumber" in node) setDayNumber(node.dayNumber);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  if (!at || !node || !nodeId) return null;

  const isDay = at.kind === "day";
  const isCycle = at.kind === "cycle";
  const cycle = isDay ? doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]! : isCycle ? doc.blocks[at.blockIndex]!.cycles[at.cycleIndex!]! : null;

  function save() {
    if (!nodeId) return;
    if (isDay && cycle) {
      if (dayNumber < 1 || dayNumber > cycle.dayCount || cycle.days.some((d) => d.dayNumber === dayNumber && d.id !== nodeId)) {
        setError(t.dayTaken);
        return;
      }
      editor.apply((current) => updateNode(current, nodeId, { dayNumber }));
      onClose();
      return;
    }
    if (!name.trim()) {
      setError(m.auth.errors.required);
      return;
    }
    editor.apply((current) => updateNode(current, nodeId, { name: name.trim(), description }));
    onClose();
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={t.rename}
      size="sm"
      closeLabel={m.common.close}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close}>
            {m.common.cancel}
          </Button>
          <Button variant="primary" onPress={save}>
            {m.common.save}
          </Button>
        </>
      )}
    >
      <div className={styles.form}>
        {error ? <Alert tone="danger" title={error} /> : null}
        {isDay ? (
          <NumberInput placeholder={m.common.ph.number} label={t.dayNumber} minValue={1} maxValue={cycle?.dayCount ?? 366} value={dayNumber} onChange={(v) => setDayNumber(Number.isNaN(v) ? 1 : v)} autoFocus />
        ) : (
          <>
            <TextField placeholder={m.common.ph.programName} label={m.training.library.folder.name} value={name} onChange={setName} isRequired autoFocus maxLength={200} />
            <TextArea placeholder={m.common.ph.description} label={m.training.library.createDialog.description} value={description} onChange={setDescription} rows={3} maxLength={4000} />
          </>
        )}
      </div>
    </Dialog>
  );
}

function resolve(doc: TrainingDocument, at: NonNullable<ReturnType<typeof locate>>) {
  const block = doc.blocks[at.blockIndex]!;
  if (at.kind === "block") return block;
  const cycle = block.cycles[at.cycleIndex!]!;
  if (at.kind === "cycle") return cycle;
  const day = cycle.days[at.dayIndex!]!;
  if (at.kind === "day") return day;
  return day.workouts[at.workoutIndex!] ?? null;
}
