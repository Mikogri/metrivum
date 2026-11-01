import { Folder } from "lucide-react";
import { useState } from "react";
import { Button, Dialog } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { FolderTree } from "./FolderTree";
import { useFolderLookup } from "./folderLookup";
import styles from "./FolderField.module.css";

/** Shows the chosen folder and opens a tree picker to change it. */
export function FolderField({ label, value, onChange, excludeId }: { label: string; value: string | null; onChange: (id: string | null) => void; excludeId?: string }) {
  const m = useT();
  const [open, setOpen] = useState(false);
  const lookup = useFolderLookup();
  const name = value === null ? m.training.library.folder.rootOption : (lookup.get(value)?.name ?? "…");
  return (
    <div className={styles.field}>
      <span className={styles.label} id="folder-field-label">
        {label}
      </span>
      <div className={styles.value}>
        <Folder aria-hidden="true" />
        <span aria-labelledby="folder-field-label">{name}</span>
        <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>
          {m.common.edit}
        </Button>
      </div>
      <Dialog isOpen={open} onOpenChange={setOpen} title={label} size="sm" closeLabel={m.common.close}>
        <FolderTree
          label={label}
          currentId={value}
          hrefFor={() => "#"}
          onSelect={(folder) => {
            if (folder && folder.id === excludeId) return;
            onChange(folder?.id ?? null);
            setOpen(false);
          }}
        />
      </Dialog>
    </div>
  );
}
