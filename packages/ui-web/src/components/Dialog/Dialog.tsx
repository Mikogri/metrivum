import { useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading as AriaHeading,
  Modal,
  ModalOverlay,
  type ModalOverlayProps,
} from "react-aria-components";
import { cx } from "../../lib/cx";
import { Button } from "../../primitives/Button/Button";
import { IconButton } from "../../primitives/IconButton/IconButton";
import styles from "./Dialog.module.css";

export { DialogTrigger };

export interface DialogProps extends Omit<ModalOverlayProps, "className" | "children"> {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode | ((close: () => void) => ReactNode);
  /** Footer actions. Receives `close` so actions can dismiss the dialog. */
  footer?: (close: () => void) => ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * `right` slides a full-height panel in from the right edge: used for larger forms (the default
   * for `lg` and `xl`). `center` is the regular dialog.
   */
  placement?: "center" | "right";
  /** Label for the close icon button (translated by the app). */
  closeLabel?: string;
  role?: "dialog" | "alertdialog";
  className?: string;
}

/** Exit animation lengths in Dialog.module.css. */
const EXIT_MODAL_MS = 200;
const EXIT_PANEL_MS = 260;

export function Dialog({
  title,
  description,
  children,
  footer,
  size = "md",
  placement,
  closeLabel = "Close",
  role = "dialog",
  className,
  isDismissable = true,
  isOpen,
  onOpenChange,
  ...overlayProps
}: DialogProps) {
  const side = placement ?? (size === "lg" || size === "xl" ? "right" : "center");
  // Many dialogs are removed from the page the moment they close, which would cut the exit
  // animation off. When that happens, a still copy of the panel plays the exit and is then removed.
  const overlay = useRef<HTMLDivElement>(null);
  const animationGeneration = useRef({ generation: 0 });
  useLayoutEffect(() => {
    const animation = animationGeneration.current;
    const generation = ++animation.generation;
    const node = overlay.current;
    return () => {
      if (!node?.isConnected || node.hasAttribute("data-exiting")) return;
      // Only real browsers animate (not test DOMs), and never with reduced motion.
      if (typeof window === "undefined" || typeof node.animate !== "function" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.setAttribute("data-exiting", "");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("inert", "");
      ghost.style.pointerEvents = "none";
      ghost.querySelectorAll("[data-placement]").forEach((el) => el.setAttribute("data-exiting", ""));
      const parent = node.parentNode;
      const sibling = node.nextSibling;
      // StrictMode replays effects on opening; only a real unmount gets an exit copy.
      queueMicrotask(() => {
        if (animation.generation !== generation || !parent?.isConnected) return;
        parent.insertBefore(ghost, sibling?.parentNode === parent ? sibling : null);
        setTimeout(() => ghost.remove(), side === "right" ? EXIT_PANEL_MS + 60 : EXIT_MODAL_MS + 60);
      });
    };
  }, [side]);
  return (
    <ModalOverlay
      {...overlayProps}
      ref={overlay}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={isDismissable}
      className={styles.overlay}
      data-placement={side}
    >
      <Modal className={cx(styles.modal, styles[size], className)} data-placement={side}>
        <AriaDialog role={role} className={styles.dialog}>
          {({ close }) => (
            <>
              <header className={styles.header}>
                <div className={styles.titles}>
                  <AriaHeading slot="title" className={styles.title}>
                    {title}
                  </AriaHeading>
                  {description ? <p className={styles.description}>{description}</p> : null}
                </div>
                {isDismissable ? (
                  <IconButton label={closeLabel} icon={<X />} size="sm" onPress={close} showTooltip={false} className={styles.close} />
                ) : null}
              </header>
              {children ? (
                <div className={styles.body}>{typeof children === "function" ? children(close) : children}</div>
              ) : null}
              {footer ? <footer className={styles.footer}>{footer(close)}</footer> : null}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Actions bar for dialogs whose buttons live inside a form in the body (so Enter submits):
 * renders like the `footer` prop, full-bleed with a hairline and equal-width buttons.
 */
export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.footer, styles.inlineFooter, className)}>{children}</div>;
}

export interface AlertDialogProps extends Omit<DialogProps, "footer" | "children" | "role"> {
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger" | "success";
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
  /** The confirm action can't run yet (e.g. something must be fixed first); cancel stays available. */
  isConfirmDisabled?: boolean;
}

/**
 * Confirmation that interrupts the flow: a toned icon beside the message, then two equal-width actions.
 * Focus starts on the cancel action for destructive confirms.
 */
/** Outline warning triangle (Tabler); stroked in currentColor so the tone comes from CSS. */
function WarningGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" />
      <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/** Outline circle check (Tabler), for confirmations of a positive step. */
function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
      <path d="M9 12l2 2l4 -4" />
    </svg>
  );
}

export function AlertDialog({
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  isConfirming,
  isConfirmDisabled,
  children,
  description,
  ...props
}: AlertDialogProps) {
  return (
    <Dialog
      {...props}
      role="alertdialog"
      size="sm"
      isDismissable={!isConfirming}
      isKeyboardDismissDisabled={isConfirming || props.isKeyboardDismissDisabled}
      footer={(close) => (
        <>
          <Button variant="secondary" onPress={close} isDisabled={isConfirming} autoFocus={tone === "danger"}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : tone === "success" ? "success" : "primary"}
            loading={isConfirming}
            isDisabled={isConfirmDisabled}
            onPress={async () => {
              await onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div className={styles.alert}>
        <span className={styles.alertIcon} data-tone={tone} aria-hidden="true">
          {tone === "success" ? <CheckGlyph /> : <WarningGlyph />}
        </span>
        <div className={styles.alertText}>
          {description ? <p>{description}</p> : null}
          {children}
        </div>
      </div>
    </Dialog>
  );
}
