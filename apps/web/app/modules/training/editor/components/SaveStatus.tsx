import { Tooltip, TooltipTrigger } from "@trainflow/ui-web";
import { Button } from "react-aria-components";
import { IssueList } from "../../components/FormatIssues";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { AlertTriangle, Check, CloudOff, Loader2, Pencil, XOctagon } from "lucide-react";
import { useT } from "~/shared/i18n/AppLocale";
import type { SaveStatus as Status } from "../useEditor";
import styles from "./SaveStatus.module.css";

const icons = { clean: Check, saved: Check, dirty: Pencil, saving: Loader2, error: XOctagon, conflict: AlertTriangle, offline: CloudOff };

export function SaveStatus({ status, invalidFormat = false, issues = [], serverIssue }: { status: Status; invalidFormat?: boolean; issues?: string[]; serverIssue?: string }) {
  const m = useT();
  const pl = useLocale() === "pl";
  const label = invalidFormat ? status === "error" ? (pl ? "Nie udało się zapisać — niepoprawny format" : "Couldn’t save — invalid format") : status === "saved" || status === "clean" ? (pl ? "Szkic zapisany — niepoprawny format" : "Draft saved — invalid format") : (pl ? "Niepoprawny format" : "Invalid format") : m.editor.status[status === "clean" ? "saved" : status];
  const Icon = invalidFormat && status !== "saving" ? AlertTriangle : icons[status];
  const content = (
    <span className={styles.status} data-status={status} data-invalid={invalidFormat || undefined} role="status" aria-live="polite">
      <Icon aria-hidden="true" className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </span>
  );
  if (!invalidFormat) return content;
  const details = [...issues, serverIssue].filter(Boolean);
  return <TooltipTrigger delay={150}>
    <Button className={styles.trigger} aria-label={pl ? "Szczegóły walidacji" : "Validation details"}>{content}</Button>
    <Tooltip placement="bottom" className={styles.tooltip}>
      <span className={styles.issues}><strong>{m.editor.issues.title}</strong>{details.length ? <IssueList issues={details as string[]} /> : <span>{pl ? "Sprawdź podświetlone komórki." : "Check the highlighted cells."}</span>}</span>
    </Tooltip>
  </TooltipTrigger>;
}
