import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../lib/cx";
import styles from "./ContextMenu.module.css";

export type ContextMenuEntry =
  | { type?: "item"; id: string; label: ReactNode; icon?: ReactNode; tone?: "danger"; isDisabled?: boolean; shortcut?: string }
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

/**
 * Menu opened at the pointer (right click) or at a focused element (Shift+F10 / Menu key).
 * Arrow keys move, Enter activates, Escape or a click outside closes and focus returns.
 */
export function ContextMenu({ x, y, items, label, onAction, onClose, children, className }: ContextMenuProps) {
  // `{a ? x : null}{b ? y : null}` passes an array of nulls: only real content gets the extra area.
  const extra = Children.toArray(children).length > 0;
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(typeof document !== "undefined" ? document.activeElement : null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    // Focus goes to the menu itself, so no item looks chosen until the pointer or an arrow key picks one.
    const root = ref.current;
    const field = extra ? root?.querySelector<HTMLElement>("textarea, input, select") : null;
    (field ?? root)?.focus({ preventScroll: true });
    const back = returnTo.current;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onScroll = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      if (back instanceof HTMLElement && document.contains(back)) back.focus({ preventScroll: true });
    };
    // Focus handling runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (delta: number) => {
    const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (index < 0) nodes[delta > 0 ? 0 : nodes.length - 1]?.focus();
    else nodes[(index + delta + nodes.length) % nodes.length]?.focus();
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className={cx(styles.menu, className)}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if ((event.target as HTMLElement).closest("textarea, input, select")) return;
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
        if (item.type === "separator") return <div key={item.id} role="separator" className={styles.separator} />;
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
            {item.shortcut ? <kbd className={styles.shortcut}>{item.shortcut}</kbd> : null}
          </button>
        );
      })}
      {extra ? <div className={styles.extra}>{children}</div> : null}
    </div>,
    document.body,
  );
}
