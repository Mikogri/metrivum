import { useState } from "react";
import { GitCompare, Plus } from "lucide-react";
import { Breadcrumbs, Button, EmptyState, PageHeader } from "@trainflow/ui-web";
import { RequireFeature } from "~/shared/access";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { useUrlState } from "~/shared/lib/useUrlState";
import { CompareDialog, CompareView, sourceKey, useCompareResults, type CompareSource } from "../components/Compare";
import styles from "./compare.module.css";

export const meta = () => privateMeta("Compare analyses — TrainFlow");

/** Sources live in the URL ("own" ids and "shared" tokens, with names) so a comparison can be reopened or shared. */
function parse(value: string): CompareSource[] {
  if (!value) return [];
  try { return JSON.parse(decodeURIComponent(value)) as CompareSource[]; } catch { return []; }
}

function Compare() {
  const m = useT();
  const t = m.video.compare;
  const [state, update] = useUrlState({ with: "" });
  const sources = parse(state.with);
  const [open, setOpen] = useState(false);
  const results = useCompareResults(sources);
  const save = (next: CompareSource[]) => update({ with: next.length ? encodeURIComponent(JSON.stringify(next)) : null });

  return (
    <>
      <PageHeader
        context={<Breadcrumbs items={[{ id: "list", label: m.video.list.title, href: "/app/video-analyses" }, { id: "compare", label: t.title }]} />}
        title={t.title}
        description="Choose two or more analyses. Their videos sit side by side and the repetitions you tick are drawn over each other."
        actions={<Button variant={sources.length ? "secondary" : "primary"} iconStart={<Plus />} onPress={() => setOpen(true)}>{sources.length ? "Change analyses" : "Choose analyses"}</Button>}
      />
      {open ? <CompareDialog exclude={[]} initial={sources} onClose={() => setOpen(false)} onConfirm={save} /> : null}
      <div className={styles.page}>
        {sources.length ? <CompareView sources={sources} results={results.map((query) => query.data)}
          onRemove={(source) => save(sources.filter((item) => sourceKey(item) !== sourceKey(source)))} />
          : <EmptyState icon={<GitCompare />} title="Nothing to compare yet" description="Choose analyses: yours or ones shared with you." actions={<Button variant="primary" onPress={() => setOpen(true)}>Choose analyses</Button>} />}
      </div>
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
