import { lazy, Suspense, useMemo, useState } from "react";
import { X } from "lucide-react";
import { IconButton, LoadingState } from "@trainflow/ui-web";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { mappingIndex, type Category } from "./model";
import { anatomyMessages } from "./messages";
import { useAnatomyManifest } from "./useAnatomyManifest";
import { useViewControls } from "./ViewControls";
import styles from "./anatomy.module.css";

const AnatomyViewer = lazy(() => import("./AnatomyViewer"));
const MUSCLES = new Set<Category>(["muscles"]);
const NONE = new Set<string>();

export interface HeatmapProps {
  /** Muscle key → amount (e.g. sets per cycle). Zero or missing leaves the muscle grey. */
  values: ReadonlyMap<string, number>;
  /** Label of a muscle key and formatting of an amount, from the caller's dictionary and locale. */
  label: (key: string) => string;
  format: (value: number) => string;
  /** What the amount is, shown under the scale. */
  caption: string;
}

/**
 * Muscles painted by how much work they get: pale yellow for a little, red for the most-trained muscle.
 * Click a muscle to read its amount.
 */
export function MuscleHeatmap({ values, label, format, caption }: HeatmapProps) {
  const { locale } = useAppLocale();
  const m = anatomyMessages[locale];
  const model = useAnatomyManifest();
  const { camera, controls } = useViewControls(m);
  const [picked, setPicked] = useState<string | null>(null);
  const index = useMemo(() => model.data ? mappingIndex(model.data) : null, [model.data]);
  const max = Math.max(0, ...values.values());
  // A mesh shared by several catalogue muscles shows the hardest-worked one.
  const heat = useMemo(() => {
    const result = new Map<string, number>();
    if (!index || max <= 0) return result;
    for (const [key, value] of values) {
      if (value <= 0) continue;
      for (const mesh of index.byMuscle.get(key) ?? []) result.set(mesh, Math.max(result.get(mesh) ?? 0, value / max));
    }
    return result;
  }, [index, values, max]);
  const missing = index ? [...values].filter(([key, value]) => value > 0 && !index.byMuscle.get(key)?.size).map(([key]) => key) : [];
  const pick = (mesh: string) => {
    const keys = index?.byMesh.get(mesh) ?? [];
    const key = [...keys].sort((a, b) => (values.get(b) ?? 0) - (values.get(a) ?? 0))[0] ?? null;
    setPicked(current => current === key ? null : key);
  };
  return <div className={`${styles.preview} ${styles.heatmap}`}>
    <div className={styles.stage}>
      {model.data ? <Suspense fallback={<div className={styles.placeholder} />}>
        <AnatomyViewer manifest={model.data} categories={MUSCLES} selected={NONE} heat={heat} followSelection={false}
          hidden={NONE} isolated={false} transparent={false} camera={camera} onPick={pick} messages={m} />
      </Suspense> : <div className={styles.placeholder}>{model.isError ? <p className={styles.notice}>{m.failure}</p> : <LoadingState label={m.loading} />}</div>}
      {controls}
      {picked ? <div className={styles.heatPick} role="status">
        <span className={styles.heatSwatch} data-none={(values.get(picked) ?? 0) > 0 ? undefined : ""} aria-hidden="true" />
        <span className={styles.heatPickName}>{label(picked)}</span>
        <span className={styles.heatPickValue}>{format(values.get(picked) ?? 0)}</span>
        <IconButton size="sm" label={m.clear} icon={<X />} onPress={() => setPicked(null)} showTooltip={false} />
      </div> : null}
    </div>
    <div className={styles.heatScale}>
      <span className={styles.heatNone}><span aria-hidden="true" />{m.heatNone}</span>
      <span className={styles.heatBar} aria-hidden="true" />
      <span className={styles.heatEnds}><span>{format(0)}</span><span>{format(max)}</span></span>
    </div>
    <p className={styles.notice}>{caption} · {m.heatHint}</p>
    {missing.length ? <p className={styles.notice}>{m.heatMissing(missing.map(label).join(", "))}</p> : null}
  </div>;
}
