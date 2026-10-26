import { useEffect, useRef, useState, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { resolveCover } from "./coverStyle";
import styles from "./ProfileCover.module.css";

/**
 * The background lives in its own React root, outside the app's StrictMode: StrictMode mounts effects twice in
 * development, and backgrounds that release their WebGL context in cleanup then stay blank. Prop changes re-render
 * the same root; `restart` mounts it again for settings a background reads only when it starts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each background has its own props
function Isolated({ Component, props }: { Component: ComponentType<any>; props: Record<string, unknown> }) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<Root | null>(null);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const mount = document.createElement("div");
    mount.style.cssText = "position:absolute;inset:0";
    element.appendChild(mount);
    const created = createRoot(mount);
    root.current = created;
    created.render(<Component {...latest.current} />);
    return () => {
      root.current = null;
      setTimeout(() => {
        created.unmount();
        mount.remove();
      }, 0);
    };
  }, [Component]);
  useEffect(() => {
    root.current?.render(<Component {...props} />);
  }, [Component, props]);
  return <div ref={host} className={styles.fill} />;
}

/** The animated background a person chose (or the default silk), loaded on demand. */
export function CoverBackground({ style, restart = 0 }: { style: unknown; restart?: number }) {
  const { entry, props, backdrop } = resolveCover(style);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each background has its own props
  const [loaded, setLoaded] = useState<{ name: string; Component: ComponentType<any> } | null>(null);
  useEffect(() => {
    let alive = true;
    void entry.load().then((module) => {
      if (alive) setLoaded({ name: entry.name, Component: module.default });
    });
    return () => {
      alive = false;
    };
  }, [entry]);
  const Component = loaded?.name === entry.name ? loaded.Component : null;
  return (
    <div className={styles.fill} style={{ background: backdrop }} aria-hidden="true">
      {Component ? <Isolated key={`${entry.name}-${restart}`} Component={Component} props={props} /> : null}
    </div>
  );
}

/** A custom cover photo when there is one, otherwise the animated background. */
export function ProfileCover({ imageUrl, style, restart, children }: { imageUrl?: string | null; style?: unknown; restart?: number; children?: React.ReactNode }) {
  return (
    <div className={styles.cover}>
      {imageUrl ? <img className={styles.image} src={imageUrl} alt="" /> : <CoverBackground style={style} restart={restart} />}
      {children}
    </div>
  );
}
