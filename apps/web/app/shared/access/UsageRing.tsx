import { Activity, Clapperboard, Cpu, FileStack, Folder, Gauge, HardDrive, Sigma, Upload, UsersRound, Wand2 } from "lucide-react";
import { isCap, isNear, type UsageItem } from "./usage";
import styles from "./UsageRing.module.css";

/** An icon per limit, so the lists read at a glance. */
export function limitIcon(key: string) {
  if (/client/i.test(key)) return UsersRound;
  if (/seat/i.test(key)) return UsersRound;
  if (/folder/i.test(key)) return Folder;
  if (/formula/i.test(key)) return Sigma;
  if (/document|program|template/i.test(key)) return FileStack;
  if (/generator|generation/i.test(key)) return Wand2;
  if (/gpu/i.test(key)) return Cpu;
  if (/upload|pending/i.test(key)) return Upload;
  if (/bytes|size/i.test(key)) return HardDrive;
  if (/duration/i.test(key)) return Clapperboard;
  if (/concurrent/i.test(key)) return Activity;
  return Gauge;
}

/** How full a limit is: ok, near (≥ 80 %), full, a cap on one item, or no limit. */
export function usageState(item: UsageItem): "ok" | "near" | "full" | "cap" | "unlimited" {
  if (isCap(item.key)) return "cap";
  if (item.maximum === null) return "unlimited";
  if (item.maximum > 0 && item.used >= item.maximum) return "full";
  return isNear(item) ? "near" : "ok";
}

/** A circular meter; the colour follows the state. The content (icon or number) sits in the middle. */
export function UsageRing({ item, size = "md", neutral = false, children }: { item: UsageItem; size?: "sm" | "md" | "lg"; neutral?: boolean; children?: React.ReactNode }) {
  const state = usageState(item);
  const share = state === "cap" ? 1 : state === "unlimited" ? 0 : item.ratio;
  return (
    <span className={styles.ring} data-size={size} data-state={state} data-neutral={neutral || undefined} style={{ "--p": share } as React.CSSProperties} aria-hidden="true">
      <span className={styles.inner}>{children}</span>
    </span>
  );
}
