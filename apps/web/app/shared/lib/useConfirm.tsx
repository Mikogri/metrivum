import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useCallback, useRef, useState } from "react";
import { AlertDialog } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";

/** Promise-based confirmation for discarding unsaved work. Render `dialog` once in the tree. */
export function useDiscardConfirm() {
  const m = useT();
  const [open, setOpen] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  };

  const dialog = (
    <AlertDialog
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      title={m.common.unsavedTitle}
      tone="danger"
      confirmLabel={m.common.discard}
      cancelLabel={m.common.keepEditing}
      onConfirm={() => settle(true)}
    >
      <p>{m.common.unsavedBody}</p>
    </AlertDialog>
  );

  return { confirm, dialog };
}

export interface DangerConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
}

/**
 * Promise-based confirmation for destructive actions (decline, revoke, end, cancel, archive…).
 * `await ask({...})` resolves true when confirmed. Render `dialog` once in the tree.
 */
export function useDangerConfirm() {
  const uiCopy = useUiCopy();

  const [options, setOptions] = useState<DangerConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  // Keeps the copy on screen while the dialog plays its exit animation.
  const shown = useRef<DangerConfirmOptions | null>(null);
  if (options) shown.current = options;
  const view = shown.current;

  const ask = useCallback(
    (next: DangerConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOptions(next);
      }),
    [],
  );

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  const dialog = (
    <AlertDialog
      isOpen={options !== null}
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
      title={view?.title ?? ""}
      tone="danger"
      confirmLabel={view?.confirmLabel ?? uiCopy["ui"]["Confirm"]}
      cancelLabel={view?.cancelLabel ?? uiCopy["common"]["cancel"]}
      onConfirm={() => settle(true)}
    >
      {typeof view?.body === "string" ? <p>{view.body}</p> : view?.body}
    </AlertDialog>
  );

  return { ask, dialog };
}
