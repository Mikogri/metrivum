import { useState } from "react";
import { cx } from "../../lib/cx";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  /** Decorative avatars next to a visible name should be hidden from assistive tech. */
  decorative?: boolean;
  className?: string;
  /** A profile photo; the initials show until it loads and whenever it fails. */
  src?: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + second).toUpperCase();
}

/** Deterministic hue from the name so the same person keeps the same colour. */
function hue(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function Avatar({ name, size = "md", decorative, className, src }: AvatarProps) {
  // Remembers which photo loaded, so a new link starts from the initials again.
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const photo = src && failed !== src ? src : null;
  return (
    <span
      className={cx(styles.avatar, styles[size], className)}
      style={{ "--avatar-hue": hue(name) } as React.CSSProperties}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      data-photo={photo && loaded === photo ? "" : undefined}
    >
      {initials(name)}
      {photo ? <img className={styles.photo} src={photo} alt="" draggable={false} onLoad={() => setLoaded(photo)} onError={() => setFailed(photo)} /> : null}
    </span>
  );
}
