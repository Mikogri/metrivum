import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { ChevronRight, Unlink, Trash2 } from "lucide-react";
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { PlanAnnotation, TrainingDocument } from "@metrivum/api-client-web";
import { ContextMenu } from "@metrivum/ui-web";
import { SheetMenuButton } from "./SheetMenuButton";
import sheet from "./SheetCanvas.module.css";
import styles from "./AnnotationCard.module.css";
type Apply = (fn: (doc: TrainingDocument) => TrainingDocument) => void;
export function AnnotationCard({ note, scope, apply, style, handle, dragging, collapsed = false, onToggle, ...events }: {
  collapsed?: boolean; onToggle?: () => void;
  note: PlanAnnotation; scope: string; apply?: Apply; style: CSSProperties; handle?: ReactNode; dragging: boolean;
  onPointerDown: (event: PointerEvent) => void; onPointerMove: (event: PointerEvent) => void; onPointerUp: (event: PointerEvent) => void;
}) {
  const uiCopy = useUiCopy();

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const patch = (change: Partial<PlanAnnotation>) => apply?.(doc => ({ ...doc, annotations: (doc.annotations ?? []).map(n => n.id === note.id ? { ...n, ...change } : n) }));
  return <article className={`${sheet.card} ${styles.card}`} style={{ ...style, width: Number(style.width) + (collapsed ? -8 : 2), minHeight: collapsed ? 34 : 162 }} data-node data-node-id={note.id} data-kind="annotation" data-collapsed={collapsed || undefined} data-annotation-id={note.id} data-dragging={dragging || undefined} aria-label={`${note.kind}: ${note.title}`} {...events} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setMenu({ x: event.clientX, y: event.clientY }); }}>
    <header className={styles.header}>{onToggle ? <button type="button" className={sheet.toggle} aria-label={collapsed ? uiCopy["ui"]["Expand card"] : uiCopy["ui"]["Collapse card"]} data-no-drag onClick={onToggle}><ChevronRight aria-hidden="true" data-open={!collapsed || undefined} /></button> : null}<span>{note.kind}</span>{apply ? <SheetMenuButton label={note.title} onOpen={(x, y) => setMenu({ x, y })} /> : null}</header>
    <div className={styles.content} style={{ display: collapsed ? "none" : undefined }} data-no-drag>
      <textarea aria-label={formatInterfaceText(uiCopy["ui"]["{0} text"], [note.kind])} value={note.content} placeholder={note.kind === "Goal" ? uiCopy["editor"]["week"]["goalPlaceholder"] : uiCopy["editor"]["week"]["commentPlaceholder"]} maxLength={4000} readOnly={!apply} onChange={event => patch({ content: event.target.value })} />
      <footer><span title={scope}>{scope}</span><button type="button" disabled={!apply} data-visibility={note.visibility} aria-label={formatInterfaceText(uiCopy["ui"]["{0} visibility"], [note.kind])} onClick={() => patch({ visibility: note.visibility === "Coach" ? "Client" : "Coach" })}>{note.visibility === "Coach" ? uiCopy["editor"]["week"]["coachOnly"] : uiCopy["editor"]["week"]["visibleToClient"]}</button></footer>
    </div>
    {handle}
    {menu ? <ContextMenu {...menu} label={note.kind} items={[{ id: "disconnect", icon: <Unlink />, label: uiCopy["ui"]["Make global"], isDisabled: !apply || !note.targetId }, { id: "remove", icon: <Trash2 />, label: uiCopy["editor"]["remove"], tone: "danger", isDisabled: !apply }]} onClose={() => setMenu(null)} onAction={id => { if (id === "disconnect") patch({ targetId: null }); else if (apply) apply(doc => ({ ...doc, annotations: (doc.annotations ?? []).filter(n => n.id !== note.id) })); }} /> : null}
  </article>;
}
