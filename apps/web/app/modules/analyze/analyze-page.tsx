import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Analytics — Metrivum");

import type { ProgressData } from "~/modules/training";
import type { Schema } from "@metrivum/api-client-web";
import { parseDate } from "@internationalized/date";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Alert, DateField, EmptyState, InfoTip, Option, PageHeader, Segment, SegmentedControl, Select, Skeleton, Tab, TabList, TabPanel, Tabs } from "@metrivum/ui-web";
import { RequireFeature, useFeatureAccess } from "~/shared/access";
import { BasicAnalyze } from "./basic-analyze";
import { useAccountContext } from "~/shared/session/AccountScope";
import { useUrlState } from "~/shared/lib/useUrlState";
import { Failure, money, useCoachingQuery } from "~/modules/coaching";
import { AnimatedNumber, AreaChart, compact, Donut, NoData, FlowBars, Funnel, Kpi, RankList, Ring, shortDate, Sparkline, Split, StackedBars, type Tone } from "./charts";
import { useAnalysis, type AnalysisTab } from "./api";
import type { CheckInsData, ClientsData, FinanceData, Overview, TrainingData } from "./types";
import styles from "./analyze.module.css";

function AnalyzeSkeleton() {
  const uiCopy = useUiCopy();

  return <div className={`${styles.body} ${styles.grid}`} aria-busy="true" role="status" aria-label={uiCopy["ui"]["Loading analysis"]}>
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
  const uiCopy = useUiCopy();

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
        title={uiCopy["dashboard"]["coach"]["openAnalyze"]}
        description={scope === "Personal" ? uiCopy["ui"]["Your private coaching business, measured from recorded activity."] : `${team?.name ?? "Team"} · ${scope === "Team" ? "Organization-wide activity" : "Assigned Team activity"}. Personal client records are excluded.`}
        actions={
          <SegmentedControl aria-label={uiCopy["ui"]["Period"]} size="sm" selectedKeys={[preset]} onSelectionChange={(keys) => choosePreset(String([...keys][0] ?? "30"))}>
            <Segment id="7">{uiCopy["ui"]["7 days"]}</Segment>
            <Segment id="30">{uiCopy["ui"]["30 days"]}</Segment>
            <Segment id="90">{uiCopy["ui"]["90 days"]}</Segment>
            <Segment id="month">{uiCopy["ui"]["This month"]}</Segment>
            <Segment id="custom">{uiCopy["ui"]["Custom"]}</Segment>
          </SegmentedControl>
        }
      />

      <div className={styles.filters} role="group" aria-label={uiCopy["ui"]["Analysis filters"]}>
        <Select aria-label={uiCopy["ui"]["Analysis scope"]} size="sm" selectedKey={scope} onSelectionChange={key => update({ scope: String(key), memberId: "", groupId: "", offerRevisionId: "", currency: "" })} className={styles.filter}>
          {scopes.map(option => <Option key={option.id} id={option.id}>{option.name}</Option>)}
        </Select>
        {admin && scope === "TeamMember" && <Select aria-label={uiCopy["ui"]["Team member"]} size="sm" selectedKey={memberId} onSelectionChange={key => update({ memberId: String(key), groupId: "", offerRevisionId: "" })} className={styles.filter}>
          {(roster.data ?? []).map(member => <Option key={member.userId} id={member.userId}>{member.displayName || member.username}</Option>)}
        </Select>}
        {preset === "custom" ? (
          <>
            <DateField aria-label={uiCopy["editor"]["panel"]["loadMin"]} size="sm" value={parseDate(range.from)} onChange={(v) => v && update({ from: v.toString() })} />
            <span className={styles.dash}>–</span>
            <DateField aria-label={uiCopy["editor"]["panel"]["loadMax"]} size="sm" value={parseDate(range.to)} onChange={(v) => v && update({ to: v.toString() })} />
          </>
        ) : null}
        <Select aria-label={uiCopy["ui"]["Trend buckets"]} size="sm" selectedKey={grouping} onSelectionChange={(k) => update({ grouping: String(k) })} className={styles.filter}>
          <Option id="day">{uiCopy["ui"]["Daily"]}</Option>
          <Option id="week">{uiCopy["ui"]["Weekly"]}</Option>
          <Option id="month">{uiCopy["ui"]["Monthly"]}</Option>
        </Select>
        <Select aria-label={uiCopy["ui"]["Client group"]} size="sm" selectedKey={group || "all"} onSelectionChange={(k) => update({ groupId: k === "all" ? "" : String(k) })} className={styles.filter}>
          {[{ id: "all", name: "All clients" }, ...(metadata?.filters.groups ?? [])].map((g) => (
            <Option key={g.id} id={g.id}>
              {g.name}
            </Option>
          ))}
        </Select>
        <Select aria-label={uiCopy["ui"]["Offer"]} size="sm" selectedKey={offer || "all"} onSelectionChange={(k) => update({ offerRevisionId: k === "all" ? "" : String(k) })} className={styles.filter}>
          {[{ id: "all", name: "All offers" }, ...(metadata?.filters.offers ?? [])].map((o) => (
            <Option key={o.id} id={o.id}>
              {o.name}
            </Option>
          ))}
        </Select>
        {finance && finance.totals.length > 1 ? (
          <Select aria-label={uiCopy["ui"]["Currency"]} size="sm" selectedKey={currency || finance.totals[0]!.currency} onSelectionChange={(k) => update({ currency: String(k) })} className={styles.filter}>
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
      {context.isSuccess && scope !== requestedScope && <Alert tone="warning" title={uiCopy["ui"]["Requested scope unavailable"]}>{uiCopy["ui"]["Your current membership allows only the scopes listed above. Showing your Personal activity."]}</Alert>}
      {scope === "TeamMember" && !admin && <p>{uiCopy["ui"]["Only your own assigned Team activity is available. Other coaches' private cases are excluded."]}</p>}
      {admin && scope === "TeamMember" && roster.isError && <Failure error={roster.error} retry={() => void roster.refetch()} />}
      <Tabs selectedKey={tab} onSelectionChange={(key) => update({ tab: String(key) })}>
        <TabList aria-label={uiCopy["ui"]["Analysis sections"]}>
          <Tab id="overview">{uiCopy["exercises"]["detail"]["overview"]}</Tab>
          <Tab id="finance">{uiCopy["dashboard"]["coach"]["finance"]}</Tab>
          <Tab id="clients">{uiCopy["dashboard"]["coach"]["clients"]}</Tab>
          <Tab id="checkins">{uiCopy["ui"]["Check-ins"]}</Tab>
          <Tab id="training">{uiCopy["profile"]["completeItems"]["training"]}</Tab>
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
  const uiCopy = useUiCopy();

  const { selected, prior, series, previous, fmt, offers } = useFinance(data, currency);
  const c = data.clients;
  const k = data.checkIns;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label={uiCopy["ui"]["Revenue"]} value={selected?.gross ?? 0} format={fmt} previous={prior?.gross ?? 0} spark={series.map((x) => x.gross)} />
        <Kpi index={1} label={uiCopy["dashboard"]["coach"]["activeClients"]} tone="info" value={c.active} previous={data.previousClients.active} spark={c.series.map((x) => x.active)} />
        <Kpi index={2} label={uiCopy["dashboard"]["coach"]["checkInsSubmitted"]} tone="violet" value={k.submitted} previous={data.previousCheckIns.submitted} spark={k.series.map((x) => x.submitted)} />
        <Kpi index={3} label={uiCopy["ui"]["Applications accepted"]} tone="warning" value={data.acquisition.accepted} previous={data.previousAcquisition.accepted} caption={`${data.acquisition.submitted} submitted in this period`} />
      </div>

      <Panel index={1} wide title={uiCopy["ui"]["Revenue"]} description={uiCopy["ui"]["Settled client payments compared with the previous period."]} action={<Legend items={[{ label: uiCopy["ui"]["This period"], tone: "accent" }, { label: uiCopy["common"]["previous"], tone: "neutral", ghost: true }]} />}>
        {selected ? (
          <AreaChart
            labels={series.map((x) => x.date)}
            format={fmt}
            series={[
              { label: uiCopy["common"]["previous"], tone: "neutral", ghost: true, values: series.map((_, i) => previous[i]?.gross ?? 0) },
              { label: uiCopy["ui"]["This period"], tone: "accent", values: series.map((x) => x.gross) },
            ]}
          />
        ) : (
          <NoData height={240} title={uiCopy["ui"]["No payments in this period"]} hint={uiCopy["ui"]["Settled client-service payments appear here."]} />
        )}
      </Panel>
      <Panel index={2} title={uiCopy["ui"]["Revenue by offer"]}>
        {offers.length ? <Donut center="gross" format={fmt} items={offers.map((o, i) => ({ label: o.name, value: o.gross, tone: OFFER_TONES[i % OFFER_TONES.length]! }))} /> : <NoData title={uiCopy["ui"]["No offer revenue"]} hint={uiCopy["ui"]["Revenue by offer appears after the first payment."]} />}
      </Panel>

      <Panel index={3} wide title={uiCopy["dashboard"]["coach"]["activeClients"]} action={<More to="/app/clients">{uiCopy["dashboard"]["coach"]["clients"]}</More>}>
        <AreaChart height={200} labels={c.series.map((x) => x.date)} series={[{ label: uiCopy["dashboard"]["coach"]["activeClients"], tone: "info", values: c.series.map((x) => x.active) }]} />
      </Panel>
      <Panel index={4} title={uiCopy["ui"]["Health"]} description={uiCopy["ui"]["Shares of clients and requests."]}>
        <div className={styles.rings}>
          <Ring value={c.retentionPercent} label={uiCopy["dashboard"]["coach"]["retention"]} caption="Still active at period end" tone="info" />
          <Ring value={k.submissionRate} label={uiCopy["ui"]["Check-in rate"]} caption="Submitted of issued" tone="violet" />
        </div>
      </Panel>

      <Panel index={5} wide title={uiCopy["ui"]["Check-ins"]} description={uiCopy["ui"]["Submitted and overdue requests per bucket."]} action={<Legend items={[{ label: uiCopy["ui"]["Submitted"], tone: "violet" }, { label: uiCopy["ui"]["Overdue"], tone: "warning" }]} />}>
        <StackedBars labels={k.series.map((x) => x.date)} series={[{ label: uiCopy["ui"]["Submitted"], tone: "violet", values: k.series.map((x) => x.submitted) }, { label: uiCopy["ui"]["Overdue"], tone: "warning", values: k.series.map((x) => x.overdue) }]} />
      </Panel>
      <Panel index={6} title={uiCopy["ui"]["Roster flow"]} description={uiCopy["ui"]["New and returning clients above the line, departures below."]}>
        <FlowBars labels={c.series.map((x) => x.date)} gains={c.series.map((x) => x.newClients + x.reactivated)} losses={c.series.map((x) => x.departed)} />
        <dl className={styles.facts}>
          <div>
            <dt>{uiCopy["dashboard"]["coach"]["newClients"]}</dt>
            <dd data-tone="up">+{c.newClients + c.reactivated}</dd>
          </div>
          <div>
            <dt>{uiCopy["dashboard"]["coach"]["departed"]}</dt>
            <dd data-tone="down">−{c.departed}</dd>
          </div>
          <div>
            <dt>{uiCopy["ui"]["Net"]}</dt>
            <dd>{c.netGrowth > 0 ? `+${c.netGrowth}` : c.netGrowth}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function FinanceTab({ data, currency }: { data: FinanceData; currency: string }) {
  const uiCopy = useUiCopy();

  const { selected, prior, series, previous, fmt, offers } = useFinance(data, currency);
  if (!selected)
    return <EmptyState title={uiCopy["ui"]["No financial activity"]} description={uiCopy["ui"]["Settled client-service payments, pending dues and recurring services appear here. Metrivum plan payments are excluded."]} />;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label={uiCopy["ui"]["Settled gross"]} value={selected.gross} format={fmt} previous={prior?.gross ?? 0} spark={series.map((x) => x.gross)} />
        <Kpi index={1} label={uiCopy["ui"]["Coach net"]} tone="info" value={selected.net} format={fmt} previous={prior?.net ?? 0} spark={series.map((x) => x.net)} />
        <Kpi index={2} label="MRR" tone="violet" value={selected.mrr} format={fmt} caption={`${selected.recurringSubscriptions} recurring ${selected.recurringSubscriptions === 1 ? "service" : "services"} at period end`}
          info="Monthly recurring revenue from contracted services: weekly prices × 52 / 12, monthly as they are, yearly / 12." />
        <Kpi index={3} label={uiCopy["ui"]["Unpaid dues"]} tone="warning" value={selected.pending} format={fmt} caption="Due within this period" />
      </div>
      <Panel index={1} wide title={uiCopy["ui"]["Gross and net"]} description={uiCopy["ui"]["What clients paid and what you kept after platform fees."]} action={<Legend items={[{ label: uiCopy["dashboard"]["coach"]["gross"], tone: "accent" }, { label: uiCopy["ui"]["Net"], tone: "info" }, { label: uiCopy["ui"]["Previous gross"], tone: "neutral", ghost: true }]} />}>
        <AreaChart
          height={260}
          labels={series.map((x) => x.date)}
          format={fmt}
          series={[
            { label: uiCopy["ui"]["Previous gross"], tone: "neutral", ghost: true, values: series.map((_, i) => previous[i]?.gross ?? 0) },
            { label: uiCopy["dashboard"]["coach"]["gross"], tone: "accent", values: series.map((x) => x.gross) },
            { label: uiCopy["ui"]["Net"], tone: "info", values: series.map((x) => x.net) },
          ]}
        />
      </Panel>
      <Panel index={2} title={uiCopy["ui"]["Payments"]} description={uiCopy["ui"]["Settled in this period."]}>
        <div className={styles.payHero}>
          <div>
            <strong><AnimatedNumber value={selected.payments} /></strong>
            <span>{selected.payments === 1 ? uiCopy["ui"]["payment"] : uiCopy["ui"]["payments"]}</span>
          </div>
          <div>
            <strong><AnimatedNumber value={selected.averagePayment} format={fmt} /></strong>
            <span>{uiCopy["ui"]["average payment"]}</span>
          </div>
        </div>
        <dl className={styles.payRows}>
          <PayRow label={uiCopy["dashboard"]["coach"]["payingClients"]} value={String(selected.payingClients)} />
          <PayRow label={uiCopy["ui"]["Per paying client"]} value={fmt(selected.revenuePerPayingClient)} />
          <PayRow label={uiCopy["ui"]["Renewals"]} value={String(selected.renewals)} note={selected.payments ? `${Math.round((selected.renewals / selected.payments) * 100)}% of payments` : undefined} />
          <PayRow label={uiCopy["ui"]["Platform fee"]} value={fmt(selected.fee)} note={selected.gross ? `${((selected.fee / selected.gross) * 100).toFixed(1)}% of gross` : undefined} />
        </dl>
      </Panel>
      <Panel index={3} title={uiCopy["ui"]["Revenue by offer"]} action={<More to="/app/offers">{uiCopy["profile"]["showcase"]["offersStat"]}</More>}>
        {offers.length ? <Donut center="gross" format={fmt} items={offers.map((o, i) => ({ label: o.name, value: o.gross, tone: OFFER_TONES[i % OFFER_TONES.length]! }))} /> : <NoData title={uiCopy["ui"]["No offer revenue"]} hint={uiCopy["ui"]["Revenue by offer appears after the first payment."]} />}
      </Panel>
      <Panel index={4} title={uiCopy["ui"]["Net by offer"]} description={uiCopy["ui"]["Ranked by what you kept."]}>
        <RankList format={fmt} items={offers.map((o) => ({ key: o.offerRevisionId, label: o.name, value: o.net, note: `${o.payments} payments · ${o.clients} clients` }))} />
      </Panel>
      <Panel index={5} title={uiCopy["ui"]["How it was paid"]} description={uiCopy["ui"]["Simulated payments move no real money."]}>
        <Split stacked format={fmt} a={{ label: uiCopy["ui"]["Simulated"], value: Math.round(selected.simulatedGross), tone: "violet" }} b={{ label: uiCopy["ui"]["Recorded externally"], value: Math.round(selected.externalGross), tone: "info" }} />
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

/** One line of the Payments panel: label on the left, value on the right, an optional quiet note under the value. */
function PayRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {note ? <span>{note}</span> : null}
      </dd>
    </div>
  );
}

function ClientsTab({ data }: { data: ClientsData }) {
  const uiCopy = useUiCopy();

  const c = data.clients;
  const a = data.acquisition;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label={uiCopy["dashboard"]["coach"]["activeClients"]} tone="info" value={c.active} previous={data.previousClients.active} spark={c.series.map((x) => x.active)} />
        <Kpi index={1} label={uiCopy["ui"]["First-time clients"]} value={c.newClients} previous={data.previousClients.newClients} spark={c.series.map((x) => x.newClients)} />
        <Kpi index={2} label={uiCopy["ui"]["Reactivated"]} tone="violet" value={c.reactivated} caption="Returned from suspended or completed" />
        <Kpi index={3} label={uiCopy["ui"]["Departed"]} tone="danger" value={c.departed} previous={data.previousClients.departed} invert caption="Active clients who left" />
      </div>
      <Panel index={1} wide title={uiCopy["ui"]["Active clients over time"]} action={<More to="/app/clients">{uiCopy["dashboard"]["coach"]["clients"]}</More>}>
        <AreaChart labels={c.series.map((x) => x.date)} series={[{ label: uiCopy["dashboard"]["coach"]["activeClients"], tone: "info", values: c.series.map((x) => x.active) }]} />
      </Panel>
      <Panel index={2} title={uiCopy["usage"]["colState"]}>
        <div className={styles.rings}>
          <Ring value={c.retentionPercent} label={uiCopy["dashboard"]["coach"]["retention"]} caption="Starting clients still active" tone="info" />
          <Ring value={a.conversionPercent} label={uiCopy["ui"]["Conversion"]} caption="Accepted of submitted" tone="warning" />
        </div>
        <Split a={{ label: uiCopy["dashboard"]["coach"]["status"]["Suspended"]!, value: c.suspended, tone: "warning" }} b={{ label: uiCopy["video"]["detail"]["completed"], value: c.completed, tone: "neutral" }} />
      </Panel>
      <Panel index={3} title={uiCopy["ui"]["Applications"]} description={uiCopy["ui"]["Applications submitted in this period, by their latest decision."]} action={<More to="/app/leads">{uiCopy["ui"]["Review"]}</More>}>
        <Funnel
          steps={[
            { label: uiCopy["ui"]["Submitted"], value: a.submitted, tone: "info" },
            { label: uiCopy["ui"]["Accepted"], value: a.accepted, tone: "accent" },
          ]}
        />
        <p className={styles.muted}>{a.rejected}  {uiCopy["ui"]["rejected, the rest still pending."]}</p>
      </Panel>
      <Panel index={4} title={uiCopy["ui"]["Where applications come from"]}>
        <RankList
          tone="info"
          items={a.sources.map((s) => ({ key: s.source, label: s.source, value: s.submitted, note: `${s.accepted} accepted · ${s.pending} pending${s.conversionPercent === null ? "" : ` · ${s.conversionPercent}%`}` }))}
        />
      </Panel>
      <Panel index={5} title={uiCopy["ui"]["Invitations"]}>
        <Funnel
          steps={[
            { label: uiCopy["ui"]["Sent"], value: a.invitationsSent, tone: "violet" },
            { label: uiCopy["ui"]["Accepted"], value: a.invitationsAccepted, tone: "accent" },
          ]}
        />
        <p className={styles.muted}>{a.invitationsDeclined}  {uiCopy["ui"]["declined."]}</p>
      </Panel>
      <Panel index={6} wide title={uiCopy["ui"]["Roster flow"]} description={uiCopy["ui"]["New and returning clients above the line, departures below."]}>
        <FlowBars labels={c.series.map((x) => x.date)} gains={c.series.map((x) => x.newClients + x.reactivated)} losses={c.series.map((x) => x.departed)} />
      </Panel>
      <Panel index={7} title={uiCopy["ui"]["Groups"]} description={uiCopy["ui"]["Current members. Groups overlap, so they don't add up."]} action={<More to="/app/groups">{uiCopy["ui"]["Groups"]}</More>}>
        {c.groups.length ? <RankList tone="violet" items={c.groups.map((g) => ({ key: g.id, label: g.name, value: g.clients }))} /> : <NoData height={120} title={uiCopy["ui"]["No client groups yet"]} hint={uiCopy["ui"]["Groups you create appear here with their members."]} />}
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
  const uiCopy = useUiCopy();

  const t = data.training.progress;
  if (!t) return <NoData height={260} title={uiCopy["ui"]["No recorded training data"]} hint={data.training.reason} />;
  const recorded = lifts(t);
  const onTime = Math.max(0, t.completed - t.loggedLate);
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label={uiCopy["ui"]["Workouts completed"]} tone="accent" value={t.completed} caption={`of ${t.due} due in this period`} />
        <Kpi index={1} label={uiCopy["ui"]["Not logged by deadline"]} tone="danger" value={t.missed} caption="Due workouts with no log" />
        <Kpi index={2} label={uiCopy["ui"]["Skipped"]} tone="warning" value={t.skipped} caption="Marked as skipped by the client" />
        <Kpi index={3} label={uiCopy["ui"]["Active assignments"]} tone="info" value={t.activeAssignments} caption={`${t.inProgress} workouts in progress`} />
      </div>

      <Panel index={1} title={uiCopy["ui"]["Completion"]} description={uiCopy["ui"]["Due workouts that were logged as completed."]}>
        <div className={styles.rings}>
          <Ring value={t.completionPercentage} label={uiCopy["ui"]["Completion"]} caption={`${t.completed} / ${t.due} due`} tone="accent" />
        </div>
        <Split a={{ label: uiCopy["ui"]["On time"], value: onTime, tone: "accent" }} b={{ label: uiCopy["ui"]["Logged late"], value: t.loggedLate, tone: "warning" }} />
      </Panel>

      <Panel index={2} title={uiCopy["ui"]["Workout outcomes"]} description={uiCopy["ui"]["Every workout due in this period, by what happened to it."]}>
        {t.due + t.inProgress > 0 ? (
          <Donut
            center="workouts"
            format={(n) => String(Math.round(n))}
            items={[
              { label: uiCopy["video"]["detail"]["completed"], value: t.completed, tone: "accent" },
              { label: uiCopy["ui"]["In progress"], value: t.inProgress, tone: "info" },
              { label: uiCopy["ui"]["Skipped"], value: t.skipped, tone: "warning" },
              { label: uiCopy["ui"]["Not logged"], value: t.missed, tone: "danger" },
            ]}
          />
        ) : (
          <NoData height={160} title={uiCopy["ui"]["Nothing was due"]} hint={uiCopy["ui"]["Assign a program to see outcomes here."]} />
        )}
      </Panel>

      <Panel index={3} title={uiCopy["ui"]["Work done"]} description={uiCopy["ui"]["From logged sets only. Prescribed weights never count as training."]}>
        <div className={styles.stats}>
          <Stat label={uiCopy["editor"]["grid"]} value={t.actualSets.toLocaleString()} />
          <Stat label={uiCopy["editor"]["columns"]["reps"]} value={t.actualReps.toLocaleString()} />
          <Stat label={uiCopy["editor"]["sheet"]["volume"]["title"]} value={t.volumeKg == null ? "—" : `${compact(t.volumeKg)} kg`} />
        </div>
      </Panel>

      <Panel index={4} wide title={uiCopy["ui"]["Lifts"]} description={uiCopy["ui"]["Best recorded load per training date. Each lift and load meaning is kept separate."]} action={<More to="/app/programs">{uiCopy["training"]["programs"]["title"]}</More>}>
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
                      {lift.meaning} · {lift.sets}  {uiCopy["ui"]["sets"]}
                    </span>
                  </div>
                  {lift.points.length > 1 ? <Sparkline tone="accent" values={lift.points.map((p) => p.load)} /> : <span className={styles.muted}>{uiCopy["ui"]["One session"]}</span>}
                  <div className={styles.liftValue}>
                    <strong>{last == null ? "—" : `${last} kg`}</strong>
                    {delta ? <span data-tone={delta > 0 ? "up" : "down"}>{`${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10} kg`}</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <NoData height={140} title={uiCopy["ui"]["No recorded lifts yet"]} hint={uiCopy["ui"]["Charts appear after clients log actual sets."]} />
        )}
      </Panel>

      <Panel index={5} title={uiCopy["training"]["programs"]["title"]} description={uiCopy["ui"]["Completed workouts per program."]}>
        {t.programs.length ? <RankList tone="accent" items={t.programs.map((p) => ({ key: p.programId, label: p.programName, value: p.completed }))} /> : <NoData height={120} title={uiCopy["ui"]["No completed workouts"]} />}
      </Panel>

      <Panel index={6} full title={uiCopy["dashboard"]["coach"]["clients"]} description={uiCopy["ui"]["Due and completed workouts per client in this period."]} action={<More to="/app/clients">{uiCopy["dashboard"]["coach"]["clients"]}</More>}>
        {t.clients.length ? (
          <RankList
            tone="info"
            items={[...t.clients]
              .sort((a, b) => b.missed - a.missed || a.completed / Math.max(1, a.due) - b.completed / Math.max(1, b.due))
              .map((c, i) => ({
                key: c.relationshipId,
                label: <Link to={`/app/clients/${c.relationshipId}?tab=progress`}>{formatInterfaceText(uiCopy["ui"]["Client {0}"], [i + 1])}</Link>,
                value: c.completed,
                note: `${c.completed} / ${c.due} done · ${c.missed} not logged${c.latestCompletedAt ? ` · last ${shortDate(c.latestCompletedAt.slice(0, 10))}` : ""}`,
              }))}
          />
        ) : (
          <NoData height={120} title={uiCopy["ui"]["No client workouts in this period"]} />
        )}
      </Panel>

      {/* How the numbers are counted: behind a small info button instead of a paragraph under the page. */}
      <div className={styles.definition}>
        <InfoTip label={uiCopy["ui"]["How these numbers are calculated"]} placement="top start">{t.metricDefinition}</InfoTip>
        <span className={styles.definitionLabel}>{uiCopy["ui"]["How these numbers are calculated"]}</span>
      </div>
    </div>
  );
}

function CheckInsTab({ data }: { data: CheckInsData }) {
  const uiCopy = useUiCopy();

  const k = data.checkIns;
  const p = data.previousCheckIns;
  return (
    <div className={styles.grid}>
      <div className={styles.kpis}>
        <Kpi index={0} label={uiCopy["ui"]["Issued"]} tone="info" value={k.issued} previous={p.issued} spark={k.series.map((x) => x.issued)} />
        <Kpi index={1} label={uiCopy["ui"]["Submitted"]} tone="violet" value={k.submitted} previous={p.submitted} spark={k.series.map((x) => x.submitted)} />
        <Kpi index={2} label={uiCopy["ui"]["Overdue"]} tone="warning" value={k.overdue} previous={p.overdue} invert spark={k.series.map((x) => x.overdue)} />
        <Kpi index={3} label={uiCopy["ui"]["Awaiting your review"]} tone="danger" value={k.pendingReview} caption="Submitted, not reviewed yet" />
      </div>
      <Panel index={1} wide title={uiCopy["ui"]["Requests per bucket"]} action={<Legend items={[{ label: uiCopy["ui"]["Submitted"], tone: "violet" }, { label: uiCopy["ui"]["Overdue"], tone: "warning" }]} />}>
        <StackedBars height={240} labels={k.series.map((x) => x.date)} series={[{ label: uiCopy["ui"]["Submitted"], tone: "violet", values: k.series.map((x) => x.submitted) }, { label: uiCopy["ui"]["Overdue"], tone: "warning", values: k.series.map((x) => x.overdue) }]} />
      </Panel>
      <Panel index={2} title={uiCopy["ui"]["Response"]} action={<More to="/app/check-ins">{uiCopy["ui"]["Check-ins"]}</More>}>
        <div className={styles.rings}>
          <Ring value={k.submissionRate} label={uiCopy["ui"]["Submission rate"]} tone="violet" />
          <Ring value={k.averageReviewHours === null ? null : Math.max(0, 100 - (k.averageReviewHours / 48) * 100)} label={k.averageReviewHours === null ? uiCopy["ui"]["Review time"] : `${k.averageReviewHours.toFixed(1)} h to review`} caption="Faster fills the ring (48 h = empty)" tone="accent" />
        </div>
      </Panel>
      <Panel index={3} wide title={uiCopy["ui"]["Issued over time"]}>
        <AreaChart height={200} labels={k.series.map((x) => x.date)} format={(n) => String(Math.round(n))} series={[{ label: uiCopy["ui"]["Issued"], tone: "info", values: k.series.map((x) => x.issued) }]} />
      </Panel>
      <Panel index={4} title={uiCopy["settings"]["areas"]["messaging"]!} description={uiCopy["ui"]["Counts only; message contents are never analyzed."]} action={<More to="/app/messages">{uiCopy["settings"]["areas"]["messaging"]!}</More>}>
        <Split a={{ label: uiCopy["ui"]["Sent"], value: data.messaging.sent, tone: "accent" }} b={{ label: uiCopy["ui"]["Received"], value: data.messaging.received, tone: "info" }} />
        <p className={styles.muted}>{data.messaging.conversations}  {uiCopy["ui"]["conversations with activity."]}</p>
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
