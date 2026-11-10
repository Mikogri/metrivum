import { Button, Dialog, DialogFooter } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";

/** Shown on 412: the local draft is kept until the user chooses what to do with it. */
export function ConflictDialog({
  isOpen,
  onReload,
  onSaveCopy,
  savingCopy,
  reloading,
}: {
  isOpen: boolean;
  onReload: () => void;
  onSaveCopy: () => void;
  savingCopy: boolean;
  reloading: boolean;
}) {
  const m = useT();
  const t = m.editor.conflict;
  return (
    <Dialog
      isOpen={isOpen}
      isDismissable={false}
      role="alertdialog"
      title={t.title}
      description={t.body}
      size="sm"
    >
      <DialogFooter>
        <Button
          variant="primary"
          block
          onPress={onSaveCopy}
          loading={savingCopy}
          isDisabled={reloading}
        >
          {t.saveAsCopy}
        </Button>
        <Button
          variant="danger"
          block
          onPress={onReload}
          loading={reloading}
          isDisabled={savingCopy}
        >
          {t.reload}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
