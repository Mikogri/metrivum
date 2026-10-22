import { lazy, Suspense, useMemo } from "react";
import { LoadingState } from "@trainflow/ui-web";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { mappingIndex, selectedMeshIds, type Category } from "./model";
import { anatomyMessages } from "./messages";
import { useAnatomyManifest } from "./useAnatomyManifest";
import { useViewControls } from "./ViewControls";
import styles from "./anatomy.module.css";

const AnatomyViewer = lazy(() => import("./AnatomyViewer"));
const MUSCLES = new Set<Category>(["muscles"]);
const NONE = new Set<string>();
const noop = () => {};

/**
 * Read-only model of the muscles an exercise works: primary in the selection colour, secondary in amber.
 * Opens on the side where most primary muscles are, without flying in.
 */
export function MusclePreview({ primary, secondary }: { primary: readonly string[]; secondary: readonly string[] }) {
  const { locale } = useAppLocale();
  const m = anatomyMessages[locale];
  const model = useAnatomyManifest();
  const { camera, controls } = useViewControls(m);
  const index = useMemo(() => model.data ? mappingIndex(model.data) : null, [model.data]);
  const primaryMeshes = useMemo(() => index ? selectedMeshIds(new Set(primary), index.byMuscle) : NONE, [index, primary]);
  const secondaryMeshes = useMemo(() => index ? selectedMeshIds(new Set(secondary), index.byMuscle) : NONE, [index, secondary]);
  const missing = index ? [...primary, ...secondary].some(key => !index.byMuscle.get(key)?.size) : false;
  return <div className={styles.preview}>
    <div className={styles.stage}>
      {model.data ? <Suspense fallback={<div className={styles.placeholder}><LoadingState label={m.loading} /></div>}>
        <AnatomyViewer manifest={model.data} categories={MUSCLES} selected={primaryMeshes} secondary={secondaryMeshes} followSelection={false}
          hidden={NONE} isolated={false} transparent={false} camera={camera} onPick={noop} messages={m} />
      </Suspense> : <div className={styles.placeholder}>{model.isError ? <p className={styles.notice}>{m.failure}</p> : <LoadingState label={m.loading} />}</div>}
      {controls}
    </div>
    <div className={styles.legend}>
      <span><span className={styles.legendDot} data-kind="primary" aria-hidden="true" />{m.primary}</span>
      <span><span className={styles.legendDot} data-kind="secondary" aria-hidden="true" />{m.secondary}</span>
      <span className={styles.legendHint}>{m.previewHelp}</span>
    </div>
    {!primary.length && !secondary.length ? <p className={styles.notice}>{m.noMuscles}</p> : missing ? <p className={styles.notice}>{m.partlyMissing}</p> : null}
  </div>;
}
