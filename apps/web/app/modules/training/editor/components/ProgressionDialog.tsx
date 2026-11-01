import { useEffect, useState } from "react";
import type { TrainingDocument } from "@metrivum/api-client-web";
import { Alert, Button, Dialog, NumberInput, Option, Segment, SegmentedControl, Select, toast } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useT } from "~/shared/i18n/AppLocale";
import { applyProgression, blockExerciseIds, type ProgressionRule } from "../model/cells";

/**
 * Generates a block's numbers from its first cycle: pick an exercise, what to increase and the step
 * per cycle. The result is ordinary cell values, so every day can still be changed by hand.
 */
export function ProgressionDialog({
  blockId,
  doc,
  names,
  apply,
  onClose,
}: {
  blockId: string | null;
  doc: TrainingDocument;
  names: Map<string, ExerciseLabel>;
  apply: (fn: (doc: TrainingDocument) => TrainingDocument) => void;
  onClose: () => void;
}) {
  const m = useT();
  const t = m.editor.sheet.progression;
  const ids = blockId ? blockExerciseIds(doc, blockId) : [];
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [kind, setKind] = useState<ProgressionRule["kind"]>("load");
  const [step, setStep] = useState(2.5);
  const [nothing, setNothing] = useState(false);

  useEffect(() => {
    if (blockId) {
      setExerciseId(ids[0] ?? null);
      setNothing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  return (
    <Dialog
      isOpen={blockId !== null}
      placement="right"
      onOpenChange={(open) => !open && onClose()}
      title={t.title}
      description={t.body}
      size="sm"
      closeLabel={m.common.close}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close}>
            {m.common.cancel}
          </Button>
          <Button
            variant="primary"
            isDisabled={!exerciseId || Number.isNaN(step)}
            onPress={() => {
              if (!blockId || !exerciseId) return;
              const result = applyProgression(doc, blockId, exerciseId, { kind, step });
              if (result.changed === 0) {
                setNothing(true);
                return;
              }
              apply(() => result.doc);
              toast({ tone: "success", title: t.applied(result.changed) });
              close();
            }}
          >
            {t.apply}
          </Button>
        </>
      )}
    >
      {ids.length === 0 ? (
        <Alert tone="info" title={t.empty} />
      ) : (
        <div style={{ display: "grid", gap: "var(--tf-space-4)" }}>
          <Select label={t.exercise} selectedKey={exerciseId} onSelectionChange={(key) => (setExerciseId(String(key)), setNothing(false))}>
            {ids.map((id) => (
              <Option key={id} id={id}>
                {names.get(id)?.name ?? "—"}
              </Option>
            ))}
          </Select>
          <div style={{ display: "grid", gap: "var(--tf-space-1-5)" }}>
            <span style={{ color: "var(--tf-color-text-secondary)", fontSize: "var(--tf-text-sm)" }}>{t.kind}</span>
            <SegmentedControl
              aria-label={t.kind}
              size="sm"
              selectedKeys={[kind]}
              onSelectionChange={(keys) => {
                const next = [...keys][0] as ProgressionRule["kind"] | undefined;
                if (!next) return;
                setKind(next);
                setStep(next === "reps" ? 1 : next === "percent" ? 2.5 : 2.5);
                setNothing(false);
              }}
            >
              {(["load", "percent", "reps"] as const).map((k) => (
                <Segment key={k} id={k}>
                  {t.kinds[k]}
                </Segment>
              ))}
            </SegmentedControl>
          </div>
          <NumberInput label={t.step} placeholder={m.common.ph.number} value={step} step={kind === "reps" ? 1 : 0.5} onChange={setStep} />
          {nothing ? <Alert tone="warning" title={t.nothing} /> : null}
        </div>
      )}
    </Dialog>
  );
}
