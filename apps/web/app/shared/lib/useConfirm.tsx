import { useCallback, useRef, useState } from "react";
import { AlertDialog } from "@trainflow/ui-web";
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
