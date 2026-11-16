import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Video analysis — Metrivum");

import { useState } from "react";
import type { AnalysisDto } from "@metrivum/api-client-web";
import { Navigate } from "react-router";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  useMobileLayout,
} from "@portable-ui/react";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { Failure, Loading } from "~/modules/coaching";
import { useAnalysisList, useAnalysisResult } from "../queries";
import { StatusBadge } from "../components/StatusBadge";
import { LOCAL_ANALYZER_UNAVAILABLE } from "../local-analysis";
import styles from "./mobile-analysis.module.css";

function SavedResult({ analysis }: { analysis: AnalysisDto }) {
  const uiCopy = useUiCopy();

  const result = useAnalysisResult(
    analysis.id,
    analysis.status === "Completed",
  );
  if (analysis.status !== "Completed")
    return <p>{uiCopy["ui"]["This analysis has no completed result yet."]}</p>;
  if (result.isPending) return <Loading />;
  if (result.isError)
    return <Failure error={result.error} retry={() => void result.refetch()} />;
  return (
    <div className={styles.stack}>
      <p>
        {result.data.method} · {result.data.positionUnit}
      </p>
      {result.data.repetitions.length ? (
        result.data.repetitions.map((rep) => (
          <section className={styles.result} key={rep.number}>
            <h3>
              {uiCopy["video"]["compare"]["rep"]} {rep.number}
            </h3>
            <p>
              {rep.startSeconds.toFixed(2)} – {rep.endSeconds.toFixed(2)} s
            </p>
            <dl>
              <div>
                <dt>{uiCopy["video"]["detail"]["meanSpeed"]}</dt>
                <dd>{rep.meanSpeed?.toFixed(2) ?? "–"}</dd>
              </div>
              <div>
                <dt>{uiCopy["video"]["detail"]["peakSpeed"]}</dt>
                <dd>{rep.peakSpeed?.toFixed(2) ?? "–"}</dd>
              </div>
              <div>
                <dt>{uiCopy["video"]["detail"]["phases"]}</dt>
                <dd>{rep.phases.length}</dd>
              </div>
            </dl>
          </section>
        ))
      ) : (
        <EmptyState title={uiCopy["ui"]["No repetitions detected"]} />
      )}
    </div>
  );
}

/** The phone list of saved analyses; on a desktop it opens the full library. Uses the same saved-result queries as the desktop library and the native analysis screen. */
export default function MobileAnalysis() {
  const uiCopy = useUiCopy();

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AnalysisDto>();
  const list = useAnalysisList({ page, pageSize: 20, sort: "created" });
  const mobile = useMobileLayout();
  const { mode } = useWorkspace();
  // A desktop has the full analysis library (charts, video, comparison): open that instead of the phone list.
  if (!mobile)
    return (
      <Navigate
        to={mode === "coach" ? "/app/video-analyses" : "/app/my-analyses"}
        replace
      />
    );
  return (
    <>
      <PageHeader
        title={uiCopy["settings"]["areas"]["video"]}
        description={uiCopy["ui"]["Saved bar-path and speed results"]}
      />
      <div className={styles.stack}>
        <Alert title={uiCopy["ui"]["New local analysis is not available yet"]}>
          {LOCAL_ANALYZER_UNAVAILABLE}
        </Alert>
        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <Failure error={list.error} retry={() => void list.refetch()} />
        ) : list.data.length ? (
          <ul className={styles.list}>
            {list.data.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => setSelected(item)}>
                  <strong>{item.name}</strong>
                  <StatusBadge status={item.status} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={uiCopy["ui"]["No saved analyses"]} />
        )}
        <div className={styles.pages}>
          <Button
            isDisabled={page === 1 || list.isFetching}
            onPress={() => setPage((value) => value - 1)}
          >
            {uiCopy["common"]["previous"]}
          </Button>
          <span>
            {uiCopy["ui"]["Page"]} {page}
          </span>
          <Button
            isDisabled={list.isFetching || (list.data?.length ?? 0) < 20}
            onPress={() => setPage((value) => value + 1)}
          >
            {uiCopy["common"]["next"]}
          </Button>
        </div>
        <Dialog
          title={selected?.name ?? uiCopy["ui"]["Analysis"]}
          isOpen={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
        >
          {selected && <SavedResult analysis={selected} />}
        </Dialog>
      </div>
    </>
  );
}
