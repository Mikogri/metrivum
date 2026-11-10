import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, CircleX, Info, X } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** ms; 0 keeps the toast until dismissed. Errors persist by default. */
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
  records = [{ ...options, id, dismissed: false }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  records = records.map((record) =>
    record.id === id ? { ...record, dismissed: true } : record,
  );
  emit();
  // Remove after the exit transition.
  setTimeout(() => {
    records = records.filter((record) => record.id !== id);
    emit();
  }, 220);
}

/** Drop private action feedback when leaving an account. */
export function clearToasts() {
  records = [];
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => records;
const emptySnapshot: ToastRecord[] = [];
const getServerSnapshot = () => emptySnapshot;

const icons = {
  neutral: Info,
  success: CircleCheck,
  warning: CircleAlert,
  danger: CircleX,
};

function ToastItem({
  record,
  index,
  dismissLabel,
}: {
  record: ToastRecord;
  index: number;
  dismissLabel: string;
}) {
  const [mounted, setMounted] = useState(false);
  const remaining = useRef(
    record.duration ?? (record.tone === "danger" ? 0 : 5000),
  );
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
    if (remaining.current <= 0 || record.duration === 0 || timer.current)
      return;
    started.current = Date.now();
    timer.current = setTimeout(
      () => dismissToast(record.id),
      remaining.current,
    );
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

  const [paused, setPaused] = useState(false);
  const duration = record.duration ?? (record.tone === "danger" ? 0 : 5000);
  return (
    <ToastView
      {...record}
      index={index}
      duration={duration}
      mounted={mounted}
      dismissed={record.dismissed}
      paused={paused}
      dismissLabel={dismissLabel}
      onDismiss={() => dismissToast(record.id)}
      onPause={() => {
        setPaused(true);
        pause();
      }}
      onResume={() => {
        setPaused(false);
        resume();
      }}
    />
  );
}

export interface ToastViewProps extends Omit<ToastOptions, "duration"> {
  dismissLabel: string;
  /** ms shown by the countdown bar; 0 hides it. */
  duration?: number;
  index?: number;
  mounted?: boolean;
  dismissed?: boolean;
  paused?: boolean;
  onDismiss?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

/** One toast without the queue: used by the Toaster and for previews. */
export function ToastView({
  title,
  description,
  tone = "neutral",
  action,
  dismissLabel,
  duration = 0,
  index = 0,
  mounted = true,
  dismissed,
  paused,
  onDismiss,
  onPause,
  onResume,
}: ToastViewProps) {
  const Icon = icons[tone];
  return (
    <li
      className={cx(styles.toast, styles[tone])}
      data-mounted={mounted || undefined}
      data-dismissed={dismissed || undefined}
      data-paused={paused || undefined}
      style={
        {
          "--index": index,
          "--duration": `${duration}ms`,
        } as React.CSSProperties
      }
      role={tone === "danger" ? "alert" : "status"}
      onPointerEnter={onPause}
      onPointerLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon />
      </span>
      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
        {action ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                action.onAction();
                onDismiss?.();
              }}
            >
              {action.label}
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
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
          <ToastItem
            key={record.id}
            record={record}
            index={items.length - 1 - i}
            dismissLabel={dismissLabel}
          />
        ))}
      </ol>
    </section>
  );
}
