import { Card, Switch } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { setHideCollapsedChildren, useHideCollapsedChildren } from "./sheet-preferences";
import styles from "./PlanEditorPreferences.module.css";

/** Settings card for the plan editor's sheet: whether a minimised block hides its cycles and workouts. */
export function PlanEditorPreferences() {
  const t = useT().settings;
  const hide = useHideCollapsedChildren();
  return (
    <Card as="section" padding="lg" aria-labelledby="plan-editor-title" className={styles.card}>
      <div className={styles.text}>
        <h2 id="plan-editor-title" className={styles.title}>{t.planEditor}</h2>
        <p className={styles.hint}>{t.planEditorBody}</p>
      </div>
      <div className={styles.row}>
        <Switch isSelected={hide} onChange={setHideCollapsedChildren}>{t.hideCollapsedChildren}</Switch>
        <p className={styles.hint}>{t.hideCollapsedChildrenHint}</p>
      </div>
    </Card>
  );
}
