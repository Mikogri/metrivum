import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Analytics — Metrivum");

import type { ProgressData } from "~/modules/training";
import type { Schema } from "@trainflow/api-client-web";
import { parseDate } from "@internationalized/date";
import { ArrowRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Alert, DateField, DialogTrigger, EmptyState, IconButton, Option, Popover, PageHeader, Segment, SegmentedControl, Select, Skeleton, Tab, TabList, TabPanel, Tabs } from "@trainflow/ui-web";
import { RequireFeature, useFeatureAccess } from "~/shared/access";
import { BasicAnalyze } from "./basic-analyze";
import { useAccountContext } from "~/shared/session/AccountScope";
import { useUrlState } from "~/shared/lib/useUrlState";
import { Failure, money, useCoachingQuery } from "~/modules/coaching";
import { AreaChart, compact, Donut, NoData, FlowBars, Funnel, Kpi, RankList, Ring, shortDate, Sparkline, Split, StackedBars, type Tone } from "./charts";
import { useAnalysis, type AnalysisTab } from "./api";
import type { CheckInsData, ClientsData, FinanceData, Overview, TrainingData } from "./types";
import styles from "./analyze.module.css";

function AnalyzeSkeleton() {
  return <div className={`${styles.body} ${styles.grid}`} aria-busy="true" role="status" aria-label="Loading analysis">
    <div className={styles.kpis}>{Array.from({ length: 4 }, (_, i) => <div className={styles.skeletonPanel} key={i}>
      <Skeleton width="55%" /><Skeleton width="70%" height="2rem" /><Skeleton height="3rem" />
    </div>)}</div>
    {Array.from({ length: 3 }, (_, i) => <div className={styles.skeletonPanel} key={i}>
      <Skeleton width="45%" /><Skeleton height="14rem" radius="md" />
    </div>)}
  </div>;
}

export function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function presetRange(preset: string, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (preset === "month") start.setDate(1);
  else if (preset === "previous") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  } else start.setDate(start.getDate() - Number(preset) + 1);
  return { from: dateString(start), to: dateString(end) };
}

export function change(current: number, previous: number) {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;
}

const OFFER_TONES: Tone[] = ["accent", "info", "violet", "warning", "neutral"];

/** A titled card; `wide` spans two grid columns. */
function Panel({ title, description, action, wide, full, children, index = 0 }: { title: string; description?: string; action?: ReactNode; wide?: boolean; full?: boolean; children: ReactNode; index?: number }) {
  return (
    <section className={styles.panel} data-wide={wide || undefined} data-full={full || undefined} style={{ "--i": index } as React.CSSProperties}>
      <header className={styles.panelHead}>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function More({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.more}>
      {children}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function Legend({ items }: { items: Array<{ label: string; tone: Tone; ghost?: boolean }> }) {
  return (
    <ul className={styles.legend}>
      {items.map((item) => (
        <li key={item.label} data-tone={item.tone} data-ghost={item.ghost || undefined}>
          <i />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Workspace() {
  const [state, update] = useUrlState({ preset: "30", from: "", to: "", tab: "overview", groupId: "", offerRevisionId: "", currency: "", grouping: "day", scope: "", memberId: "" });
  const { account } = useAccountContext();
  const context = useCoachingQuery<Schema<"TeamAccess"> | null>("/api/v1/me/team-context");
  const team = context.data;
  const admin = !!team?.isActive && (team.role === "Owner" || team.role === "Admin");
  const scopes = [{ id: "Personal", name: "Personal" }, ...(admin ? [{ id: "Team", name: "Team" }] : []), ...(team?.isActive ? [{ id: "TeamMember", name: admin ? "Team member" : "My Team activity" }] : [])];
  const requestedScope = state.scope || (admin ? "Team" : "Personal");
  const scope = scopes.some(option => option.id === requestedScope) ? requestedScope : "Personal";
  const memberId = scope === "TeamMember" ? (admin ? state.memberId || account.userId : account.userId) : undefined;
  const roster = useCoachingQuery<Schema<"TeamMemberDto">[]>(`/api/v1/teams/${team?.teamId}/members`, undefined, admin && scope === "TeamMember");
  const preset = ["7", "30", "90", "month", "previous", "custom"].includes(state.preset) ? state.preset : "30";
  const defaults = presetRange(preset === "custom" ? "30" : preset);
  const safeDate = (value: string, fallback: string) => { try { return value ? parseDate(value).toString() : fallback; } catch { return fallback; } };
  const range = { from: safeDate(state.from, defaults.from), to: safeDate(state.to, defaults.to) };
  const tab = (["overview", "finance", "clients", "checkins", "training"].includes(state.tab) ? state.tab : "overview") as AnalysisTab;
  const group = state.groupId;
  const offer = state.offerRevisionId;
  const currency = state.currency;
  const grouping = ["day", "week", "month"].includes(state.grouping) ? state.grouping : "day";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const analysis = useAnalysis(tab, { from: range.from, to: range.to, timeZone: zone, grouping, groupId: group || undefined, offerRevisionId: offer || undefined, scope, memberId }, context.isSuccess, scope === "Personal" ? undefined : team?.teamId);
  const { query, metadata } = analysis;
  const data = query.data;
  const finance = data?.section === "overview" || data?.section === "finance" ? data.data.finance : undefined;

  const choosePreset = (value: string) => {
    update({ preset: value, ...(value !== "custom" ? presetRange(value) : range) });
  };

  return (
    <div className={styles.workspace}>
      <PageHeader
        title="Analyze"
        description={scope === "Personal" ? "Your private coaching business, measured from recorded activity." : `${team?.name ?? "Team"} · ${scope === "Team" ? "Organization-wide activity" : "Assigned Team activity"}. Personal client records are excluded.`}
        actions={
          <SegmentedControl aria-label="Period" size="sm" selectedKeys={[preset]} onSelectionChange={(keys) => choosePreset(String([...keys][0] ?? "30"))}>
            <Segment id="7">7 days</Segment>
            <Segment id="30">30 days</Segment>
            <Segment id="90">90 days</Segment>
            <Segment id="month">This month</Segment>
            <Segment id="custom">Custom</Segment>
          </SegmentedControl>
        }
      />

      <div className={styles.filters} role="group" aria-label="Analysis filters">
        <Select aria-label="Analysis scope" size="sm" selectedKey={scope} onSelectionChange={key => update({ scope: String(key), memberId: "", groupId: "", offerRevisionId: "", currency: "" })} className={styles.filter}>
          {scopes.map(option => <Option key={option.id} id={option.id}>{option.name}</Option>)}
        </Select>
        {admin && scope === "TeamMember" && <Select aria-label="Team member" size="sm" selectedKey={memberId} onSelectionChange={key => update({ memberId: String(key), groupId: "", offerRevisionId: "" })} className={styles.filter}>
          {(roster.data ?? []).map(member => <Option key={member.userId} id={member.userId}>{member.displayName || member.username}</Option>)}
        </Select>}
        {preset === "custom" ? (
          <>
            <DateField aria-label="From" size="sm" value={parseDate(range.from)} onChange={(v) => v && update({ from: v.toString() })} />
            <span className={styles.dash}>–</span>
            <DateField aria-label="To" size="sm" value={parseDate(range.to)} onChange={(v) => v && update({ to: v.toString() })} />
          </>
        ) : null}
        <Select aria-label="Trend buckets" size="sm" selectedKey={grouping} onSelectionChange={(k) => update({ grouping: String(k) })} className={styles.filter}>
          <Option id="day">Daily</Option>
          <Option id="week">Weekly</Option>
          <Option id="month">Monthly</Option>
        </Select>
        <Select aria-label="Client group" size="sm" selectedKey={group || "all"} onSelectionChange={(k) => update({ groupId: k === "all" ? "" : String(k) })} className={styles.filter}>
          {[{ id: "all", name: "All clients" }, ...(metadata?.filters.groups ?? [])].map((g) => (
            <Option key={g.id} id={g.id}>
              {g.name}
            </Option>
          ))}
        </Select>
        <Select aria-label="Offer" size="sm" selectedKey={offer || "all"} onSelectionChange={(k) => update({ offerRevisionId: k === "all" ? "" : String(k) })} className={styles.filter}>
          {[{ id: "all", name: "All offers" }, ...(metadata?.filters.offers ?? [])].map((o) => (
            <Option key={o.id} id={o.id}>
              {o.name}
            </Option>
          ))}
        </Select>
        {finance && finance.totals.length > 1 ? (
          <Select aria-label="Currency" size="sm" selectedKey={currency || finance.totals[0]!.currency} onSelectionChange={(k) => update({ currency: String(k) })} className={styles.filter}>
            {finance.totals.map((t) => (
              <Option key={t.currency} id={t.currency}>
                {t.currency}
              </Option>
            ))}
          </Select>
        ) : null}
        {metadata ? (
          <p className={styles.compare}>
            {metadata.period.from} – {metadata.period.to} <span>vs {metadata.comparisonPeriod.from} – {metadata.comparisonPeriod.to}</span>
          </p>
        ) : null}
      </div>

      {context.isError && <Failure error={context.error} retry={() => void context.refetch()} />}
      {context.isSuccess && scope !== requestedScope && <Alert tone="warning" title="Requested scope unavailable">Your current membership allows only the scopes listed above. Showing your Personal activity.</Alert>}
      {scope === "TeamMember" && !admin && <p>Only your own assigned Team activity is available. Other coaches' private cases are excluded.</p>}
      {admin && scope === "TeamMember" && roster.isError && <Failure error={roster.error} retry={() => void roster.refetch()} />}
      <Tabs selectedKey={tab} onSelectionChange={(key) => update({ tab: String(key) })}>
        <TabList aria-label="Analysis sections">
          <Tab id="overview">Overview</Tab>
          <Tab id="finance">Finance</Tab>
          <Tab id="clients">Clients</Tab>
          <Tab id="checkins">Check-ins</Tab>
          <Tab id="training">Training</Tab>
        </TabList>
        {analysis.error ? (
          <Failure error={analysis.error} retry={() => void analysis.retry()} />
        ) : query.isPending ? (
          <AnalyzeSkeleton />
        ) : !data ? (
          <Failure error={query.error} retry={() => void analysis.retry()} />
        ) : (
          <div className={styles.body} aria-busy={query.isFetching}>
            <span className={styles.progress} aria-hidden="true" />
            {data.section === "overview" && <TabPanel id="overview"><OverviewTab data={data.data} currency={currency} /></TabPanel>}
            {data.section === "finance" && <TabPanel id="finance"><FinanceTab data={data.data} currency={currency} /></TabPanel>}
            {data.section === "clients" && <TabPanel id="clients"><ClientsTab data={data.data} /></TabPanel>}
            {data.section === "checkins" && <TabPanel id="checkins"><CheckInsTab data={data.data} /></TabPanel>}
            {data.section === "training" && <TabPanel id="training"><TrainingTab data={data.data} /></TabPanel>}
          </div>
        )}
      </Tabs>
    </div>
  );
}

/* ---------------------------------------------------------------- tabs */

function useFinance(data: FinanceData, currency: string) {
  const selected = data.finance.totals.find((x) => x.currency === (currency || data.finance.totals[0]?.currency));
  const prior = data.previousFinance.totals.find((x) => x.currency === selected?.currency);
  const series = data.finance.series.filter((x) => x.currency === selected?.currency);
  const previous = data.previousFinance.series.filter((x) => x.currency === selected?.currency);
  const fmt = (n: number) => (selected ? money(Math.round(n), selected.currency) : String(n));
  const offers = data.finance.offers.filter((x) => x.currency === selected?.currency).sort((a, b) => b.gross - a.gross);
  return { selected, prior, series, previous, fmt, offers };
}

function OverviewTab({ data, currency }: { data: Overview; currency: string }) {
  const { selected, prior, series, previous, fmt, offers } = useFinance(data, currency);
  const c = data.clients;
  const k = data.checkIns;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label="Revenue" value={selected?.gross ?? 0} format={fmt} previous={prior?.gross ?? 0} spark={series.map((x) => x.gross)} />
        <Kpi index={1} label="Active clients" tone="info" value={c.active} previous={data.previousClients.active} spark={c.series.map((x) => x.active)} />
        <Kpi index={2} label="Check-ins submitted" tone="violet" value={k.submitted} previous={data.previousCheckIns.submitted} spark={k.series.map((x) => x.submitted)} />
        <Kpi index={3} label="Applications accepted" tone="warning" value={data.acquisition.accepted} previous={data.previousAcquisition.accepted} caption={`${data.acquisition.submitted} submitted in this period`} />
      </div>

      <Panel index={1} wide title="Revenue" description="Settled client payments compared with the previous period." action={<Legend items={[{ label: "This period", tone: "accent" }, { label: "Previous", tone: "neutral", ghost: true }]} />}>
        {selected ? (
          <AreaChart
            labels={series.map((x) => x.date)}
            format={fmt}
            series={[
              { label: "Previous", tone: "neutral", ghost: true, values: series.map((_, i) => previous[i]?.gross ?? 0) },
              { label: "This period", tone: "accent", values: series.map((x) => x.gross) },
            ]}
          />
        ) : (
          <NoData height={240} title="No payments in this period" hint="Settled client-service payments appear here." />
        )}
      </Panel>
      <Panel index={2} title="Revenue by offer">
        {offers.length ? <Donut center="gross" format={fmt} items={offers.map((o, i) => ({ label: o.name, value: o.gross, tone: OFFER_TONES[i % OFFER_TONES.length]! }))} /> : <NoData title="No offer revenue" hint="Revenue by offer appears after the first payment." />}
      </Panel>

      <Panel index={3} wide title="Active clients" action={<More to="/app/clients">Clients</More>}>
        <AreaChart height={200} labels={c.series.map((x) => x.date)} series={[{ label: "Active clients", tone: "info", values: c.series.map((x) => x.active) }]} />
      </Panel>
      <Panel index={4} title="Health" description="Shares of clients and requests.">
        <div className={styles.rings}>
          <Ring value={c.retentionPercent} label="Retention" caption="Still active at period end" tone="info" />
          <Ring value={k.submissionRate} label="Check-in rate" caption="Submitted of issued" tone="violet" />
        </div>
      </Panel>

      <Panel index={5} wide title="Check-ins" description="Submitted and overdue requests per bucket." action={<Legend items={[{ label: "Submitted", tone: "violet" }, { label: "Overdue", tone: "warning" }]} />}>
        <StackedBars labels={k.series.map((x) => x.date)} series={[{ label: "Submitted", tone: "violet", values: k.series.map((x) => x.submitted) }, { label: "Overdue", tone: "warning", values: k.series.map((x) => x.overdue) }]} />
      </Panel>
      <Panel index={6} title="Roster flow" description="New and returning clients above the line, departures below.">
        <FlowBars labels={c.series.map((x) => x.date)} gains={c.series.map((x) => x.newClients + x.reactivated)} losses={c.series.map((x) => x.departed)} />
        <dl className={styles.facts}>
          <div>
            <dt>Joined</dt>
            <dd data-tone="up">+{c.newClients + c.reactivated}</dd>
          </div>
          <div>
            <dt>Left</dt>
            <dd data-tone="down">−{c.departed}</dd>
          </div>
          <div>
            <dt>Net</dt>
            <dd>{c.netGrowth > 0 ? `+${c.netGrowth}` : c.netGrowth}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function FinanceTab({ data, currency }: { data: FinanceData; currency: string }) {
  const { selected, prior, series, previous, fmt, offers } = useFinance(data, currency);
  if (!selected)
    return <EmptyState title="No financial activity" description="Settled client-service payments, pending dues and recurring services appear here. Metrivum plan payments are excluded." />;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label="Settled gross" value={selected.gross} format={fmt} previous={prior?.gross ?? 0} spark={series.map((x) => x.gross)} />
        <Kpi index={1} label="Coach net" tone="info" value={selected.net} format={fmt} previous={prior?.net ?? 0} spark={series.map((x) => x.net)} />
        <Kpi index={2} label="MRR" tone="violet" value={selected.mrr} format={fmt} caption="Contracted recurring run rate" />
        <Kpi index={3} label="Unpaid dues" tone="warning" value={selected.pending} format={fmt} caption="Due within this period" />
      </div>
      <Panel index={1} wide title="Gross and net" description="What clients paid and what you kept after platform fees." action={<Legend items={[{ label: "Gross", tone: "accent" }, { label: "Net", tone: "info" }, { label: "Previous gross", tone: "neutral", ghost: true }]} />}>
        <AreaChart
          height={260}
          labels={series.map((x) => x.date)}
          format={fmt}
          series={[
            { label: "Previous gross", tone: "neutral", ghost: true, values: series.map((_, i) => previous[i]?.gross ?? 0) },
            { label: "Gross", tone: "accent", values: series.map((x) => x.gross) },
            { label: "Net", tone: "info", values: series.map((x) => x.net) },
          ]}
        />
      </Panel>
      <Panel index={2} title="Per payment">
        <div className={styles.stats}>
          <Stat label="Payments" value={String(selected.payments)} />
          <Stat label="Average payment" value={fmt(selected.averagePayment)} />
          <Stat label="Per paying client" value={fmt(selected.revenuePerPayingClient)} />
          <Stat label="Paying clients" value={String(selected.payingClients)} />
          <Stat label="Platform fee" value={fmt(selected.fee)} />
          <Stat label="Renewals settled" value={String(selected.renewals)} />
        </div>
      </Panel>
      <Panel index={3} title="Revenue by offer" action={<More to="/app/offers">Offers</More>}>
        {offers.length ? <Donut center="gross" format={fmt} items={offers.map((o, i) => ({ label: o.name, value: o.gross, tone: OFFER_TONES[i % OFFER_TONES.length]! }))} /> : <NoData title="No offer revenue" hint="Revenue by offer appears after the first payment." />}
      </Panel>
      <Panel index={4} title="Net by offer" description="Ranked by what you kept.">
        <RankList format={fmt} items={offers.map((o) => ({ key: o.offerRevisionId, label: o.name, value: o.net, note: `${o.payments} payments · ${o.clients} clients` }))} />
      </Panel>
      <Panel index={5} title="How it was paid" description="Simulated payments move no real money.">
        <Split a={{ label: "Simulated", value: Math.round(selected.simulatedGross), tone: "violet" }} b={{ label: "Recorded externally", value: Math.round(selected.externalGross), tone: "info" }} />
        <p className={styles.muted}>{selected.recurringSubscriptions} recurring services at period end. MRR counts weeks × 52/12, months and years / 12.</p>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ClientsTab({ data }: { data: ClientsData }) {
  const c = data.clients;
  const a = data.acquisition;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label="Active clients" tone="info" value={c.active} previous={data.previousClients.active} spark={c.series.map((x) => x.active)} />
        <Kpi index={1} label="First-time clients" value={c.newClients} previous={data.previousClients.newClients} spark={c.series.map((x) => x.newClients)} />
        <Kpi index={2} label="Reactivated" tone="violet" value={c.reactivated} caption="Returned from suspended or completed" />
        <Kpi index={3} label="Departed" tone="danger" value={c.departed} previous={data.previousClients.departed} invert caption="Active clients who left" />
      </div>
      <Panel index={1} wide title="Active clients over time" action={<More to="/app/clients">Clients</More>}>
        <AreaChart labels={c.series.map((x) => x.date)} series={[{ label: "Active clients", tone: "info", values: c.series.map((x) => x.active) }]} />
      </Panel>
      <Panel index={2} title="Status">
        <div className={styles.rings}>
          <Ring value={c.retentionPercent} label="Retention" caption="Starting clients still active" tone="info" />
          <Ring value={a.conversionPercent} label="Conversion" caption="Accepted of submitted" tone="warning" />
        </div>
        <Split a={{ label: "Suspended", value: c.suspended, tone: "warning" }} b={{ label: "Completed", value: c.completed, tone: "neutral" }} />
      </Panel>
      <Panel index={3} title="Applications" description="Applications submitted in this period, by their latest decision." action={<More to="/app/leads">Review</More>}>
        <Funnel
          steps={[
            { label: "Submitted", value: a.submitted, tone: "info" },
            { label: "Accepted", value: a.accepted, tone: "accent" },
          ]}
        />
        <p className={styles.muted}>{a.rejected} rejected, the rest still pending.</p>
      </Panel>
      <Panel index={4} title="Where applications come from">
        <RankList
          tone="info"
          items={a.sources.map((s) => ({ key: s.source, label: s.source, value: s.submitted, note: `${s.accepted} accepted · ${s.pending} pending${s.conversionPercent === null ? "" : ` · ${s.conversionPercent}%`}` }))}
        />
      </Panel>
      <Panel index={5} title="Invitations">
        <Funnel
          steps={[
            { label: "Sent", value: a.invitationsSent, tone: "violet" },
            { label: "Accepted", value: a.invitationsAccepted, tone: "accent" },
          ]}
        />
        <p className={styles.muted}>{a.invitationsDeclined} declined.</p>
      </Panel>
      <Panel index={6} wide title="Roster flow" description="New and returning clients above the line, departures below.">
        <FlowBars labels={c.series.map((x) => x.date)} gains={c.series.map((x) => x.newClients + x.reactivated)} losses={c.series.map((x) => x.departed)} />
      </Panel>
      <Panel index={7} title="Groups" description="Current members. Groups overlap, so they don't add up." action={<More to="/app/groups">Groups</More>}>
        {c.groups.length ? <RankList tone="violet" items={c.groups.map((g) => ({ key: g.id, label: g.name, value: g.clients }))} /> : <NoData height={120} title="No client groups yet" hint="Groups you create appear here with their members." />}
      </Panel>
    </div>
  );
}

/** Lifts with recorded loads: the best load per training date, oldest to newest. */
function lifts(progress: ProgressData) {
  const byLift = new Map<string, { name: string; meaning: string; points: Array<{ date: string; load: number }>; sets: number }>();
  for (const p of progress.performance) {
    const key = `${p.exerciseId}:${p.loadMeaning}`;
    const lift = byLift.get(key) ?? { name: p.name, meaning: p.loadMeaning, points: [], sets: 0 };
    lift.sets += p.sets;
    if (p.bestLoadKg != null) lift.points.push({ date: p.performedDate, load: p.bestLoadKg });
    byLift.set(key, lift);
  }
  return [...byLift.entries()]
    .map(([key, lift]) => ({ key, ...lift, points: lift.points.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.sets - a.sets);
}

function TrainingTab({ data }: { data: TrainingData }) {
  const t = data.training.progress;
  if (!t) return <NoData height={260} title="No recorded training data" hint={data.training.reason} />;
  const recorded = lifts(t);
  const onTime = Math.max(0, t.completed - t.loggedLate);
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label="Workouts completed" tone="accent" value={t.completed} caption={`of ${t.due} due in this period`} />
        <Kpi index={1} label="Not logged by deadline" tone="danger" value={t.missed} caption="Due workouts with no log" />
        <Kpi index={2} label="Skipped" tone="warning" value={t.skipped} caption="Marked as skipped by the client" />
        <Kpi index={3} label="Active assignments" tone="info" value={t.activeAssignments} caption={`${t.inProgress} workouts in progress`} />
      </div>

      <Panel index={1} title="Completion" description="Due workouts that were logged as completed.">
        <div className={styles.rings}>
          <Ring value={t.completionPercentage} label="Completion" caption={`${t.completed} / ${t.due} due`} tone="accent" />
        </div>
        <Split a={{ label: "On time", value: onTime, tone: "accent" }} b={{ label: "Logged late", value: t.loggedLate, tone: "warning" }} />
      </Panel>

      <Panel index={2} title="Workout outcomes" description="Every workout due in this period, by what happened to it.">
        {t.due + t.inProgress > 0 ? (
          <Donut
            center="workouts"
            format={(n) => String(Math.round(n))}
            items={[
              { label: "Completed", value: t.completed, tone: "accent" },
              { label: "In progress", value: t.inProgress, tone: "info" },
              { label: "Skipped", value: t.skipped, tone: "warning" },
              { label: "Not logged", value: t.missed, tone: "danger" },
            ]}
          />
        ) : (
          <NoData height={160} title="Nothing was due" hint="Assign a program to see outcomes here." />
        )}
      </Panel>

      <Panel index={3} title="Work done" description="From logged sets only. Prescribed weights never count as training.">
        <div className={styles.stats}>
          <Stat label="Sets" value={t.actualSets.toLocaleString()} />
          <Stat label="Reps" value={t.actualReps.toLocaleString()} />
          <Stat label="Volume" value={t.volumeKg == null ? "—" : `${compact(t.volumeKg)} kg`} />
        </div>
      </Panel>

      <Panel index={4} wide title="Lifts" description="Best recorded load per training date. Each lift and load meaning is kept separate." action={<More to="/app/programs">Programs</More>}>
        {recorded.length ? (
          <ul className={styles.lifts}>
            {recorded.slice(0, 6).map((lift) => {
              const first = lift.points[0]?.load;
              const last = lift.points.at(-1)?.load;
              const delta = first != null && last != null ? last - first : null;
              return (
                <li key={lift.key}>
                  <div className={styles.liftName}>
                    <strong>{lift.name}</strong>
                    <span>
                      {lift.meaning} · {lift.sets} sets
                    </span>
                  </div>
                  {lift.points.length > 1 ? <Sparkline tone="accent" values={lift.points.map((p) => p.load)} /> : <span className={styles.muted}>One session</span>}
                  <div className={styles.liftValue}>
                    <strong>{last == null ? "—" : `${last} kg`}</strong>
                    {delta ? <span data-tone={delta > 0 ? "up" : "down"}>{`${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10} kg`}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <NoData height={140} title="No recorded lifts yet" hint="Charts appear after clients log actual sets." />
        )}
      </Panel>

      <Panel index={5} title="Programs" description="Completed workouts per program.">
        {t.programs.length ? <RankList tone="accent" items={t.programs.map((p) => ({ key: p.programId, label: p.programName, value: p.completed }))} /> : <NoData height={120} title="No completed workouts" />}
      </Panel>

      <Panel index={6} full title="Clients" description="Due and completed workouts per client in this period." action={<More to="/app/clients">Clients</More>}>
        {t.clients.length ? (
          <RankList
            tone="info"
            items={[...t.clients]
              .sort((a, b) => b.missed - a.missed || a.completed / Math.max(1, a.due) - b.completed / Math.max(1, b.due))
              .map((c, i) => ({
                key: c.relationshipId,
                label: <Link to={`/app/clients/${c.relationshipId}?tab=progress`}>{`Client ${i + 1}`}</Link>,
                value: c.completed,
                note: `${c.completed} / ${c.due} done · ${c.missed} not logged${c.latestCompletedAt ? ` · last ${shortDate(c.latestCompletedAt.slice(0, 10))}` : ""}`,
              }))}
          />
        ) : (
          <NoData height={120} title="No client workouts in this period" />
        )}
      </Panel>

      {/* How the numbers are counted: behind a small info button instead of a paragraph under the page. */}
      <div className={styles.definition}>
        <DialogTrigger>
          <IconButton size="sm" variant="ghost" icon={<Info />} label="How these numbers are calculated" />
          <Popover placement="top start" width="lg">
            <p className={styles.definitionText}>{t.metricDefinition}</p>
          </Popover>
        </DialogTrigger>
        <span className={styles.definitionLabel}>How these numbers are calculated</span>
      </div>
    </div>
  );
}

function CheckInsTab({ data }: { data: CheckInsData }) {
  const k = data.checkIns;
  const p = data.previousCheckIns;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label="Issued" tone="info" value={k.issued} previous={p.issued} spark={k.series.map((x) => x.issued)} />
        <Kpi index={1} label="Submitted" tone="violet" value={k.submitted} previous={p.submitted} spark={k.series.map((x) => x.submitted)} />
        <Kpi index={2} label="Overdue" tone="warning" value={k.overdue} previous={p.overdue} invert spark={k.series.map((x) => x.overdue)} />
        <Kpi index={3} label="Awaiting your review" tone="danger" value={k.pendingReview} caption="Submitted, not reviewed yet" />
      </div>
      <Panel index={1} wide title="Requests per bucket" action={<Legend items={[{ label: "Submitted", tone: "violet" }, { label: "Overdue", tone: "warning" }]} />}>
        <StackedBars height={240} labels={k.series.map((x) => x.date)} series={[{ label: "Submitted", tone: "violet", values: k.series.map((x) => x.submitted) }, { label: "Overdue", tone: "warning", values: k.series.map((x) => x.overdue) }]} />
      </Panel>
      <Panel index={2} title="Response" action={<More to="/app/check-ins">Check-ins</More>}>
        <div className={styles.rings}>
          <Ring value={k.submissionRate} label="Submission rate" tone="violet" />
          <Ring value={k.averageReviewHours === null ? null : Math.max(0, 100 - (k.averageReviewHours / 48) * 100)} label={k.averageReviewHours === null ? "Review time" : `${k.averageReviewHours.toFixed(1)} h to review`} caption="Faster fills the ring (48 h = empty)" tone="accent" />
        </div>
      </Panel>
      <Panel index={3} wide title="Issued over time">
        <AreaChart height={200} labels={k.series.map((x) => x.date)} format={(n) => String(Math.round(n))} series={[{ label: "Issued", tone: "info", values: k.series.map((x) => x.issued) }]} />
      </Panel>
      <Panel index={4} title="Messages" description="Counts only; message contents are never analyzed." action={<More to="/app/messages">Messages</More>}>
        <Split a={{ label: "Sent", value: data.messaging.sent, tone: "accent" }} b={{ label: "Received", value: data.messaging.received, tone: "info" }} />
        <p className={styles.muted}>{data.messaging.conversations} conversations with activity.</p>
      </Panel>
    </div>
  );
}

export default function AnalyzePage() {
  const advanced = useFeatureAccess("analytics.advanced");
  return (
    <RequireFeature feature="analytics.view">
      {advanced.pending ? <AnalyzeSkeleton /> : advanced.allowed ? <Workspace /> : <BasicAnalyze />}
    </RequireFeature>
  );
}
