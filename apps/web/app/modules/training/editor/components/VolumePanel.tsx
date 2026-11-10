import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { TrainingDocument } from "@metrivum/api-client-web";
import {
  IconButton,
  InfoTip,
  Option,
  Segment,
  SegmentedControl,
  Select,
} from "@metrivum/ui-web";
import { MuscleHeatmap } from "~/modules/anatomy";
import { useDictionaryLabel, type ExerciseLabel } from "~/modules/exercises";
import { formatNumber } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { maxesTables } from "../model/maxes";
import {
  oneRepMaxes,
  volumeLines,
  volumeRanges,
  workoutsStats,
  type VolumeBy,
  type VolumeScope,
  type VolumeStats,
} from "../model/workouts";
import styles from "./SheetCanvas.module.css";

const SCOPES: VolumeScope[] = ["workout", "cycle", "block", "all"];

/**
 * Volume of one range at a time: a workout, a cycle, a block or the whole plan, switched with a segmented
 * control and a picker (with previous/next arrows). Each exercise counts only for its main muscle. Table
 * (sets, reps, hard sets, kg, INOL) or heatmap.
 */
export function VolumeContent({
  doc,
  names,
  title,
  initial,
}: {
  doc: TrainingDocument;
  names: Map<string, ExerciseLabel>;
  title?: ReactNode;
  initial?: { scope: VolumeScope; id?: string | null };
}) {
  const m = useT();
  const t = m.editor.sheet.volume;
  const locale = useLocale();
  const dictionaryLabel = useDictionaryLabel();
  const [by, setBy] = useState<VolumeBy>("primary");
  const [mode, setMode] = useState<"table" | "heatmap">("table");
  const [metric, setMetric] = useState<"sets" | "hardSets">("sets");
  const ranges = useMemo(
    () => volumeRanges(doc, { untitled: m.editor.untitled, all: t.scopes.all }),
    [doc, m.editor.untitled, t.scopes.all],
  );
  // Scopes with nothing in them (a plan without blocks) are left out of the switch.
  const scopes = SCOPES.filter((scope) => ranges[scope].length > 0);
  const [scope, setScope] = useState<VolumeScope>(
    initial?.scope && ranges[initial.scope].length ? initial.scope : "cycle",
  );
  const [picked, setPicked] = useState<Partial<Record<VolumeScope, string>>>(
    initial?.id ? { [initial.scope]: initial.id } : {},
  );
  const activeScope = scopes.includes(scope) ? scope : (scopes[0] ?? "all");
  const list = ranges[activeScope];
  const index = Math.max(
    0,
    list.findIndex((range) => range.id === picked[activeScope]),
  );
  const range = list[index];
  const oneRm = useMemo(() => oneRepMaxes(doc, maxesTables(doc)), [doc]);

  const label = (key: string) =>
    key === "—"
      ? t.unassigned
      : dictionaryLabel(
          by === "patterns" ? "movementPatterns" : "muscles",
          key,
        );
  const n = (value: number) => formatNumber(locale, Math.round(value));
  const inol = (stats: VolumeStats) =>
    stats.inolSets
      ? formatNumber(locale, Math.round(stats.inol * 100) / 100)
      : "—";
  const taxonomy = (id: string) => {
    const info = names.get(id);
    return info
      ? {
          movementPatternKeys: info.movementPatternKeys,
          primaryMuscleKeys: info.primaryMuscleKeys,
          secondaryMuscleKeys: info.secondaryMuscleKeys,
        }
      : undefined;
  };
  const workouts = range?.workouts ?? [];
  const lines = volumeLines(workouts, taxonomy, by, oneRm);
  const total = workoutsStats(workouts, oneRm);
  const pick = (id: string) =>
    setPicked((current) => ({ ...current, [activeScope]: id }));
  const step = (delta: number) => {
    const next = list[index + delta];
    if (next) pick(next.id);
  };

  const modeSwitch = (
    <SegmentedControl
      aria-label={t.show}
      size="sm"
      selectedKeys={[mode]}
      onSelectionChange={(keys) =>
        setMode(([...keys][0] as "table" | "heatmap") ?? "table")
      }
    >
      <Segment id="table">{t.table}</Segment>
      <Segment id="heatmap">{t.heatmap}</Segment>
    </SegmentedControl>
  );
  // How the numbers are counted: behind a small info button beside the switch, not a paragraph under the tables.
  const info = (
    <InfoTip label={t.noteLabel} placement="bottom end">
      {t.note}
    </InfoTip>
  );
  const head = title ? (
    <div className={styles.volumeHeader}>
      {title}
      <span className={styles.volumeHeadEnd}>
        {info}
        {modeSwitch}
      </span>
    </div>
  ) : (
    <span className={styles.volumeHeadEnd}>
      {modeSwitch}
      {info}
    </span>
  );

  // Which range: the kind of range, then which one of them (with arrows to step through).
  const rangeControls = (
    <div className={styles.volumeRange}>
      <SegmentedControl
        aria-label={t.scope}
        size="sm"
        selectedKeys={[activeScope]}
        onSelectionChange={(keys) =>
          setScope(([...keys][0] as VolumeScope) ?? "cycle")
        }
        className={styles.volumeScopes}
      >
        {scopes.map((value) => (
          <Segment key={value} id={value}>
            {t.scopes[value]}
          </Segment>
        ))}
      </SegmentedControl>
      {activeScope !== "all" && list.length ? (
        <div className={styles.volumePicker}>
          <IconButton
            size="sm"
            variant="ghost"
            icon={<ChevronLeft />}
            label={m.common.previous}
            isDisabled={index === 0}
            onPress={() => step(-1)}
          />
          <Select
            aria-label={t.pick(t.scopes[activeScope])}
            selectedKey={range?.id ?? null}
            onSelectionChange={(key) => pick(String(key))}
            className={styles.volumeSelect}
            size="sm"
          >
            {list.map((item) => (
              <Option key={item.id} id={item.id}>
                {item.title}
              </Option>
            ))}
          </Select>
          <IconButton
            size="sm"
            variant="ghost"
            icon={<ChevronRight />}
            label={m.common.next}
            isDisabled={index >= list.length - 1}
            onPress={() => step(1)}
          />
        </div>
      ) : null}
    </div>
  );

  if (mode === "heatmap") {
    const values = new Map<string, number>();
    for (const line of volumeLines(workouts, taxonomy, "primary", oneRm))
      if (line.key !== "—") values.set(line.key, line.total[metric]);
    return (
      <div className={styles.volumeContent}>
        {head}
        {rangeControls}
        <SegmentedControl
          aria-label={t.metric}
          size="sm"
          selectedKeys={[metric]}
          onSelectionChange={(keys) =>
            setMetric(([...keys][0] as "sets" | "hardSets") ?? "sets")
          }
          className={styles.volumeBy}
        >
          <Segment id="sets">{t.sets}</Segment>
          <Segment id="hardSets">{t.hard}</Segment>
        </SegmentedControl>
        <MuscleHeatmap
          values={values}
          label={(key) => dictionaryLabel("muscles", key)}
          format={(value) => formatNumber(locale, Math.round(value * 10) / 10)}
          caption={t.heatCaption(
            metric === "sets" ? t.setsHint : t.hardHint,
            range?.title ?? "",
          )}
        />
      </div>
    );
  }

  return (
    <div className={styles.volumeContent}>
      {head}
      {rangeControls}
      <SegmentedControl
        aria-label={t.by}
        size="sm"
        selectedKeys={[by]}
        onSelectionChange={(keys) =>
          setBy(([...keys][0] as VolumeBy) ?? "primary")
        }
        className={styles.volumeBy}
      >
        <Segment id="primary">{t.primary}</Segment>
        <Segment id="patterns">{t.patterns}</Segment>
      </SegmentedControl>
      {!range ? (
        <p className={styles.volumeEmpty}>{t.noRange}</p>
      ) : (
        <section
          key={`${activeScope}:${range.id}`}
          className={styles.volumeCycle}
          aria-label={range.title}
        >
          <h3 className={styles.volumeCycleTitle}>
            <span>{range.title}</span>
            <span className={styles.volumeTotal}>
              {t.setsReps(Math.round(total.sets), Math.round(total.reps))}
            </span>
          </h3>
          {total.sets === 0 ? (
            <p className={styles.volumeEmpty}>{t.empty}</p>
          ) : (
            <>
              <table className={styles.volumeTable}>
                <thead>
                  <tr>
                    <th scope="col">
                      {by === "patterns" ? t.patternsLong : t.primaryLong}
                    </th>
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
                    <th scope="col" title={t.inolHint}>
                      {t.inol}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map(({ key, total: stats }) => (
                    <tr key={key}>
                      <th scope="row" title={label(key)}>
                        {label(key)}
                      </th>
                      <td>{n(stats.sets)}</td>
                      <td>{n(stats.reps)}</td>
                      <td className={styles.volumeHard}>{n(stats.hardSets)}</td>
                      <td className={styles.volumeKg}>
                        {stats.tonnage ? n(stats.tonnage) : "—"}
                      </td>
                      <td className={styles.volumeInol}>{inol(stats)}</td>
                    </tr>
                  ))}
                </tbody>
                {lines.length > 1 ? (
                  <tfoot>
                    <tr>
                      <th scope="row">{t.total}</th>
                      <td>{n(total.sets)}</td>
                      <td>{n(total.reps)}</td>
                      <td className={styles.volumeHard}>{n(total.hardSets)}</td>
                      <td className={styles.volumeKg}>
                        {total.tonnage ? n(total.tonnage) : "—"}
                      </td>
                      <td className={styles.volumeInol}>{inol(total)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              {total.inolSets && total.inolSets < total.sets ? (
                <p className={styles.volumeNote}>
                  {t.inolPartial(total.inolSets, total.sets)}
                </p>
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}

/** Sheet side panel: volume of a workout, cycle, block or the whole plan, one at a time. */
export function VolumePanel({
  doc,
  names,
  onClose,
  initial,
}: {
  doc: TrainingDocument;
  names: Map<string, ExerciseLabel>;
  onClose: () => void;
  initial?: { scope: VolumeScope; id?: string | null };
}) {
  const t = useT().editor.sheet.volume;
  return (
    <aside className={styles.volume} aria-label={t.title}>
      <header className={styles.volumeHead}>
        <h2 className={styles.volumeTitle}>{t.title}</h2>
        <IconButton
          label={t.close}
          icon={<X />}
          size="sm"
          variant="ghost"
          onPress={onClose}
          showTooltip={false}
        />
      </header>
      <div className={styles.volumeBody}>
        <VolumeContent doc={doc} names={names} initial={initial} />
      </div>
    </aside>
  );
}
