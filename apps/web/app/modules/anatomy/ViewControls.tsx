import { useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { IconButton } from "@portable-ui/react";
import type { AnatomyMessages } from "./messages";
import type { CameraAction } from "./AnatomyViewer";
import styles from "./anatomy.module.css";

const VIEWS = ["front", "back", "left", "right"] as const;

/** Camera state for a viewer plus its floating controls: side switch top-left, zoom/reset top-right. */
export function useViewControls(m: AnatomyMessages) {
  const [camera, setCamera] = useState<{
    action: CameraAction;
    revision: number;
  }>({ action: "front", revision: 0 });
  const [view, setView] = useState<(typeof VIEWS)[number]>("front");
  const send = (action: CameraAction) => {
    if ((VIEWS as readonly string[]).includes(action))
      setView(action as (typeof VIEWS)[number]);
    if (action === "reset") setView("front");
    setCamera((current) => ({ action, revision: current.revision + 1 }));
  };
  const controls = (
    <>
      <div className={styles.views} role="group" aria-label={m.views}>
        {VIEWS.map((direction) => (
          <button
            key={direction}
            type="button"
            className={styles.view}
            data-active={view === direction || undefined}
            aria-pressed={view === direction}
            onClick={() => send(direction)}
          >
            {m[direction]}
          </button>
        ))}
      </div>
      <div className={styles.cameraTools} role="group" aria-label={m.camera}>
        <IconButton
          size="sm"
          variant="secondary"
          label={m.zoomIn}
          icon={<Plus />}
          onPress={() => send("zoomIn")}
          className={styles.tool}
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={m.zoomOut}
          icon={<Minus />}
          onPress={() => send("zoomOut")}
          className={styles.tool}
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={m.resetCamera}
          icon={<RotateCcw />}
          onPress={() => send("reset")}
          className={styles.tool}
        />
      </div>
      <p id="anatomy-controls-help" className={styles.srOnly}>
        {m.help}
      </p>
    </>
  );
  return { camera, controls };
}
