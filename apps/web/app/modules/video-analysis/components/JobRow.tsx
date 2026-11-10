import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { Button as AriaButton } from "react-aria-components";
import { Tooltip, TooltipTrigger } from "@metrivum/ui-web";
import type { SavingState } from "../analyzer-jobs";
import type { AnalyzerJob } from "../local-analysis";
import { jobStatus } from "../job-status";
import styles from "./JobRow.module.css";

/**
 * One video in the analyzer, the same everywhere (queue panel, app bar menu): its state icon, a short status,
 * a progress bar while it is worked on, and for failures a short "Failed" whose reason shows on hover or focus.
 */
export function JobRow({
  job,
  saving,
  saveError,
  actions,
  tile = false,
}: {
  job: AnalyzerJob;
  saving?: SavingState;
  saveError?: string;
  actions?: ReactNode;
  tile?: boolean;
}) {
  const uiCopy = useUiCopy();

  const { state, percent, text } = jobStatus(job, saving, saveError);
  const failed = state === "failed" || state === "save_failed";
  const moving =
    state === "analyzing" || state === "saving" || state === "done";
  return (
    <li className={styles.row} data-state={state} data-tile={tile || undefined}>
      <span className={styles.icon} aria-hidden="true">
        {state === "queued" ? (
          <Clock />
        ) : failed ? (
          <CircleAlert />
        ) : (
          <LoaderCircle className={styles.spin} />
        )}
      </span>
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name} title={job.name}>
            {job.name}
          </span>
          {moving ? <span className={styles.percent}>{percent}%</span> : null}
        </span>
        {failed ? (
          <TooltipTrigger delay={100}>
            <AriaButton className={styles.failed}>
              {state === "save_failed"
                ? uiCopy["ui"]["Saving failed"]
                : uiCopy["video"]["statuses"]["Failed"]}{" "}
              {uiCopy["ui"]["· details"]}
            </AriaButton>
            <Tooltip placement="bottom start" className={styles.reason}>
              {text}
            </Tooltip>
          </TooltipTrigger>
        ) : (
          <span className={styles.status}>{text}</span>
        )}
        {moving ? (
          <span
            className={styles.bar}
            role="progressbar"
            aria-label={formatInterfaceText(uiCopy["ui"]["{0} progress"], [
              job.name,
            ])}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span
              style={{ transform: `scaleX(${Math.max(0.02, percent / 100)})` }}
            />
          </span>
        ) : null}
      </span>
      {actions ? <span className={styles.actions}>{actions}</span> : null}
    </li>
  );
}

/** A finished video that is already in the library. */
export function SavedRow({
  name,
  status,
  actions,
  tile = false,
}: {
  name: string;
  status: string;
  actions?: ReactNode;
  tile?: boolean;
}) {
  return (
    <li className={styles.row} data-state="saved" data-tile={tile || undefined}>
      <span className={styles.icon} aria-hidden="true">
        <CircleCheck />
      </span>
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name} title={name}>
            {name}
          </span>
        </span>
        <span className={styles.status}>{status}</span>
      </span>
      {actions ? <span className={styles.actions}>{actions}</span> : null}
    </li>
  );
}
