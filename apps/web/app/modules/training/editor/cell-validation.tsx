import { createContext, useContext, useEffect, useId } from "react";
export const CellValidationContext = createContext<(id: string, invalid: boolean, detail?: string) => void>(() => {});
/** Editing errors are transient and must not be persisted in training documents. */
export function useCellValidation(invalid: boolean, label = "Cell", reason = "Enter a valid value.") {
  const report = useContext(CellValidationContext); const id = useId();
  useEffect(() => {
    const cell = [...document.querySelectorAll<HTMLElement>("[data-validation-id]")].find(node => node.dataset.validationId === id);
    const card = cell?.closest("[data-node]");
    const row = cell?.closest('[role="row"]');
    const exercise = row?.querySelector('button[aria-label^="Exercise:"]')?.textContent;
    const rows = row?.parentElement?.querySelectorAll('[role="row"]');
    const rowNumber = row && rows ? [...rows].indexOf(row) + 1 : 0;
    const grid = cell?.closest('[role="grid"]');
    const headers = grid ? [...grid.querySelectorAll<HTMLElement>('[role="columnheader"]')] : [];
    const column = headers.findIndex(header => {
      const a = header.getBoundingClientRect(), b = cell?.getBoundingClientRect();
      return b && a.width > 0 && b.left >= a.left - 1 && b.left < a.right;
    });
    const address = column >= 0 ? `Column ${column + 1}` : undefined;
    const context = [card?.getAttribute("aria-label") ?? card?.getAttribute("data-node"), rowNumber ? `Row ${rowNumber}` : undefined, exercise, address, label].filter(Boolean).join(" · ");
    report(id, invalid, `${context}: ${reason}`);
    return () => report(id, false);
  }, [id, invalid, label, reason, report]);
  return id;
}
