import { CircleCheck, CircleDashed } from "lucide-react";
import { Button } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { useRevisions } from "../queries";
import styles from "./FormatIssues.module.css";

/**
 * Whether what is on screen is what clients get: "Applied · v3" when the newest version was made from
 * this exact draft, otherwise "Draft · not applied" (or "Never applied" before the first version).
 */
export function DraftState({ planId, draftVersion, compact = false }: { planId: string; draftVersion: number; compact?: boolean }) {
  const t = useT().editor.draftState;
  const revisions = useRevisions(planId);
  if (!revisions.data) return null;
  const latest = [...revisions.data.items].sort((a, b) => Number(b.number) - Number(a.number))[0];
  const applied = latest != null && Number(latest.draftVersion) === draftVersion;
  const label = compact ? (applied ? `v${Number(latest.number)}` : latest ? t.draftShort : t.never) : applied ? t.applied(Number(latest.number)) : latest ? t.draft : t.never;
  const hint = applied ? t.appliedHint : latest ? t.draftHint(Number(latest.number)) : t.neverHint;
  return (
    <TooltipTrigger delay={300}>
      <Button className={styles.state} data-compact={compact || undefined} data-applied={applied || undefined} data-unpublished={!latest || undefined} aria-label={applied ? t.applied(Number(latest.number)) : latest ? t.draft : t.never}>
        {applied ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
        <span className={styles.stateLabel}>{label}</span>
      </Button>
      <Tooltip placement="bottom">{compact ? <>{applied ? t.applied(Number(latest.number)) : latest ? t.draft : t.never}. {hint}</> : hint}</Tooltip>
    </TooltipTrigger>
  );
}
