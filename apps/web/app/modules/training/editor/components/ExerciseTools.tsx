import { Check, ChevronDown, ChevronsUpDown, Lock } from "lucide-react";
import { useState } from "react";
import { SET_KINDS, type ExerciseInstance, type GroupKind, type SetKind, type Workout } from "@metrivum/api-client-web";
import { Button, Checkbox, Dialog, NumberInput, Option, Select } from "@metrivum/ui-web";
import type { ExerciseLabel } from "~/modules/exercises";
import { useAppLocale, useT } from "~/shared/i18n/AppLocale";
import { changeSetKind, groupOf, makeGroup, removeGroup, setIsAdvanced, updateGroup } from "../model/document";
import type { Apply } from "./ExerciseCells";
import styles from "./ExerciseTools.module.css";

/** The set types offered first, in the order coaches know them; the rest sit under "More types". */
const MAIN_KINDS = ["Standard", "Amrap", "Warmup", "BackOff", "DropSet"] as const satisfies readonly SetKind[];
const MORE_KINDS = SET_KINDS.filter((kind) => !(MAIN_KINDS as readonly SetKind[]).includes(kind));
/** Short marks shown in the Sets column for the types an exercise uses. */
const MARK: Partial<Record<SetKind, string>> = { Warmup: "W", Amrap: "AMRAP", BackOff: "B", DropSet: "D", Ramp: "R", TopSet: "T", RestPause: "RP", Cluster: "C" };

/**
 * Set types and supersets/circuits for one exercise. The trigger sits in the Sets column and shows the types in use;
 * both editor modes edit the same groups and set kinds, without flattening individual prescriptions.
 */
export function ExerciseTools({ workout, instance, names, apply, advancedAllowed, style }: {
  workout: Workout; instance: ExerciseInstance; names: Map<string, ExerciseLabel>; apply?: Apply;
  advancedAllowed: boolean; style: React.CSSProperties;
}) {


  const pl = useAppLocale().locale === "pl";
  const m = useT();
  const kinds = m.editor.setKinds;
  const [open, setOpen] = useState(false);
  const [partners, setPartners] = useState<string[]>([]);
  const [groupKind, setGroupKind] = useState<GroupKind | "None">("None");
  const [perSet, setPerSet] = useState(false);
  const [more, setMore] = useState(false);
  const group = groupOf(workout, instance.id);
  const label = pl ? "Supersety i typy serii" : "Supersets and set types";
  const name = (id: string) => {
    const exercise = workout.exercises.find(e => e.id === id);
    return exercise ? names.get(exercise.exerciseId)?.name ?? m.editor.panel.exercise : "—";
  };
  const candidates = workout.exercises.filter(e => e.id !== instance.id && !groupOf(workout, e.id));
  const groupIndex = group ? workout.groups.indexOf(group) + 1 : null;
  const used = [...new Set(instance.sets.map(s => s.kind))];
  const allKind: SetKind | null = used.length === 1 ? used[0]! : instance.sets.length ? null : "Standard";
  const marks = used.map(kind => MARK[kind]).filter(Boolean) as string[];
  const locked = (kind: SetKind) => !advancedAllowed && instance.sets.some(set => setIsAdvanced({ ...set, kind }) && set.kind !== kind);
  const setAll = (kind: SetKind) => apply?.(doc => instance.sets.reduce((next, set) => changeSetKind(next, set.id, kind), doc));
  const circuitLocked = !advancedAllowed;
  const togglePartner = (id: string, single: boolean) => setPartners(current => single ? [id] : current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
  const canGroup = groupKind === "Superset" ? partners.length === 1 : groupKind === "Circuit" ? partners.length >= 1 && !circuitLocked : false;

  const kindRow = (kind: SetKind) => {
    const disabled = !apply || locked(kind);
    return <li key={kind}>
      <button type="button" className={styles.kindRow} aria-pressed={allKind === kind} disabled={disabled} onClick={() => setAll(kind)}>
        <span>{kinds[kind]}</span>
        {disabled && apply ? <Lock aria-hidden="true" className={styles.kindLock} /> : allKind === kind ? <Check aria-hidden="true" className={styles.kindCheck} /> : null}
      </button>
    </li>;
  };

  return <>
    <button type="button" data-no-drag className={styles.trigger} style={style} aria-label={`${label}: ${name(instance.id)}`} aria-haspopup="dialog"
      title={[group ? `${group.kind} ${groupIndex}` : "", ...used.filter(k => k !== "Standard").map(k => kinds[k])].filter(Boolean).join(" · ") || label}
      data-grouped={!!group || undefined} data-marked={marks.length > 0 || undefined} onPointerDown={event => event.stopPropagation()}
      onClick={event => { event.stopPropagation(); setPartners(candidates[0] ? [candidates[0].id] : []); setGroupKind("None"); setOpen(true); }}>
      {group ? <span className={styles.groupMark}>{group.kind === "Circuit" ? "C" : "S"}{groupIndex}</span> : null}
      {marks.length ? <span>{marks.slice(0, 2).join("·")}</span> : group ? null : <ChevronsUpDown aria-hidden="true" />}
    </button>
    {open && <Dialog isOpen placement="right" size="sm" title={label} description={name(instance.id)} onOpenChange={setOpen}
      footer={close => <Button onPress={close}>{m.common.close}</Button>}>
      <div className={styles.content}>
        <section className={styles.section} aria-labelledby="tools-kind">
          <header className={styles.sectionHead}>
            <h3 id="tools-kind">{pl ? "Typ serii" : m["editor"]["panel"]["kind"]}</h3>
            <span>{allKind ? (pl ? "Wszystkie serie" : "All sets") : (pl ? "Różne typy" : "Mixed types")}</span>
          </header>
          <ul className={styles.kindList}>
            {MAIN_KINDS.map(kindRow)}
            {more ? MORE_KINDS.map(kindRow) : null}
          </ul>
          <button type="button" className={styles.linkButton} onClick={() => setMore(v => !v)} aria-expanded={more}>
            {more ? (pl ? "Mniej typów" : "Fewer types") : (pl ? "Więcej typów" : "More types")}<ChevronDown aria-hidden="true" data-open={more || undefined} />
          </button>
          {instance.sets.length > 1 ? <>
            <button type="button" className={styles.linkButton} onClick={() => setPerSet(v => !v)} aria-expanded={perSet}>
              {pl ? "Ustaw osobno dla każdej serii" : "Set each set separately"}<ChevronDown aria-hidden="true" data-open={perSet || undefined} />
            </button>
            {perSet ? <div className={styles.perSet}>
              {instance.sets.map((set, index) => <Select key={set.id} size="sm" label={m.editor.panel.set(index + 1)} selectedKey={set.kind} isDisabled={!apply}
                disabledKeys={SET_KINDS.filter(kind => !advancedAllowed && setIsAdvanced({ ...set, kind }) && kind !== set.kind)}
                onSelectionChange={key => apply?.(doc => changeSetKind(doc, set.id, key as SetKind))}>
                {SET_KINDS.map(kind => <Option id={kind} key={kind}>{kinds[kind]}</Option>)}
              </Select>)}
            </div> : null}
          </> : instance.sets.length === 1 ? <div className={styles.perSet}>
            <Select size="sm" label={m.editor.panel.set(1)} selectedKey={instance.sets[0]!.kind} isDisabled={!apply}
              disabledKeys={SET_KINDS.filter(kind => !advancedAllowed && setIsAdvanced({ ...instance.sets[0]!, kind }) && kind !== instance.sets[0]!.kind)}
              onSelectionChange={key => apply?.(doc => changeSetKind(doc, instance.sets[0]!.id, key as SetKind))}>
              {SET_KINDS.map(kind => <Option id={kind} key={kind}>{kinds[kind]}</Option>)}
            </Select>
          </div> : null}
          <p className={styles.note}>{pl ? "Zmiana typu zachowuje wpisane wartości serii." : "Changing the type keeps the values entered for each set."}</p>
        </section>

        <section className={styles.section} aria-labelledby="tools-group">
          <header className={styles.sectionHead}><h3 id="tools-group">{pl ? "Łączenie ćwiczeń" : "Linking exercises"}</h3></header>
          {group ? <>
            <div className={styles.groupCard}>
              <strong>{group.kind === "Circuit" ? (pl ? "Obwód" : m["editor"]["panel"]["groupKind"]["Circuit"]) : m["ui"]["Super Set"]} {groupIndex}</strong>
              <span>{group.exerciseIds.map(name).join(" + ")}</span>
            </div>
            <NumberInput label={pl ? "Przerwa po rundzie (s)" : "Rest after round (s)"} minValue={0} maxValue={86400} value={Number(group.restSeconds)} isDisabled={!apply || (group.kind !== "Superset" && !advancedAllowed)}
              onChange={value => Number.isFinite(value) && apply?.(doc => updateGroup(doc, workout.id, group.id, { restSeconds: value }))} />
            {group.kind === "Circuit" ? <NumberInput label={pl ? "Rundy" : m["editor"]["panel"]["rounds"]} minValue={1} maxValue={20} value={Number(group.rounds)} isDisabled={!apply || !advancedAllowed}
              onChange={value => Number.isFinite(value) && apply?.(doc => updateGroup(doc, workout.id, group.id, { rounds: value }))} /> : null}
            <Button isDisabled={!apply} onPress={() => apply?.(doc => removeGroup(doc, workout.id, group.id))}>{pl ? "Rozłącz ćwiczenia" : "Unlink exercises"}</Button>
          </> : <>
            <ul className={styles.kindList} role="radiogroup" aria-label={pl ? "Rodzaj łączenia" : "Link type"}>
              {(["None", "Superset", "Circuit"] as const).map(kind => <li key={kind}>
                <button type="button" role="radio" aria-checked={groupKind === kind} className={styles.kindRow} disabled={!apply || (kind !== "None" && !candidates.length) || (kind === "Circuit" && circuitLocked)}
                  onClick={() => { setGroupKind(kind); setPartners(candidates[0] ? [candidates[0].id] : []); }}>
                  <span>{kind === "None" ? (pl ? "Bez łączenia" : "Not linked") : kind === "Superset" ? m["ui"]["Super Set"] : (pl ? "Obwód (Circuit)" : m["editor"]["panel"]["groupKind"]["Circuit"])}</span>
                  {kind === "Circuit" && circuitLocked ? <Lock aria-hidden="true" className={styles.kindLock} /> : groupKind === kind ? <Check aria-hidden="true" className={styles.kindCheck} /> : null}
                </button>
              </li>)}
            </ul>
            {groupKind !== "None" ? <div className={styles.partners}>
              <p className={styles.note}>{groupKind === "Superset" ? (pl ? "Wybierz ćwiczenie do pary:" : "Pick the exercise to pair with:") : (pl ? "Wybierz ćwiczenia do obwodu:" : "Pick the exercises for the circuit:")}</p>
              {candidates.map(e => <Checkbox key={e.id} isSelected={partners.includes(e.id)} onChange={() => togglePartner(e.id, groupKind === "Superset")}>{`${workout.exercises.indexOf(e) + 1}. ${name(e.id)}`}</Checkbox>)}
              <Button variant="primary" isDisabled={!apply || !canGroup} onPress={() => {
                const ids = [instance.id, ...partners.filter(id => candidates.some(e => e.id === id))];
                apply?.(doc => makeGroup(doc, workout.id, ids, groupKind));
              }}>{groupKind === "Superset" ? (pl ? "Połącz w superset" : "Create superset") : (pl ? "Utwórz obwód" : "Create circuit")}</Button>
            </div> : null}
            {!candidates.length ? <p className={styles.note}>{pl ? "Dodaj drugie, niepołączone ćwiczenie do tego treningu." : "Add another ungrouped exercise to this workout."}</p> : null}
          </>}
        </section>
      </div>
    </Dialog>}
  </>;
}
