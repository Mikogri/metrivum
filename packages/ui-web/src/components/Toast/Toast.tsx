import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XOctagon } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms; 0 keeps the toast until dismissed. Errors default to 8s. */
  duration?: number;
  action?: { label: string; onAction: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
  dismissed: boolean;
}

type Listener = () => void;
let records: ToastRecord[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

/** Show a toast from anywhere. No provider needed beyond a single `<Toaster />`. */
export function toast(options: ToastOptions): number {
  const id = nextId++;
  records = [...records, { ...options, id, dismissed: false }].slice(-5);
  emit();
  return id;
}

export function dismissToast(id: number) {
  records = records.map((record) => (record.id === id ? { ...record, dismissed: true } : record));
  emit();
  // Remove after the exit transition.
  setTimeout(() => {
    records = records.filter((record) => record.id !== id);
    emit();
  }, 220);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => records;
const getServerSnapshot = (): ToastRecord[] => [];

const icons = { neutral: Info, success: CheckCircle2, warning: AlertTriangle, danger: XOctagon };

function ToastItem({ record, index, dismissLabel }: { record: ToastRecord; index: number; dismissLabel: string }) {
  const [mounted, setMounted] = useState(false);
  const remaining = useRef(record.duration ?? (record.tone === "danger" ? 8000 : 5000));
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pause = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      remaining.current -= Date.now() - started.current;
    }
  };
  const resume = () => {
    if (remaining.current <= 0 || record.duration === 0 || timer.current) return;
    started.current = Date.now();
    timer.current = setTimeout(() => dismissToast(record.id), remaining.current);
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    resume();
    // Timers pause while the tab is hidden, so nobody misses a message.
    const onVisibility = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tone = record.tone ?? "neutral";
  const Icon = icons[tone];
  return (
    <li
      className={cx(styles.toast, styles[tone])}
      data-mounted={mounted || undefined}
      data-dismissed={record.dismissed || undefined}
      style={{ "--index": index } as React.CSSProperties}
      role={tone === "danger" ? "alert" : "status"}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <div className={styles.body}>
        <p className={styles.title}>{record.title}</p>
        {record.description ? <p className={styles.description}>{record.description}</p> : null}
      </div>
      {record.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            record.action?.onAction();
            dismissToast(record.id);
          }}
        >
          {record.action.label}
        </button>
      ) : null}
      <button type="button" className={styles.close} aria-label={dismissLabel} onClick={() => dismissToast(record.id)}>
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

export interface ToasterProps {
  /** Region label for assistive tech, e.g. "Notifications". */
  label: string;
  dismissLabel: string;
}

export function Toaster({ label, dismissLabel }: ToasterProps) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <section aria-label={label} className={styles.region}>
      <ol className={styles.list}>
        {items.map((record, i) => (
          <ToastItem key={record.id} record={record} index={items.length - 1 - i} dismissLabel={dismissLabel} />
        ))}
      </ol>
    </section>
  );
}
