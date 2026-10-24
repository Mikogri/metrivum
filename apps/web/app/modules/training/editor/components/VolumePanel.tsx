import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { TrainingDocument, Workout } from "@trainflow/api-client-web";
import { IconButton, Option, Segment, SegmentedControl, Select } from "@trainflow/ui-web";
import { MuscleHeatmap } from "~/modules/anatomy";
import { useDictionaryLabel, type ExerciseLabel } from "~/modules/exercises";
import { formatNumber } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { cycleWorkouts, volumeLines, workoutsStats, type VolumeBy, type VolumeStats } from "../model/workouts";
import styles from "./SheetCanvas.module.css";

export interface VolumeSection {
  id: string;
  title: string;
  workouts: { workout: Workout; dayNumber?: number }[];
  /** One table per workout before the section total. */
  perWorkout: boolean;
}

/**
 * Volume tables: sets, reps, hard sets (RPE/RIR) and kg per primary muscle (default), secondary
 * muscle or movement pattern. Primary and secondary muscles are counted separately. Each section
 * shows its workouts (optionally one table each) and a total; nothing scrolls sideways.
 */
export function VolumeContent({ sections, names, title }: { sections: VolumeSection[]; names: Map<string, ExerciseLabel>; title?: ReactNode }) {
  const m = useT();
  const t = m.editor.sheet.volume;
  const locale = useLocale();
  const dictionaryLabel = useDictionaryLabel();
  const [by, setBy] = useState<VolumeBy>("primary");
  const [mode, setMode] = useState<"table" | "heatmap">("table");
  const [metric, setMetric] = useState<"sets" | "hardSets">("sets");
  // The heatmap shows one range at a time; the last one (the cycle total or the latest cycle) by default.
  const [sectionId, setSectionId] = useState<string | null>(null);
  const label = (key: string) => (key === "—" ? t.unassigned : dictionaryLabel(by === "patterns" ? "movementPatterns" : "muscles", key));
  const n = (value: number) => formatNumber(locale, Math.round(value));
  const heading = by === "patterns" ? t.patternsLong : by === "secondary" ? t.secondaryLong : t.primaryLong;
  const taxonomy = (id: string) => {
    const info = names.get(id);
    return info ? { movementPatternKeys: info.movementPatternKeys, primaryMuscleKeys: info.primaryMuscleKeys, secondaryMuscleKeys: info.secondaryMuscleKeys } : undefined;
  };

  const table = (rows: { key: string; stats: VolumeStats }[]) => (
    <table className={styles.volumeTable}>
      <thead>
        <tr>
          <th scope="col">{heading}</th>
          <th scope="col" title={t.setsHint}>
            {t.sets}
          </th>
          <th scope="col" title={t.repsHint}>
            {t.reps}
          </th>
          <th scope="col" title={t.hardHint}>
            {t.hard}
          </th>
          <th scope="col" title={t.tonnageHint}>
            {t.tonnage}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, stats }) => (
          <tr key={key}>
            <th scope="row" title={label(key)}>
              {label(key)}
            </th>
            <td>{n(stats.sets)}</td>
            <td>{n(stats.reps)}</td>
            <td className={styles.volumeHard}>{n(stats.hardSets)}</td>
            <td className={styles.volumeKg}>{stats.tonnage ? n(stats.tonnage) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const heatSection = sections.find((section) => section.id === sectionId) ?? sections[sections.length - 1];
  const heatValues = (() => {
    const values = new Map<string, number>();
    if (!heatSection) return values;
    const workouts = heatSection.workouts.map((w) => w.workout);
    for (const [kind, weight] of [["primary", 1], ["secondary", 0.5]] as const) {
      for (const line of volumeLines(workouts, taxonomy, kind)) {
        if (line.key === "—") continue;
        values.set(line.key, (values.get(line.key) ?? 0) + line.total[metric] * weight);
      }
    }
    return values;
  })();
  const formatAmount = (value: number) => formatNumber(locale, Math.round(value * 10) / 10);

  const modeSwitch = (
    <SegmentedControl aria-label={t.show} size="sm" selectedKeys={[mode]} onSelectionChange={(keys) => setMode(([...keys][0] as "table" | "heatmap") ?? "table")} className={styles.volumeBy}>
      <Segment id="table">{t.table}</Segment>
      <Segment id="heatmap">{t.heatmap}</Segment>
    </SegmentedControl>
  );
  // With a title, Table / Heatmap sits beside it and the view's own switches go underneath.
  const head = title ? <div className={styles.volumeHeader}>{title}{modeSwitch}</div> : modeSwitch;

  if (mode === "heatmap") {
    return (
      <div className={styles.volumeContent}>
        {head}
        <div className={styles.heatControls}>
          <SegmentedControl aria-label={t.metric} size="sm" selectedKeys={[metric]} onSelectionChange={(keys) => setMetric(([...keys][0] as "sets" | "hardSets") ?? "sets")}>
            <Segment id="sets">{t.sets}</Segment>
            <Segment id="hardSets">{t.hard}</Segment>
          </SegmentedControl>
          {sections.length > 1 ? (
            <Select aria-label={t.section} selectedKey={heatSection?.id ?? null} onSelectionChange={(key) => setSectionId(String(key))} className={styles.heatSection}>
              {sections.map((section) => <Option key={section.id} id={section.id}>{section.title}</Option>)}
            </Select>
          ) : null}
        </div>
        <MuscleHeatmap
          values={heatValues}
          label={(key) => dictionaryLabel("muscles", key)}
          format={formatAmount}
          caption={t.heatCaption(metric === "sets" ? t.setsHint : t.hardHint, heatSection?.title ?? "")}
        />
      </div>
    );
  }

  return (
    <div className={styles.volumeContent}>
      {head}
      <SegmentedControl aria-label={t.by} size="sm" selectedKeys={[by]} onSelectionChange={(keys) => setBy(([...keys][0] as VolumeBy) ?? "primary")} className={styles.volumeBy}>
        <Segment id="primary">{t.primary}</Segment>
        <Segment id="secondary">{t.secondary}</Segment>
        <Segment id="patterns">{t.patterns}</Segment>
      </SegmentedControl>
      {sections.map((section) => {
        const workouts = section.workouts.map((w) => w.workout);
        const lines = volumeLines(workouts, taxonomy, by);
        const total = workoutsStats(workouts);
        return (
          <section key={section.id} className={styles.volumeCycle}>
            <h3 className={styles.volumeCycleTitle}>
              <span>{section.title}</span>
              <span className={styles.volumeTotal}>{t.setsReps(Math.round(total.sets), Math.round(total.reps))}</span>
            </h3>
            {total.sets === 0 ? (
              <p className={styles.volumeEmpty}>{t.empty}</p>
            ) : lines.length === 0 ? (
              <p className={styles.volumeEmpty}>{t.noSecondary}</p>
            ) : (
              <>
                {section.perWorkout && section.workouts.length > 1
                  ? section.workouts.map(({ workout, dayNumber }) => {
                      const rows = lines.filter((line) => line.perWorkout[workout.id]).map((line) => ({ key: line.key, stats: line.perWorkout[workout.id]! }));
                      return rows.length ? (
                        <div key={workout.id} className={styles.volumeGroup}>
                          <p className={styles.volumeGroupTitle}>
                            {workout.name || m.editor.untitled}
                            {dayNumber ? <span>{m.editor.sheet.dayShort(dayNumber)}</span> : null}
                          </p>
                          {table(rows)}
                        </div>
                      ) : null;
                    })
                  : null}
                <div className={`${styles.volumeGroup} ${styles.volumeGroupTotal}`}>
                  <p className={styles.volumeGroupTitle}>{t.total}</p>
                  {table(lines.map((line) => ({ key: line.key, stats: line.total })))}
                </div>
              </>
            )}
          </section>
        );
      })}
      <p className={styles.volumeNote}>{t.note}</p>
    </div>
  );
}

/** Sheet side panel: every cycle of the plan, one table per workout plus the cycle total. */
export function VolumePanel({ doc, names, onClose }: { doc: TrainingDocument; names: Map<string, ExerciseLabel>; onClose: () => void }) {
  const t = useT().editor.sheet.volume;
  const sections: VolumeSection[] = doc.blocks.flatMap((block) =>
    block.cycles.map((cycle) => ({ id: cycle.id, title: `${block.name} · ${cycle.name}`, workouts: cycleWorkouts(cycle), perWorkout: true })),
  );
  return (
    <aside className={styles.volume} aria-label={t.title}>
      <header className={styles.volumeHead}>
        <h2 className={styles.volumeTitle}>{t.title}</h2>
        <IconButton label={t.close} icon={<X />} size="sm" variant="ghost" onPress={onClose} showTooltip={false} />
      </header>
      <div className={styles.volumeBody}>
        <VolumeContent sections={sections} names={names} />
      </div>
    </aside>
  );
}
