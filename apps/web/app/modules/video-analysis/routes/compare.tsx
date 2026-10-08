import { useQuery } from "@tanstack/react-query";
import { GitCompare } from "lucide-react";
import { Alert, Breadcrumbs, Button, Card, EmptyState, ErrorState, NumberInput, Option, PageHeader, Select, Skeleton } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useUrlState } from "~/shared/lib/useUrlState";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { compareAnalyses } from "../api";
import { ResultView } from "../components/ResultView";
import { useAnalysisList } from "../queries";
import styles from "./compare.module.css";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Compare analyses — TrainFlow");

function Compare() {
  const m = useT();
  const t = m.video.compare;
  const api = useApi();
  const a = useAccountKey();
  const [state, update] = useUrlState({ left: "", right: "", lrep: "", rrep: "", run: "" });
  const completed = useAnalysisList({ status: "Completed", sort: "newest", pageSize: 100 });
  const same = state.left && state.left === state.right && (!state.lrep || state.lrep === state.rrep);
  const ready = Boolean(state.left && state.right && !same && state.run === "1");
  const comparison = useQuery({
    queryKey: [a, "video", "compare", state.left, state.right, state.lrep, state.rrep],
    queryFn: ({ signal }) =>
      compareAnalyses(
        api,
        { leftId: state.left, rightId: state.right, leftRepetition: state.lrep ? Number(state.lrep) : undefined, rightRepetition: state.rrep ? Number(state.rrep) : undefined },
        signal,
      ),
    enabled: ready,
    staleTime: Infinity,
  });
  const items = completed.data ?? [];
  const nameOf = (id: string) => items.find((x) => x.id === id)?.name ?? "";
  const data = comparison.data;
  const unitMismatch = data && data.left.positionUnit !== data.right.positionUnit;
  const calibrationMismatch = data && Boolean(data.left.metersPerPixel) !== Boolean(data.right.metersPerPixel);

  return (
    <>
      <PageHeader
        context={<Breadcrumbs items={[{ id: "list", label: m.video.list.title, href: "/app/video-analyses" }, { id: "compare", label: t.title }]} />}
        title={t.title}
        description={t.body}
      />
      <Card padding="lg" className={styles.pickers}>
        {(["left", "right"] as const).map((side) => (
          <div key={side} className={styles.picker}>
            <Select
              label={side === "left" ? t.left : t.right}
              placeholder={t.choose}
              selectedKey={state[side] || null}
              onSelectionChange={(key) => update({ [side]: key ? String(key) : null, run: null })}
            >
              {items.map((analysis) => (
                <Option key={analysis.id} id={analysis.id}>
                  {analysis.name}
                </Option>
              ))}
            </Select>
            <NumberInput placeholder={m.common.ph.number}
              label={`${t.rep} (${m.common.optional.toLowerCase()})`}
              minValue={1}
              value={state[side === "left" ? "lrep" : "rrep"] ? Number(state[side === "left" ? "lrep" : "rrep"]) : NaN}
              onChange={(value) => update({ [side === "left" ? "lrep" : "rrep"]: Number.isNaN(value) ? null : String(value), run: null })}
            />
          </div>
        ))}
        <div className={styles.submit}>
          <Button variant="primary" iconStart={<GitCompare />} isDisabled={!state.left || !state.right || Boolean(same)} onPress={() => update({ run: "1" })}>
            {t.submit}
          </Button>
        </div>
        {same ? <Alert tone="info" title={t.sameAnalysis} /> : null}
        {completed.isSuccess && items.length < 1 ? <Alert tone="info" title={t.onlyCompleted} /> : null}
      </Card>

      {!ready ? (
        <EmptyState icon={<GitCompare />} title={t.onlyCompleted} size="sm" />
      ) : comparison.isPending ? (
        <Skeleton height="20rem" radius="lg" />
      ) : comparison.isError ? (
        <ErrorState title={errorText(m, comparison.error)} reference={traceIdOf(comparison.error)} />
      ) : data ? (
        <>
          {unitMismatch ? <Alert tone="warning" title={t.unitMismatch} /> : null}
          {calibrationMismatch ? <Alert tone="warning" title={t.calibrationMismatch} /> : null}
          <div className={styles.sides}>
            <Card padding="md">
              <h2 className={styles.sideTitle}>{nameOf(state.left)}</h2>
              <ResultView result={data.left} compact />
            </Card>
            <Card padding="md">
              <h2 className={styles.sideTitle}>{nameOf(state.right)}</h2>
              <ResultView result={data.right} compact />
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function CompareRoute() {
  return (
    <RequireFeature feature="video.analysis.compare">
      <Compare />
    </RequireFeature>
  );
}
