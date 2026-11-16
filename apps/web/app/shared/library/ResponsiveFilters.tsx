import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Button,
  Dialog,
  DialogFooter,
  useMobileLayout,
} from "@portable-ui/react";
import styles from "./ResponsiveFilters.module.css";

/** The same controlled fields move into a sheet; their owning route keeps query state. */
export function ResponsiveFilters({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  const uiCopy = useUiCopy();

  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  if (!mobile) return children;
  return (
    <>
      <Button iconStart={<SlidersHorizontal />} onPress={() => setOpen(true)}>
        {active ? uiCopy["ui"]["Filters applied"] : uiCopy["ui"]["Filters"]}
      </Button>
      <Dialog
        title={uiCopy["ui"]["Filters and sorting"]}
        isOpen={open}
        onOpenChange={setOpen}
      >
        <div className={styles.fields}>{children}</div>
        <DialogFooter>
          <Button variant="primary" onPress={() => setOpen(false)}>
            {uiCopy["ui"]["Show results"]}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
