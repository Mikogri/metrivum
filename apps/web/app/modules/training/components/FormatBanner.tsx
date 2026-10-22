import { useCallback, useSyncExternalStore } from "react";
import { AlertTriangle } from "lucide-react";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey } from "~/shared/session/AccountScope";
import { FormatIssues } from "./FormatIssues";
import styles from "./FormatIssues.module.css";

/*
 * The server's last "invalid format" answer for a plan (a refused apply), remembered in this browser
 * until an apply succeeds. The browser-side check cannot see every rule (formulas are evaluated on the
 * server), so this keeps the plan marked as broken in the editor and on the plan page, across visits.
 */
const listeners = new Set<() => void>();
const storageKey = (account: string, planId: string) => `trainflow:format-refusal:${account}:${planId}`;
function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => { listeners.delete(listener); window.removeEventListener("storage", listener); };
}

export function useFormatRefusal(planId: string) {
  const key = storageKey(String(useAccountKey()), planId);
  const refusal = useSyncExternalStore(subscribe, () => read(key), () => null);
  const set = useCallback((detail: string | null) => {
    try {
      if (detail) localStorage.setItem(key, detail);
      else localStorage.removeItem(key);
    } catch { /* storage unavailable: the marker then only reflects the browser-side check */ }
    listeners.forEach((listener) => listener());
  }, [key]);
  return [refusal, set] as const;
}

/** A quiet red line, always shown while the plan is known to be invalid; hover the marker for where and why. */
export function FormatBanner({ issues, serverIssue, className }: { issues: string[]; serverIssue?: string | null; className?: string }) {
  const t = useT().editor.issues;
  const all = [...issues, ...(serverIssue && !issues.includes(serverIssue) ? [serverIssue] : [])];
  if (!all.length) return null;
  return (
    <p className={`${styles.banner} ${className ?? ""}`} role="status">
      <AlertTriangle aria-hidden="true" />
      <span className={styles.bannerText}>
        <strong>{t.bannerTitle}.</strong> {t.bannerBody}
      </span>
      <FormatIssues issues={all} />
    </p>
  );
}
