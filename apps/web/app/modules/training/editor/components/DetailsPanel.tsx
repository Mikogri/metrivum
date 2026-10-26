import { Plus, Trash2 } from "lucide-react";
import type { ExerciseGroup, FormulaUse, Prescription, SetKind, TrainingSet, Unit, Workout } from "@trainflow/api-client-web";
import { SET_KINDS } from "@trainflow/api-client-web";
import { Alert, Button, IconButton, NumberInput, Option, SegmentedControl, Segment, Select, TextArea, TextField } from "@trainflow/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { changeSetKind, findSet, groupOf, makeGroup, newSegment, removeGroup, setIsAdvanced, setPrescription, updateGroup, updateNode, updateSegments, SEGMENTED } from "../model/document";
import { TEMPO_PATTERN } from "../model/notation";
import type { EditorApi } from "../useEditor";
import { FormulaPicker } from "./FormulaPicker";
import type { GridSelection } from "./SetGrid";
import styles from "./DetailsPanel.module.css";

const MASS: Unit[] = ["Kg", "Lb"];
const TIME: Unit[] = ["Seconds", "Minutes"];
const DISTANCE: Unit[] = ["Meters", "Kilometers"];

function loadMode(p: Prescription): "none" | "absolute" | "percent" | "formula" {
  if (p.load) return "absolute";
  if (p.loadPercent !== null && p.loadPercent !== undefined) return "percent";
  if (p.loadFormula) return "formula";
  return "none";
}

function UnitSelect({ label, units, value, onChange, isDisabled }: { label: string; units: Unit[]; value: Unit; onChange: (unit: Unit) => void; isDisabled?: boolean }) {
  const m = useT();
  return (
    <Select label={label} selectedKey={value} onSelectionChange={(key) => onChange(key as Unit)} size="sm" isDisabled={isDisabled}>
      {units.map((unit) => (
        <Option key={unit} id={unit}>
          {m.editor.units[unit] || unit}
        </Option>
      ))}
    </Select>
  );
}

/** Typed editor for one prescription (a set or a segment). */
function PrescriptionFields({ p, onChange, disabled, isAmrap, customFormulas, simple = false }: { p: Prescription; onChange: (next: Prescription) => void; disabled: boolean; isAmrap: boolean; customFormulas: boolean; simple?: boolean }) {
  const m = useT();
  const t = m.editor.panel;
  const mode = loadMode(p);
  const effort = p.rpe !== null && p.rpe !== undefined ? "rpe" : p.rir !== null && p.rir !== undefined ? "rir" : "none";
  const set = (patch: Partial<Prescription>) => onChange({ ...p, ...patch });
  const tempoInvalid = Boolean(p.tempo && !TEMPO_PATTERN.test(p.tempo));

  return (
    <div className={styles.fields}>
      {isAmrap ? (
        <p className={styles.note}>{t.amrapNote}</p>
      ) : (
        <div className={styles.row2}>
          <NumberInput placeholder={m.common.ph.number}
            label={t.repsMin}
            size="sm"
            minValue={1}
            maxValue={10000}
            step={1}
            value={p.reps?.minimum ?? NaN}
            isDisabled={disabled}
            onChange={(value) => set({ reps: Number.isNaN(value) ? null : { minimum: value, maximum: Math.max(value, p.reps?.maximum ?? value) } })}
          />
          <NumberInput placeholder={m.common.ph.number}
            label={t.repsMax}
            size="sm"
            minValue={p.reps?.minimum ?? 1}
            maxValue={10000}
            step={1}
            value={p.reps?.maximum ?? NaN}
            isDisabled={disabled || !p.reps}
            onChange={(value) => p.reps && set({ reps: { minimum: p.reps.minimum, maximum: Number.isNaN(value) ? p.reps.minimum : value } })}
          />
        </div>
      )}

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t.loadMode}</span>
        <SegmentedControl
          size="sm"
          aria-label={t.loadMode}
          selectedKeys={[mode]}
          isDisabled={disabled}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            const cleared: Prescription = { ...p, load: null, loadPercent: null, baseValue: null, loadFormula: null };
            if (next === "absolute") onChange({ ...cleared, load: { minimum: { value: 0, unit: "Kg" }, maximum: { value: 0, unit: "Kg" } } });
            else if (next === "percent") onChange({ ...cleared, loadPercent: 75, baseValue: { value: 100, unit: "Kg" } });
            else if (next === "formula") onChange({ ...cleared, loadFormula: { formulaId: null, builtIn: "percentage-1rm", version: 1, inputs: {} } });
            else onChange(cleared);
          }}
        >
          {/* Simple mode offers plain loads only, but a formula already in the plan stays visible. */}
          {(simple && mode !== "formula" ? (["none", "absolute", "percent"] as const) : (["none", "absolute", "percent", "formula"] as const)).map((key) => (
            <Segment key={key} id={key}>
              {t.loadModes[key]}
            </Segment>
          ))}
        </SegmentedControl>
        {mode === "absolute" && p.load ? (
          <div className={styles.row3}>
            <NumberInput placeholder={m.common.ph.number}
              label={t.loadMin}
              size="sm"
              minValue={0}
              value={p.load.minimum.value}
              isDisabled={disabled}
              onChange={(value) => set({ load: { minimum: { ...p.load!.minimum, value: value || 0 }, maximum: { ...p.load!.maximum, value: Math.max(value || 0, p.load!.maximum.value) } } })}
            />
            <NumberInput placeholder={m.common.ph.number}
              label={t.loadMax}
              size="sm"
              minValue={p.load.minimum.value}
              value={p.load.maximum.value}
              isDisabled={disabled}
              onChange={(value) => set({ load: { minimum: p.load!.minimum, maximum: { ...p.load!.maximum, value: Number.isNaN(value) ? p.load!.minimum.value : value } } })}
            />
            <UnitSelect
              label={t.unit}
              units={MASS}
              value={p.load.minimum.unit}
              isDisabled={disabled}
              onChange={(unit) => set({ load: { minimum: { ...p.load!.minimum, unit }, maximum: { ...p.load!.maximum, unit } } })}
            />
          </div>
        ) : null}
        {mode === "percent" ? (
          <div className={styles.row3}>
            <NumberInput placeholder={m.common.ph.number} label={t.percent} size="sm" unit="%" minValue={0.1} maxValue={1000} value={p.loadPercent ?? NaN} isDisabled={disabled} onChange={(value) => set({ loadPercent: Number.isNaN(value) ? null : value })} />
            <NumberInput placeholder={m.common.ph.number}
              label={t.baseValue}
              size="sm"
              minValue={0}
              value={p.baseValue?.value ?? NaN}
              isDisabled={disabled}
              onChange={(value) => set({ baseValue: Number.isNaN(value) ? null : { value, unit: p.baseValue?.unit ?? "Kg" } })}
            />
            <UnitSelect label={t.unit} units={MASS} value={p.baseValue?.unit ?? "Kg"} isDisabled={disabled} onChange={(unit) => set({ baseValue: { value: p.baseValue?.value ?? 0, unit } })} />
          </div>
        ) : null}
        {mode === "formula" && p.loadFormula ? (
          <FormulaPicker value={p.loadFormula} customAllowed={customFormulas} isDisabled={disabled} onChange={(loadFormula: FormulaUse) => set({ loadFormula })} />
        ) : null}
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>{t.effortMode}</span>
        <SegmentedControl
          size="sm"
          aria-label={t.effortMode}
          selectedKeys={[effort]}
          isDisabled={disabled}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "rpe") set({ rpe: p.rpe ?? 8, rir: null });
            else if (next === "rir") set({ rir: p.rir ?? 2, rpe: null });
            else set({ rpe: null, rir: null });
          }}
        >
          {(["none", "rpe", "rir"] as const).map((key) => (
            <Segment key={key} id={key}>
              {t.effortModes[key]}
            </Segment>
          ))}
        </SegmentedControl>
        {effort === "rpe" ? (
          <NumberInput placeholder={m.common.ph.number} label={t.rpe} size="sm" minValue={0} maxValue={10} step={0.5} value={p.rpe ?? NaN} isDisabled={disabled} onChange={(value) => set({ rpe: Number.isNaN(value) ? null : value })} />
        ) : null}
        {effort === "rir" ? (
          <NumberInput placeholder={m.common.ph.number} label={t.rir} size="sm" minValue={0} maxValue={100} step={0.5} value={p.rir ?? NaN} isDisabled={disabled} onChange={(value) => set({ rir: Number.isNaN(value) ? null : value })} />
        ) : null}
      </div>

      {(
        [
          ["rest", t.rest, TIME],
          ["workTime", t.workTime, TIME],
          ["distance", t.distance, DISTANCE],
        ] as const
      ).map(([key, label, units]) => {
        const quantity = p[key];
        return (
          <div key={key} className={styles.row2}>
            <NumberInput placeholder={m.common.ph.number}
              label={label}
              size="sm"
              minValue={0}
              value={quantity?.value ?? NaN}
              isDisabled={disabled}
              onChange={(value) => set({ [key]: Number.isNaN(value) ? null : { value, unit: quantity?.unit ?? units[0]! } } as Partial<Prescription>)}
            />
            <UnitSelect label={t.unit} units={[...units]} value={quantity?.unit ?? units[0]!} isDisabled={disabled} onChange={(unit) => set({ [key]: { value: quantity?.value ?? 0, unit } } as Partial<Prescription>)} />
          </div>
        );
      })}

      <TextField placeholder={m.common.ph.tempo}
        label={t.tempo}
        size="sm"
        value={p.tempo ?? ""}
        isDisabled={disabled}
        description={t.tempoHint}
        isInvalid={tempoInvalid}
        errorMessage={t.tempoInvalid}
        onChange={(value) => set({ tempo: value.toUpperCase().replace(/\s/g, "") || null })}
      />
      <TextArea placeholder={m.common.ph.athleteNotes} label={t.notes} rows={2} value={p.comment ?? ""} isDisabled={disabled} onChange={(value) => set({ comment: value || null })} maxLength={2000} />
    </div>
  );
}

export function DetailsPanel({
  editor,
  workout,
  selection,
  advancedAllowed,
  customFormulas,
  readOnly,
  simple = false,
}: {
  editor: EditorApi;
  workout: Workout;
  selection: GridSelection;
  advancedAllowed: boolean;
  customFormulas: boolean;
  readOnly: boolean;
  /** Simple mode: plain loads only, no formula option. */
  simple?: boolean;
}) {
  const m = useT();
  const t = m.editor.panel;
  const found = selection.setId ? findSet(editor.doc, selection.setId) : null;
  const instance = workout.exercises.find((e) => e.id === selection.instanceId);
  if (!instance) return <p className={styles.empty}>{t.noSelection}</p>;
  const set: TrainingSet | null = found?.set ?? null;
  const setIndex = set ? instance.sets.findIndex((s) => s.id === set.id) : -1;
  const locked = Boolean(set && set.kind !== "Standard" && !advancedAllowed);
  const disabled = readOnly || locked;
  const group = groupOf(workout, instance.id);
  const instanceIndex = workout.exercises.findIndex((e) => e.id === instance.id);
  const next = workout.exercises[instanceIndex + 1];
  const topSets = set ? instance.sets.slice(0, setIndex).filter((s) => s.kind === "TopSet") : [];

  return (
    <div className={styles.panel}>
      <section className={styles.section} aria-labelledby="panel-exercise">
        <h3 id="panel-exercise" className={styles.title}>
          {t.exercise}
        </h3>
        <TextArea placeholder={m.common.ph.comment}
          label={t.comment}
          rows={2}
          value={instance.comment}
          isDisabled={readOnly}
          maxLength={2000}
          onChange={(value) => editor.apply((doc) => updateNode(doc, instance.id, { comment: value }))}
        />
        <div className={styles.groupBox}>
          <span className={styles.groupLabel}>{t.groups}</span>
          {group ? (
            <GroupEditor group={group} workoutId={workout.id} editor={editor} disabled={readOnly || (group.kind !== "Superset" && !advancedAllowed)} />
          ) : (
            <div className={styles.inline}>
              <Button
                size="sm"
                isDisabled={readOnly || !next || Boolean(next && groupOf(workout, next.id))}
                onPress={() => next && editor.apply((doc) => makeGroup(doc, workout.id, [instance.id, next.id], "Superset"))}
              >
                {t.makeSuperset}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isDisabled={readOnly || !advancedAllowed || !next || Boolean(next && groupOf(workout, next.id))}
                onPress={() => next && editor.apply((doc) => makeGroup(doc, workout.id, [instance.id, next.id], "Circuit"))}
              >
                {t.makeCircuit}
              </Button>
            </div>
          )}
        </div>
      </section>

      {set ? (
        <section className={styles.section} aria-labelledby="panel-set">
          <h3 id="panel-set" className={styles.title}>
            {t.set(setIndex + 1)}
          </h3>
          {locked ? <Alert tone="warning" title={t.advancedLocked} /> : null}
          <Select
            label={t.kind}
            size="sm"
            selectedKey={set.kind}
            isDisabled={readOnly}
            onSelectionChange={(key) => editor.apply((doc) => changeSetKind(doc, set.id, key as SetKind))}
            disabledKeys={advancedAllowed ? [] : SET_KINDS.filter((kind) => setIsAdvanced({ ...set, kind }) && kind !== set.kind)}
          >
            {SET_KINDS.map((kind) => (
              <Option key={kind} id={kind}>
                {m.editor.setKinds[kind]}
              </Option>
            ))}
          </Select>
          {set.kind === "BackOff" ? (
            <Select
              label={t.sourceSet}
              size="sm"
              placeholder={t.sourceSetNone}
              selectedKey={set.sourceSetId ?? null}
              isDisabled={disabled}
              description={topSets.length ? undefined : t.sourceRule}
              onSelectionChange={(key) => editor.apply((doc) => updateNode(doc, set.id, { sourceSetId: String(key) }))}
            >
              {topSets.map((top) => (
                <Option key={top.id} id={top.id}>
                  {t.set(instance.sets.indexOf(top) + 1)}
                </Option>
              ))}
            </Select>
          ) : null}
          <PrescriptionFields
            p={set.prescription}
            disabled={disabled}
            isAmrap={set.kind === "Amrap"}
            customFormulas={customFormulas}
            simple={simple}
            onChange={(p) => editor.apply((doc) => setPrescription(doc, set.id, p))}
          />
          {SEGMENTED.has(set.kind) ? (
            <div className={styles.segments}>
              <div className={styles.segmentsHeader}>
                <span className={styles.groupLabel}>{t.segments}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconStart={<Plus />}
                  isDisabled={disabled || (set.segments?.length ?? 0) >= 20}
                  onPress={() => editor.apply((doc) => updateSegments(doc, set.id, [...(set.segments ?? []), newSegment(set.segments?.at(-1)?.prescription ?? set.prescription)]))}
                >
                  {t.addSegment}
                </Button>
              </div>
              <p className={styles.note}>{t.segmentsRule}</p>
              {(set.segments ?? []).map((segment, index) => (
                <details key={segment.id} className={styles.segment} open={index === 0}>
                  <summary>
                    <span>{t.segment(index + 1)}</span>
                    <IconButton
                      size="sm"
                      label={`${m.editor.remove} ${t.segment(index + 1)}`}
                      icon={<Trash2 />}
                      isDisabled={disabled || (set.segments?.length ?? 0) <= 2}
                      onPress={() => editor.apply((doc) => updateSegments(doc, set.id, (set.segments ?? []).filter((s) => s.id !== segment.id)))}
                    />
                  </summary>
                  <PrescriptionFields
                    p={segment.prescription}
                    disabled={disabled}
                    isAmrap={false}
                    customFormulas={customFormulas}
                    simple={simple}
                    onChange={(p) =>
                      editor.apply((doc) => updateSegments(doc, set.id, (set.segments ?? []).map((s) => (s.id === segment.id ? { ...s, prescription: p } : s))))
                    }
                  />
                </details>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function GroupEditor({ group, workoutId, editor, disabled }: { group: ExerciseGroup; workoutId: string; editor: EditorApi; disabled: boolean }) {
  const m = useT();
  const t = m.editor.panel;
  return (
    <div className={styles.fields}>
      <p className={styles.groupKind}>{t.groupKind[group.kind]}</p>
      <div className={styles.row2}>
        <NumberInput placeholder={m.common.ph.number}
          label={t.rounds}
          size="sm"
          minValue={1}
          maxValue={100}
          value={group.rounds}
          isDisabled={disabled}
          onChange={(value) => editor.apply((doc) => updateGroup(doc, workoutId, group.id, { rounds: Number.isNaN(value) ? 1 : value }))}
        />
        <NumberInput placeholder={m.common.ph.number}
          label={t.groupRest}
          size="sm"
          minValue={0}
          maxValue={86400}
          value={group.restSeconds}
          isDisabled={disabled}
          onChange={(value) => editor.apply((doc) => updateGroup(doc, workoutId, group.id, { restSeconds: Number.isNaN(value) ? 0 : value }))}
        />
      </div>
      {/* Ungrouping removes an advanced construct, which stays allowed after access is revoked. */}
      <Button size="sm" variant="ghost" onPress={() => editor.apply((doc) => removeGroup(doc, workoutId, group.id))}>
        {t.ungroup}
      </Button>
    </div>
  );
}
