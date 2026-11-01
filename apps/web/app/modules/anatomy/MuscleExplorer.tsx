import { lazy, Suspense, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { EyeOff, Focus, Info, Minus, Plus, RotateCcw, ScanEye, X } from "lucide-react";
import { Focusable, ToggleButton } from "react-aria-components";
import { Button, ErrorState, Hint, IconButton, LoadingState, Switch, Tooltip, TooltipTrigger } from "@metrivum/ui-web";
import { useAppLocale } from "~/shared/i18n/AppLocale";
import { useFitHeight } from "~/shared/lib/useFitHeight";
import { useDictionaries } from "~/modules/exercises";
import { mappingIndex, selectedMeshIds, toggleSelection, type Category } from "./model";
import { useAnatomyManifest } from "./useAnatomyManifest";
import { anatomyMessages } from "./messages";
import type { CameraAction } from "./AnatomyViewer";
import styles from "./anatomy.module.css";

const AnatomyViewer = lazy(() => import("./AnatomyViewer"));
const VIEWS = ["front", "back", "left", "right"] as const;

export function MuscleExplorer({ muscleKey, onMuscleChange, children }: { muscleKey: string; onMuscleChange: (key: string) => void; children: ReactNode }) {
  const { locale } = useAppLocale();
  const m = anatomyMessages[locale];
  const dictionaries = useDictionaries();
  // Public versioned anatomy contains no account data; the muscle dictionary retains its account-scoped cache.
  const model = useAnatomyManifest();
  const selected = useMemo(() => new Set(muscleKey ? [muscleKey] : []), [muscleKey]);
  const setSelected = (value: Set<string> | ((current: Set<string>) => Set<string>)) => {
    const next = typeof value === "function" ? value(selected) : value;
    onMuscleChange([...next][0] ?? "");
  };
  const [structure, setStructure] = useState<string | null>(null);
  const [categories, setCategories] = useState(new Set<Category>(["muscles"]));
  const [hidden, setHidden] = useState(new Set<string>());
  const [isolated, setIsolated] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const [camera, setCamera] = useState<{ action: CameraAction; revision: number }>({ action: "front", revision: 0 });
  // The model column fills the window below its own starting point, so with a short list nothing scrolls
  // and with a long one it sticks without being cut off.
  const { ref: explorer, height: fit } = useFitHeight<HTMLElement>([model.data, dictionaries.data]);
  const [view, setView] = useState<(typeof VIEWS)[number]>("front");
  const index = useMemo(() => model.data ? mappingIndex(model.data) : { byMuscle: new Map<string, Set<string>>(), byMesh: new Map<string, string[]>() }, [model.data]);
  const muscleMeshes = useMemo(() => selectedMeshIds(selected, index.byMuscle), [selected, index]);
  const highlighted = useMemo(() => new Set([...muscleMeshes, ...(structure ? [structure] : [])]), [muscleMeshes, structure]);
  const send = (action: CameraAction) => {
    if ((VIEWS as readonly string[]).includes(action)) setView(action as (typeof VIEWS)[number]);
    if (action === "reset") setView("front");
    setCamera(current => ({ action, revision: current.revision + 1 }));
  };
  const selectMuscle = (key: string) => {
    setSelected(current => toggleSelection(current, key, false));
    setStructure(null);
    // Reveal selected meshes without changing unrelated anatomy.
    setHidden(current => new Set([...current].filter(id => !index.byMuscle.get(key)?.has(id))));
  };
  const pick = (id: string) => {
    const key = index.byMesh.get(id)?.find(key => dictionaries.data?.muscles.some(muscle => muscle.key === key));
    if (key) {
      selectMuscle(key);
    } else {
      setStructure(current => current === id ? null : id);
    }
  };
  const clear = () => { setSelected(new Set()); setStructure(null); setIsolated(false); };
  const reset = () => { setCategories(new Set(["muscles"])); setHidden(new Set()); setIsolated(false); setTransparent(false); };
  const toggleLayer = (layer: Category) => setCategories(current => {
    const next = new Set(current);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    return next;
  });
  if (model.isPending || dictionaries.isPending) return <div className={styles.layout}><div className={styles.explorer}><div className={styles.placeholder}><LoadingState label={m.loading} /></div></div><section className={styles.catalogue}>{children}</section></div>;
  if (model.isError || dictionaries.isError) return <div className={styles.layout}><div className={styles.explorer}><ErrorState title={m.failure} actions={<Button onPress={() => { void model.refetch(); void dictionaries.refetch(); }}>{m.retry}</Button>} /></div><section className={styles.catalogue}>{children}</section></div>;
  const manifest = model.data;
  const unavailable = dictionaries.data.muscles.filter(row => selected.has(row.key) && !index.byMuscle.get(row.key)?.size);
  const picked = manifest.structures.find(s => s.id === structure);
  const muscle = dictionaries.data.muscles.find(row => selected.has(row.key));
  const selectionName = picked?.name ?? (muscle ? (locale === "pl" ? muscle.labelPl : muscle.labelEn) : "");
  const hiddenCount = hidden.size;
  return <>
    <div className={styles.layout}>
      <section ref={explorer} className={styles.explorer} aria-label={m.viewer} style={fit ? { "--explorer-fit": `${fit}px` } as CSSProperties : undefined}>
        <div className={styles.stage}>
          <Suspense fallback={<div className={styles.placeholder}><LoadingState label={m.loading} /></div>}>
            <AnatomyViewer manifest={manifest} categories={categories} selected={highlighted} hidden={hidden} isolated={isolated && highlighted.size > 0} transparent={transparent} camera={camera} onPick={pick} messages={m} />
          </Suspense>
          <div className={styles.views} role="group" aria-label={m.views}>
            {VIEWS.map(direction => <button key={direction} type="button" className={styles.view} data-active={view === direction || undefined} aria-pressed={view === direction} onClick={() => send(direction)}>{m[direction]}</button>)}
          </div>
          <div className={styles.cameraTools} role="group" aria-label={m.camera}>
            <IconButton size="sm" variant="secondary" label={m.zoomIn} icon={<Plus />} onPress={() => send("zoomIn")} className={styles.tool} />
            <IconButton size="sm" variant="secondary" label={m.zoomOut} icon={<Minus />} onPress={() => send("zoomOut")} className={styles.tool} />
            <IconButton size="sm" variant="secondary" label={m.resetCamera} icon={<RotateCcw />} onPress={() => send("reset")} className={styles.tool} />
            <TooltipTrigger delay={200}>
              <Focusable><span className={styles.helpIcon} tabIndex={0} role="img" aria-label={m.controls}><Info aria-hidden="true" /></span></Focusable>
              <Tooltip placement="left" className={styles.helpTooltip}><span className={styles.helpTip}>
              <strong>{m.helpTitle}</strong>
              <span>{m.helpIntro}</span>
              <span className={styles.helpList}>
                {m.helpItems.map(([keys, text]) => <span key={keys} className={styles.helpRow}><span className={styles.helpKey}>{keys}</span><span>{text}</span></span>)}
              </span>
            </span></Tooltip>
            </TooltipTrigger>
          </div>
          <p id="anatomy-controls-help" className={styles.srOnly}>{m.help}</p>
        </div>

        {selectionName && <div className={styles.selection} role="status">
          <span className={styles.selectionDot} aria-hidden="true" />
          <span className={styles.selectionText}>
            <span className={styles.selectionName}>{selectionName}</span>
            {picked && <Hint label={m.noMapping}><span className={styles.selectionMeta} tabIndex={0}>{picked.conceptId || picked.id} · {m.noMapping}</span></Hint>}
          </span>
          <span className={styles.selectionActions}>
            <IconButton size="sm" label={m.focus} icon={<Focus />} onPress={() => send("focus")} />
            <IconButton size="sm" label={m.isolate} icon={<ScanEye />} isDisabled={!highlighted.size} onPress={() => setIsolated(value => !value)} className={isolated ? styles.toolOn : undefined} />
            <IconButton size="sm" label={m.hide} icon={<EyeOff />} isDisabled={!highlighted.size} onPress={() => setHidden(current => new Set([...current, ...highlighted]))} />
            <IconButton size="sm" label={m.clear} icon={<X />} onPress={clear} />
          </span>
        </div>}
        {unavailable.length > 0 && <p className={styles.notice}>{m.unavailable}</p>}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>{m.layers}</span>
            <Button size="sm" variant="ghost" isDisabled={!hiddenCount && !isolated && !transparent && categories.size === 1 && categories.has("muscles")} onPress={reset}>{m.resetVisibility}</Button>
          </div>
          <div className={styles.layers} role="group" aria-label={m.categories} onWheel={event => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY; }}>
            {manifest.layers.map(layer => <ToggleButton key={layer.id} className={styles.layer} isSelected={categories.has(layer.id)} onChange={() => toggleLayer(layer.id)}>
              <span className={styles.layerSwatch} data-layer={layer.id} aria-hidden="true" />
              {layer.id === "other" ? m.other : m[layer.id]}
              <span className={styles.count}>{layer.structures}</span>
            </ToggleButton>)}
          </div>
          <div className={styles.panelFoot}>
            <Switch isSelected={transparent} onChange={setTransparent}>{m.transparent}</Switch>
          </div>
        </div>
      </section>
      <section className={styles.catalogue}>{children}</section>
    </div>
  </>;
}
