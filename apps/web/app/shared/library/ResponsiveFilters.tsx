import { useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, Dialog, DialogFooter, useMobileLayout } from "@trainflow/ui-web";
import styles from "./ResponsiveFilters.module.css";

/** The same controlled fields move into a sheet; their owning route keeps query state. */
export function ResponsiveFilters({ children, active = false }: { children: ReactNode; active?: boolean }) {
  const mobile = useMobileLayout();
  const [open, setOpen] = useState(false);
  if (!mobile) return children;
  return <>
    <Button iconStart={<SlidersHorizontal />} onPress={() => setOpen(true)}>{active ? "Filters applied" : "Filters"}</Button>
    <Dialog title="Filters and sorting" isOpen={open} onOpenChange={setOpen}>
      <div className={styles.fields}>{children}</div>
      <DialogFooter><Button variant="primary" onPress={() => setOpen(false)}>Show results</Button></DialogFooter>
    </Dialog>
  </>;
}
