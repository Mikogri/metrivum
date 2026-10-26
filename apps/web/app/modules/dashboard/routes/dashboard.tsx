import { Activity, ArrowRight, Dumbbell, FilePlus2, FileText, Layers, LayoutTemplate, Sigma, Upload, Video } from "lucide-react";
import type { ReactNode } from "react";
import { Link as RouterLink, useSearchParams } from "react-router";
import { Card, EmptyState, LoadingState, PageHeader, Skeleton, Tab, TabList, TabPanel, Tabs } from "@trainflow/ui-web";
import { useProfile } from "~/modules/accounts";
import { useExerciseList } from "~/modules/exercises";
import { usePlanList } from "~/modules/training";
import { StatusBadge, useAnalysisList } from "~/modules/video-analysis";
import { useAccessSnapshot, useFeatureAccess } from "~/shared/access";
import { formatNumber, formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText } from "~/shared/lib/errorText";
import styles from "./dashboard.module.css";
import { privateMeta } from "~/shared/i18n/site";
import { ProgramsIcon } from "~/layouts/components/navIcons";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { CoachDashboard, UsagePanel } from "./CoachPulse";
import { Discovery } from "./Discovery";

export const meta = () => privateMeta("Dashboard — Metrivum");

function Panel({ title, href, viewAll, children }: { title: string; href: string; viewAll: string; children: ReactNode }) {
  return (
    <Card as="section" padding="none" className={styles.panel}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        <RouterLink to={href} className={styles.viewAll}>
          {viewAll}
          <ArrowRight aria-hidden="true" />
        </RouterLink>
      </header>
      <div className={styles.panelBody}>{children}</div>
    </Card>
  );
}

function RecentPlans({ kind }: { kind: "Program" | "Template" }) {
  const m = useT();
  const locale = useLocale();
  const access = useFeatureAccess("training.programs.read");
  const list = usePlanList({ kind, sort: "updated", page: 1, pageSize: 5 }, access.allowed);
  if (!access.allowed && !access.pending) return <p className={styles.muted}>{m.access.reasons[access.state]}</p>;
  if (list.isPending) return <ListSkeleton />;
  if (list.isError) return <p className={styles.muted}>{errorText(m, list.error)}</p>;
  if (!list.data.items.length)
    return <EmptyState size="sm" icon={kind === "Program" ? <FileText strokeWidth={1.5} /> : <Layers strokeWidth={1.5} />} title={kind === "Program" ? m.dashboard.noPrograms : m.dashboard.noTemplates} />;
  return (
    <ul className={styles.rows}>
      {list.data.items.map((plan, i) => (
        <li key={plan.id} style={{ "--i": i } as React.CSSProperties}>
          <RouterLink to={`/app/programs/${plan.id}`} className={styles.row}>
            {kind === "Program" ? <ProgramsIcon aria-hidden="true" /> : <LayoutTemplate aria-hidden="true" />}
            <span className={styles.rowName}>{plan.name}</span>
            <span className={styles.rowMeta}>{formatRelative(locale, plan.updatedAt)}</span>
          </RouterLink>
        </li>
      ))}
    </ul>
  );
}

function RecentAnalyses() {
  const m = useT();
  const locale = useLocale();
  const list = useAnalysisList({ sort: "newest", page: 1, pageSize: 5 });
  if (list.isPending) return <ListSkeleton />;
  if (list.isError) return <p className={styles.muted}>{errorText(m, list.error)}</p>;
  if (!list.data.length) return <EmptyState size="sm" icon={<Video strokeWidth={1.5} />} title={m.dashboard.noAnalyses} />;
  return (
    <ul className={styles.rows}>
      {list.data.map((analysis, i) => (
        <li key={analysis.id} style={{ "--i": i } as React.CSSProperties}>
          <RouterLink to={`/app/video-analyses/${analysis.id}`} className={styles.row}>
            <Video aria-hidden="true" />
            <span className={styles.rowName}>{analysis.name}</span>
            <StatusBadge status={analysis.status} size="sm" />
            <span className={styles.rowMeta}>{formatRelative(locale, analysis.createdAt)}</span>
          </RouterLink>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return <LoadingState size="sm" />;
}

type Tone = "green" | "violet" | "blue" | "orange" | "rose";

function Stat({ tone, icon: Icon, label, value, failed, caption, href, viewAll, index }: {
  tone: Tone;
  icon: typeof Video;
  label: string;
  value: number | undefined;
  failed: boolean;
  caption: string;
  href: string;
  viewAll: string;
  index: number;
}) {
  const locale = useLocale();
  return (
    <li className={styles.stat} style={{ "--i": index } as React.CSSProperties}>
      <div className={styles.statHead}>
        <span className={styles.statChip} data-tone={tone} aria-hidden="true">
          <Icon strokeWidth={1.75} />
        </span>
        <span className={styles.statLabel}>{label}</span>
      </div>
      <p className={styles.statValue}>
        {value !== undefined ? <span>{formatNumber(locale, value)}</span> : failed ? <span>—</span> : <Skeleton width="2.5rem" height="1.75rem" />}
        <span className={styles.statCaption}>{caption}</span>
      </p>
      <RouterLink to={href} className={styles.statLink}>
        {viewAll}
        <ArrowRight aria-hidden="true" />
      </RouterLink>
    </li>
  );
}

/** Counts come only from the API: list totals and the usage figures in the access snapshot. */
function Stats() {
  const m = useT();
  const t = m.dashboard;
  const read = useFeatureAccess("training.programs.read");
  const browse = useFeatureAccess("exercises.browse");
  const programs = usePlanList({ kind: "Program", sort: "updated", page: 1, pageSize: 1 }, read.allowed);
  const templates = usePlanList({ kind: "Template", sort: "updated", page: 1, pageSize: 1 }, read.allowed);
  const exercises = useExerciseList({ page: 1, pageSize: 1 }, browse.allowed);
  const access = useAccessSnapshot();
  const used = (key: string) => access.data?.limits.find((limit) => limit.key === key)?.used;
  const total = (value: number | string | undefined) => (value === undefined ? undefined : Number(value));

  const items = [
    { tone: "green", icon: FileText, ...t.stat.programs, value: total(programs.data?.total), failed: programs.isError, href: "/app/programs", show: read.allowed },
    { tone: "violet", icon: Layers, ...t.stat.templates, value: total(templates.data?.total), failed: templates.isError, href: "/app/templates", show: read.allowed },
    { tone: "blue", icon: Dumbbell, ...t.stat.exercises, value: total(exercises.data?.total), failed: exercises.isError, href: "/app/exercises", show: browse.allowed },
    { tone: "orange", icon: Sigma, ...t.stat.formulas, value: total(used("training.formulas")), failed: access.isError, href: "/app/formulas", show: read.allowed },
    { tone: "rose", icon: Activity, ...t.stat.running, value: total(used("analysis.concurrent")), failed: access.isError, href: "/app/video-analyses", show: true },
  ] as const;

  return (
    <section aria-label={t.stats}>
      <ul className={styles.stats}>
        {items
          .filter((item) => item.show)
          .map((item, index) => (
            <Stat key={item.href} {...item} viewAll={t.viewAll} index={index} />
          ))}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  const m = useT();
  const t = m.dashboard;
  const profile = useProfile();
  const create = useFeatureAccess("training.programs.create");
  const importCsv = useFeatureAccess("training.import.csv");
  const analysis = useFeatureAccess("video.library.manage");
  const browse = useFeatureAccess("exercises.browse");
  const { mode } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "discovery" ? "discovery" : "overview";

  const shortcuts = [
    { tone: "green", href: "/app/programs?create=1", icon: FilePlus2, title: t.newProgram, body: t.newProgramBody, access: create },
    { tone: "blue", href: "/app/programs?import=1", icon: Upload, title: t.importCsv, body: t.importCsvBody, access: importCsv },
    { tone: "rose", href: "/app/video-analyses/new", icon: Video, title: t.newAnalysis, body: t.newAnalysisBody, access: analysis },
    { tone: "violet", href: "/app/exercises", icon: Dumbbell, title: t.browseExercises, body: t.browseExercisesBody, access: browse },
  ].filter((item) => item.access.allowed);

  const recent = (
    <>
      <Panel title={t.recentPrograms} href="/app/programs" viewAll={t.viewAll}>
        <RecentPlans kind="Program" />
      </Panel>
      <Panel title={t.recentAnalyses} href="/app/video-analyses" viewAll={t.viewAll}>
        <RecentAnalyses />
      </Panel>
    </>
  );

  if (mode === "coach") {
    return (
      <>
        <PageHeader title={t.greeting(profile.displayName || profile.username || "")} description={t.coach.range} />
        <Tabs selectedKey={tab} onSelectionChange={(key) => setParams(key === "discovery" ? { tab: "discovery" } : {}, { replace: true })}>
          <TabList aria-label={t.tabs.label}>
            <Tab id="overview">{t.tabs.overview}</Tab>
            <Tab id="discovery">{t.tabs.discovery}</Tab>
          </TabList>
          <TabPanel id="overview">
            <CoachDashboard recent={recent} />
          </TabPanel>
          <TabPanel id="discovery">
            <Discovery />
          </TabPanel>
        </Tabs>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.greeting(profile.displayName || profile.username || "")} />
      <Stats />
      {shortcuts.length ? (
        <section aria-label={t.shortcuts} className={styles.shortcuts}>
          {shortcuts.map((item, i) => {
            const Icon = item.icon;
            return (
              <RouterLink key={item.href} to={item.href} className={styles.shortcut} style={{ "--i": i } as React.CSSProperties}>
                <span className={styles.shortcutIcon} data-tone={item.tone} aria-hidden="true">
                  <Icon strokeWidth={1.75} />
                </span>
                <span className={styles.shortcutText}>
                  <span className={styles.shortcutTitle}>{item.title}</span>
                  <span className={styles.shortcutBody}>{item.body}</span>
                </span>
              </RouterLink>
            );
          })}
        </section>
      ) : (
        <EmptyState size="sm" title={m.access.reasons.not_granted} />
      )}
      <div className={styles.grid}>
        <Panel title={t.recentPrograms} href="/app/programs" viewAll={t.viewAll}>
          <RecentPlans kind="Program" />
        </Panel>
        <Panel title={t.recentTemplates} href="/app/templates" viewAll={t.viewAll}>
          <RecentPlans kind="Template" />
        </Panel>
        <Panel title={t.recentAnalyses} href="/app/video-analyses" viewAll={t.viewAll}>
          <RecentAnalyses />
        </Panel>
      </div>
      <UsagePanel />
    </>
  );
}
