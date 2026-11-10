import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import { overlayPosition, overlayViewport } from "../../lib/overlay-position";
import { cx } from "../../lib/cx";
import { useMobileLayout } from "../../lib/useMobileLayout";
import { Dialog } from "../Dialog/Dialog";
import styles from "./ContextMenu.module.css";

export type ContextMenuEntry =
  | {
      type?: "item";
      id: string;
      label: ReactNode;
      icon?: ReactNode;
      tone?: "danger";
      isDisabled?: boolean;
      shortcut?: string;
    }
  | { type: "separator"; id: string }
  | { type: "label"; id: string; label: ReactNode };

export interface ContextMenuProps {
  /** Viewport coordinates (e.g. from a contextmenu event). */
  x: number;
  y: number;
  items: ContextMenuEntry[];
  label: string;
  onAction: (id: string) => void;
  onClose: () => void;
  /** Optional free content under the items (e.g. a comment editor). Keys stay inside it. */
  children?: ReactNode;
  className?: string;
}

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
const pointerBoundary = {
  onPointerDown: stopPropagation,
  onPointerMove: stopPropagation,
  onPointerUp: stopPropagation,
  onPointerCancel: stopPropagation,
  onClick: stopPropagation,
  onDoubleClick: stopPropagation,
};

/**
 * Menu opened at the pointer (right click) or at a focused element (Shift+F10 / Menu key).
 * Arrow keys move, Enter activates, Escape or a click outside closes and focus returns.
 */
export function ContextMenu(props: ContextMenuProps) {
  const phone = useMobileLayout();
  if (!phone) return <DesktopContextMenu {...props} />;
  return (
    <div
      {...pointerBoundary}
      onKeyDown={stopPropagation}
      data-no-drag
      style={{ display: "contents" }}
    >
      <Dialog
        isOpen
        title={props.label}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <div className={cx(styles.phoneActions, props.className)}>
          {props.items.map((item) => {
            if (item.type === "separator")
              return (
                <div
                  key={item.id}
                  role="separator"
                  className={styles.separator}
                />
              );
            if (item.type === "label")
              return (
                <div key={item.id} className={styles.label}>
                  {item.label}
                </div>
              );
            return (
              <button
                key={item.id}
                type="button"
                className={styles.item}
                data-tone={item.tone}
                disabled={item.isDisabled}
                onClick={() => {
                  props.onAction(item.id);
                  props.onClose();
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  {item.icon}
                </span>
                <span className={styles.text}>{item.label}</span>
              </button>
            );
          })}
          {Children.toArray(props.children).length > 0 ? (
            <div className={styles.extra}>{props.children}</div>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}

function DesktopContextMenu({
  x,
  y,
  items,
  label,
  onAction,
  onClose,
  children,
  className,
}: ContextMenuProps) {
  // `{a ? x : null}{b ? y : null}` passes an array of nulls: only real content gets the extra area.
  const extra = Children.toArray(children).length > 0;
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(
    typeof document !== "undefined" ? document.activeElement : null,
  );
  const anchor = useRef(
    typeof document !== "undefined" ? document.elementFromPoint?.(x, y) : null,
  );
  const [position, setPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    visibility: "hidden",
  });

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const viewport = overlayViewport(anchor.current);
      setPosition({
        ...overlayPosition(
          { left: x, right: x, top: y, bottom: y },
          { width: el.offsetWidth, height: el.scrollHeight + 2 },
          viewport,
          0,
        ),
        maxWidth: viewport.width - 16,
        maxHeight: viewport.height - 16,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    for (
      let node = anchor.current;
      node instanceof HTMLElement;
      node = node.parentElement
    )
      observer?.observe(node);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [x, y]);

  useEffect(() => {
    // Focus goes to the menu itself, so no item looks chosen until the pointer or an arrow key picks one.
    const root = ref.current;
    const field = extra
      ? root?.querySelector<HTMLElement>("textarea, input, select")
      : null;
    (field ?? root)?.focus({ preventScroll: true });
    const back = returnTo.current;
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      // Dismissal owns this press; it must not start a drag or activate the covered control.
      event.preventDefault();
      event.stopPropagation();
      const finish = (tail: Event) => {
        if (tail.type === "click" && (tail as MouseEvent).detail > 0) {
          tail.preventDefault();
          tail.stopPropagation();
        }
        document.removeEventListener("click", finish, true);
        document.removeEventListener("pointerdown", finish, true);
        document.removeEventListener("pointercancel", finish, true);
      };
      document.addEventListener("click", finish, true);
      document.addEventListener("pointerdown", finish, true);
      document.addEventListener("pointercancel", finish, true);
      onClose();
    };
    const onScroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !ref.current?.contains(event.target)
      )
        onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    // The opener may have scrolled into view during this gesture; observe only later scrolls.
    const scrollFrame = requestAnimationFrame(() =>
      window.addEventListener("scroll", onScroll, true),
    );
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      if (back instanceof HTMLElement && document.contains(back))
        back.focus({ preventScroll: true });
    };
    // Focus handling runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (delta: number) => {
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? [],
    );
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (index < 0) nodes[delta > 0 ? 0 : nodes.length - 1]?.focus();
    else nodes[(index + delta + nodes.length) % nodes.length]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      {...pointerBoundary}
      data-no-drag
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={cx(styles.menu, className)}
      style={position}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if ((event.target as HTMLElement).closest("textarea, input, select"))
          return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {items.map((item) => {
        if (item.type === "separator")
          return (
            <div key={item.id} role="separator" className={styles.separator} />
          );
        if (item.type === "label")
          return (
            <div key={item.id} className={styles.label} role="presentation">
              {item.label}
            </div>
          );
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={styles.item}
            data-tone={item.tone}
            aria-disabled={item.isDisabled || undefined}
            onClick={() => {
              if (item.isDisabled) return;
              onAction(item.id);
              onClose();
            }}
          >
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <span className={styles.text}>{item.label}</span>
            {item.shortcut ? (
              <kbd className={styles.shortcut}>{item.shortcut}</kbd>
            ) : null}
          </button>
        );
      })}
      {extra ? <div className={styles.extra}>{children}</div> : null}
    </div>,
    document.body,
  );
}
