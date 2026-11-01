import { AlertTriangle } from "lucide-react";
import { Button } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import styles from "./FormatIssues.module.css";

const SHOWN = 8;

/** The problems as a list, capped so a long tooltip or alert stays readable. */
export function IssueList({ issues }: { issues: string[] }) {
  const t = useT().editor.issues;
  return (
    <ul className={styles.list}>
      {issues.slice(0, SHOWN).map((issue, i) => <li key={i}>{issue}</li>)}
      {issues.length > SHOWN ? <li className={styles.more}>{t.more(issues.length - SHOWN)}</li> : null}
    </ul>
  );
}

/** Red "N format problems" marker; hovering or focusing it lists where each problem is and why. */
export function FormatIssues({ issues, className, compact = false }: { issues: string[]; className?: string; compact?: boolean }) {
  const t = useT().editor.issues;
  if (!issues.length) return null;
  return (
    <TooltipTrigger delay={150}>
      <Button className={`${styles.marker} ${className ?? ""}`} data-compact={compact || undefined} aria-label={t.count(issues.length)}>
        <AlertTriangle aria-hidden="true" />
        {compact ? issues.length : t.count(issues.length)}
      </Button>
      <Tooltip placement="bottom" className={styles.tooltip}>
        <span className={styles.tip}><strong>{t.title}</strong><span>{t.intro}</span><IssueList issues={issues} /></span>
      </Tooltip>
    </TooltipTrigger>
  );
}
