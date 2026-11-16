import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FilePlus2,
  Inbox,
  MapPin,
  Receipt,
  Tag,
  Upload,
  UserPlus,
  UsersRound,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Card,
  EmptyState,
  LoadingState,
  Segment,
  SegmentedControl,
  Skeleton,
} from "@portable-ui/react";
import { AreaChart, Delta, Sparkline, type Overview } from "~/modules/analyze";
import { useCalendarRange, type CalendarEvent } from "~/modules/calendar";
import {
  money,
  useCoachingQuery,
  type Page,
  type Relationship,
} from "~/modules/coaching";
import { useAccessSnapshot, useFeatureAccess } from "~/shared/access";
import { formatNumber, formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import styles from "./dashboard.module.css";

type Tone = "green" | "violet" | "blue" | "orange" | "rose";
type Lead = Schema<"ApplicationDto">;
type PulseData = Overview | Schema<"BasicAnalysis">;

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function lastDays(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: iso(from), to: iso(to) };
}

/** The same overview the Analyze page reads, for a window ending today. */
function useOverview(days: number, enabled: boolean) {
  const advanced = useFeatureAccess("analytics.advanced");
  const api = useApi();
  const account = useAccountKey();
  const range = lastDays(days);
  return useQuery({
    queryKey: [
      account,
      "coaching",
      "analyze",
      "dashboard",
      advanced.allowed,
      range,
    ],
    enabled: enabled && !advanced.pending,
    queryFn: async ({ signal }) =>
      (
        await api<PulseData>({
          path: advanced.allowed
            ? "/api/v1/analyze/overview"
            : "/api/v1/analyze/basic",
          query: {
            ...range,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            grouping: days > 120 ? "month" : days > 31 ? "week" : "day",
          },
          signal,
        })
      ).data,
  });
}

function Chip({ tone, icon: Icon }: { tone: Tone; icon: typeof Inbox }) {
  return (
    <span className={styles.statChip} data-tone={tone} aria-hidden="true">
      <Icon strokeWidth={1.75} />
    </span>
  );
}

/** A headline figure with its change and a small trend line. */
function Metric({
  tone,
  icon,
  label,
  value,
  delta,
  spark,
  sparkTone,
  href,
  index,
}: {
  tone: Tone;
  icon: typeof Inbox;
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  spark?: number[];
  sparkTone?: "accent" | "info" | "violet" | "warning";
  href: string;
  index: number;
}) {
  return (
    <RouterLink
      to={href}
      className={styles.metric}
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className={styles.metricHead}>
        <Chip tone={tone} icon={icon} />
        <span className={styles.statLabel}>{label}</span>
      </div>
      <div className={styles.metricBody}>
        <div>
          <p className={styles.metricValue}>{value}</p>
          <div className={styles.metricDelta}>{delta}</div>
        </div>
        <div className={styles.metricSpark}>
          {spark ? <Sparkline values={spark} tone={sparkTone} /> : null}
        </div>
      </div>
    </RouterLink>
  );
}

function Section({
  title,
  sub,
  action,
  children,
  className,
}: {
  title: ReactNode;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      as="section"
      padding="none"
      className={[styles.panel, className].filter(Boolean).join(" ")}
    >
      <header className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {sub ? <p className={styles.panelSub}>{sub}</p> : null}
        </div>
        {action}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </Card>
  );
}

function More({ to, children }: { to: string; children: ReactNode }) {
  return (
    <RouterLink to={to} className={styles.viewAll}>
      {children}
      <ArrowRight aria-hidden="true" />
    </RouterLink>
  );
}

/* ---------------------------------------------------------------- income */

function Income({ currency }: { currency: string }) {
  const t = useT().dashboard.coach;
  const [days, setDays] = useState("90");
  const overview = useOverview(Number(days), true);
  const data = overview.data;
  const advanced = data && "previousFinance" in data ? data : undefined;
  const series =
    data?.finance.series.filter((x) => x.currency === currency) ?? [];
  const previous =
    advanced?.previousFinance.series.filter((x) => x.currency === currency) ??
    [];
  const total = data?.finance.totals.find((x) => x.currency === currency);
  const before = advanced?.previousFinance.totals.find(
    (x) => x.currency === currency,
  );
  return (
    <Section
      className={styles.income}
      title={t.income}
      action={
        <SegmentedControl
          size="sm"
          aria-label={t.incomeRange}
          selectedKeys={[days]}
          onSelectionChange={(keys) => setDays(String([...keys][0] ?? "90"))}
        >
          <Segment id="30">{t.days(30)}</Segment>
          <Segment id="90">{t.days(90)}</Segment>
          <Segment id="365">{t.days(365)}</Segment>
        </SegmentedControl>
      }
    >
      <div className={styles.incomeHead}>
        <p className={styles.financeValue}>
          {total ? (
            money(total.net, currency)
          ) : data ? (
            money(0, currency)
          ) : (
            <Skeleton width="8rem" height="2rem" />
          )}
        </p>
        {total && before ? (
          <Delta current={total.net} previous={before.net} />
        ) : null}
        <span className={styles.muted}>{t.incomeNote}</span>
      </div>
      {data ? (
        series.length ? (
          <AreaChart
            height={220}
            labels={series.map((x) => x.date)}
            format={(n) => money(n, currency).replace(/\.00$/, "")}
            series={[
              {
                label: t.net,
                tone: "accent",
                values: series.map((x) => x.net),
              },
              ...(previous.length
                ? [
                    {
                      label: t.previousPeriod,
                      tone: "neutral" as const,
                      ghost: true,
                      values: series.map((_, i) => previous[i]?.net ?? 0),
                    },
                  ]
                : []),
            ]}
          />
        ) : (
          <EmptyState
            size="sm"
            icon={<Banknote strokeWidth={1.5} />}
            title={t.noRevenue}
            description={t.noRevenueBody}
          />
        )
      ) : (
        <Skeleton height="13.75rem" radius="lg" />
      )}
    </Section>
  );
}

/* -------------------------------------------------------------- sessions */

function Sessions() {
  const t = useT().dashboard.coach;
  const locale = useLocale();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  const until = new Date(today);
  until.setDate(until.getDate() + 14);
  const events = useCalendarRange<CalendarEvent>(
    "/api/v1/calendar/events",
    { from: iso(today), to: iso(until) },
    zone,
  );
  const upcoming = (events.data ?? [])
    .filter((e) => !e.cancelled && Date.parse(e.endsAtUtc) >= Date.now())
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc))
    .slice(0, 5);
  const when = (e: CalendarEvent) => {
    const start = new Date(e.startsAtUtc);
    const day = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(start);
    return e.startDate
      ? day
      : `${day}, ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(start)}`;
  };
  return (
    <Section
      title={t.sessions}
      action={<More to="/app/calendar">{t.openCalendar}</More>}
    >
      {events.isPending ? (
        <LoadingState size="sm" />
      ) : events.isError ? (
        <p className={styles.muted}>{t.unavailable}</p>
      ) : !upcoming.length ? (
        <div className={styles.emptyFrame}>
          <EmptyState
            size="sm"
            icon={<CalendarClock strokeWidth={1.5} />}
            title={t.noSessions}
            description={t.noSessionsBody}
          />
        </div>
      ) : (
        <ul className={styles.rows}>
          {upcoming.map((e, i) => (
            <li key={e.id} style={{ "--i": i } as React.CSSProperties}>
              <RouterLink
                to={`/app/calendar?event=${e.id}`}
                className={styles.row}
              >
                <span
                  className={styles.dateBadge}
                  data-kind={e.kind}
                  aria-hidden="true"
                >
                  <b>{new Date(e.startsAtUtc).getDate()}</b>
                  <small>
                    {new Intl.DateTimeFormat(locale, { month: "short" }).format(
                      new Date(e.startsAtUtc),
                    )}
                  </small>
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{e.title}</span>
                  <span className={styles.rowSub}>
                    {when(e)}
                    {e.meetingUrl
                      ? ` · ${t.online}`
                      : e.location
                        ? ` · ${e.location}`
                        : ""}
                  </span>
                </span>
                {e.location && !e.meetingUrl ? (
                  <MapPin aria-hidden="true" />
                ) : null}
                <ChevronRight aria-hidden="true" />
              </RouterLink>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- tasks */

function Tasks({
  data,
  currency,
}: {
  data: PulseData | undefined;
  currency: string;
}) {
  const t = useT().dashboard.coach;
  const access = useAccessSnapshot();
  const running = Number(
    access.data?.limits.find((l) => l.key === "analysis.concurrent")?.used ?? 0,
  );
  const a = data && "acquisition" in data ? data.acquisition : undefined;
  const pendingLeads = a
    ? Math.max(0, a.submitted - a.accepted - a.rejected)
    : 0;
  const pendingMoney =
    data?.finance.totals.find((x) => x.currency === currency)?.pending ?? 0;
  const tasks = [
    {
      key: "leads",
      tone: "orange" as Tone,
      icon: Inbox,
      title: t.task.leads,
      body: t.task.leadsBody,
      count: pendingLeads,
      href: "/app/leads",
    },
    {
      key: "review",
      tone: "violet" as Tone,
      icon: ClipboardCheck,
      title: t.task.review,
      body: t.task.reviewBody,
      count: data?.checkIns.pendingReview ?? 0,
      href: "/app/check-ins",
    },
    {
      key: "overdue",
      tone: "rose" as Tone,
      icon: ClipboardList,
      title: t.task.overdue,
      body: t.task.overdueBody,
      count: data?.checkIns.overdue ?? 0,
      href: "/app/check-ins",
    },
    {
      key: "payments",
      tone: "green" as Tone,
      icon: Receipt,
      title: t.task.payments,
      body: pendingMoney
        ? t.task.paymentsBody(money(pendingMoney, currency))
        : "",
      count: pendingMoney ? 1 : 0,
      href: "/app/payments",
    },
    {
      key: "analyses",
      tone: "blue" as Tone,
      icon: Activity,
      title: t.task.analyses,
      body: t.task.analysesBody,
      count: running,
      href: "/app/video-analyses",
    },
  ].filter((task) => task.count > 0);
  const open = tasks.reduce(
    (sum, task) => sum + (task.key === "payments" ? 1 : task.count),
    0,
  );
  return (
    <Section
      title={
        <>
          {t.tasks}
          {data ? <span className={styles.countPill}>{open}</span> : null}
        </>
      }
    >
      {!data ? (
        <LoadingState size="sm" />
      ) : !tasks.length ? (
        <EmptyState
          size="sm"
          icon={<ClipboardCheck strokeWidth={1.5} />}
          title={t.noTasks}
          description={t.noTasksBody}
        />
      ) : (
        <ul className={styles.rows}>
          {tasks.map((task, i) => (
            <li key={task.key} style={{ "--i": i } as React.CSSProperties}>
              <RouterLink to={task.href} className={styles.task}>
                <Chip tone={task.tone} icon={task.icon} />
                <span className={styles.rowText}>
                  <span className={styles.rowName}>
                    {task.title}
                    {task.key !== "payments" ? (
                      <span className={styles.countPill} data-tone={task.tone}>
                        {task.count}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.rowSub}>{task.body}</span>
                </span>
                <ChevronRight aria-hidden="true" />
              </RouterLink>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- usage */

/** The other plan limits listed under active clients (sizes in bytes are left to Settings). */
const OTHER_LIMITS = [
  "training.documents",
  "training.formulas",
  "analysis.concurrent",
];

/** Usage shows the one limit that shapes a coaching business: active clients, then the other plan limits. */
export function UsagePanel() {
  const m = useT();
  const t = m.dashboard.coach;
  const locale = useLocale();
  const access = useAccessSnapshot();
  const limit =
    access.data?.limits.find((l) => l.key === "coaching.active_clients") ??
    access.data?.limits.find((l) => l.key === "coaching.active-clients");
  const otherLimits = OTHER_LIMITS.map((key) =>
    access.data?.limits.find((l) => l.key === key),
  ).filter((l) => l != null);
  if (!access.isPending && !limit) return null;
  const used = Number(limit?.used ?? 0);
  const maximum = Number(limit?.maximum ?? 0);
  const unlimited = limit?.maximum == null;
  const ratio = unlimited || !maximum ? 0 : Math.min(1, used / maximum);
  return (
    <Section title={m.dashboard.usage} sub={t.usageSub}>
      {!limit ? (
        <LoadingState size="sm" />
      ) : (
        <div className={styles.usageMain}>
          <div className={styles.usageFigure}>
            <span
              className={styles.usageRing}
              data-tone="green"
              data-high={ratio > 0.85 || undefined}
              style={{ "--p": ratio } as React.CSSProperties}
              aria-hidden="true"
            >
              <UsersRound strokeWidth={1.75} />
            </span>
            <div>
              <p className={styles.usageBig}>
                {formatNumber(locale, used)}
                <small>
                  {unlimited
                    ? ` / ${t.unlimited}`
                    : ` / ${formatNumber(locale, maximum)}`}
                </small>
              </p>
              <p className={styles.rowSub}>{t.activeClientsLimit}</p>
            </div>
          </div>
          {!unlimited ? (
            <>
              <span
                className={styles.usageBar}
                data-high={ratio > 0.85 || undefined}
                aria-hidden="true"
              >
                <span style={{ transform: `scaleX(${ratio})` }} />
              </span>
              <p className={styles.rowSub}>
                {t.slotsLeft(formatNumber(locale, Math.max(0, maximum - used)))}
              </p>
            </>
          ) : null}
        </div>
      )}
      {otherLimits.length ? (
        <div className={styles.limitList}>
          <p className={styles.limitHead}>{t.planLimits}</p>
          <ul>
            {otherLimits.map((l) => {
              const usedOf = Number(l.used),
                maxOf = Number(l.maximum),
                open = l.maximum == null;
              const share = open || !maxOf ? 0 : Math.min(1, usedOf / maxOf);
              return (
                <li key={l.key}>
                  <span className={styles.limitName}>
                    {m.access.limits[l.key] ?? l.key}
                  </span>
                  <span className={styles.limitCount}>
                    {formatNumber(locale, usedOf)}
                    {open
                      ? ` / ${t.unlimited}`
                      : ` / ${formatNumber(locale, maxOf)}`}
                  </span>
                  {!open ? (
                    <span
                      className={styles.limitBar}
                      data-high={share > 0.85 || undefined}
                      aria-hidden="true"
                    >
                      <span style={{ transform: `scaleX(${share})` }} />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <RouterLink to="/app/subscription" className={styles.limitLink}>
            {t.managePlan}
            <ArrowRight aria-hidden="true" />
          </RouterLink>
        </div>
      ) : null}
    </Section>
  );
}

/* ---------------------------------------------------------- short lists */

function Leads() {
  const t = useT().dashboard.coach;
  const locale = useLocale();
  const list = useCoachingQuery<Page<Lead>>("/api/v1/coaching/leads", {
    page: 1,
    pageSize: 4,
    sort: "updated",
  });
  if (list.isPending) return <LoadingState size="sm" />;
  if (list.isError) return <p className={styles.muted}>{t.unavailable}</p>;
  if (!list.data.items.length)
    return (
      <EmptyState
        size="sm"
        icon={<Inbox strokeWidth={1.5} />}
        title={t.noLeads}
        description={t.noLeadsBody}
      />
    );
  return (
    <ul className={styles.rows}>
      {list.data.items.map((lead, i) => (
        <li key={lead.id} style={{ "--i": i } as React.CSSProperties}>
          <RouterLink
            to={`/app/applications/${lead.id}`}
            className={styles.row}
          >
            <span className={styles.avatar} aria-hidden="true">
              {(lead.applicant.displayName || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowName}>
                {lead.applicant.displayName}
              </span>
              <span className={styles.rowSub}>{lead.offerName}</span>
            </span>
            <span className={styles.rowAmount}>
              {money(Number(lead.amount), lead.currency)}
            </span>
            <span className={styles.rowMeta}>
              {formatRelative(locale, lead.submittedAt ?? lead.createdAt)}
            </span>
          </RouterLink>
        </li>
      ))}
    </ul>
  );
}

function Clients({ data }: { data: PulseData | undefined }) {
  const t = useT().dashboard.coach;
  const locale = useLocale();
  const list = useCoachingQuery<Page<Relationship>>(
    "/api/v1/coaching/clients",
    { page: 1, pageSize: 4, sort: "created" },
  );
  const c = data?.clients;
  const total = c ? c.active + c.suspended + c.completed : 0;
  return (
    <div className={styles.clients}>
      {c ? (
        <>
          <div
            className={styles.roster}
            role="img"
            aria-label={t.rosterLabel(c.active, c.suspended, c.completed)}
          >
            {total ? (
              <>
                <span data-tone="green" style={{ flexGrow: c.active }} />
                <span data-tone="orange" style={{ flexGrow: c.suspended }} />
                <span data-tone="neutral" style={{ flexGrow: c.completed }} />
              </>
            ) : (
              <span data-tone="neutral" style={{ flexGrow: 1 }} />
            )}
          </div>
          {"newClients" in c && (
            <dl className={styles.mini}>
              <div>
                <dt>{t.newClients}</dt>
                <dd data-tone="up">
                  +{formatNumber(locale, c.newClients + c.reactivated)}
                </dd>
              </div>
              <div>
                <dt>{t.departed}</dt>
                <dd data-tone={c.departed ? "down" : undefined}>
                  {c.departed ? `−${formatNumber(locale, c.departed)}` : "0"}
                </dd>
              </div>
              <div>
                <dt>{t.retention}</dt>
                <dd>
                  {c.retentionPercent == null ? "—" : `${c.retentionPercent}%`}
                </dd>
              </div>
            </dl>
          )}
        </>
      ) : (
        <Skeleton height="3.5rem" />
      )}
      {list.data?.items.length ? (
        <ul className={styles.rows}>
          {list.data.items.map((r, i) => (
            <li key={r.id} style={{ "--i": i } as React.CSSProperties}>
              <RouterLink to={`/app/clients/${r.id}`} className={styles.row}>
                <span className={styles.avatar} aria-hidden="true">
                  {(r.client.displayName || r.client.username || "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>
                    {r.client.displayName || r.client.username}
                  </span>
                  <span className={styles.rowSub}>
                    {t.status[r.status] ?? r.status}
                  </span>
                </span>
                <span className={styles.rowMeta}>
                  {formatRelative(locale, r.startedAt)}
                </span>
              </RouterLink>
            </li>
          ))}
        </ul>
      ) : list.isPending ? (
        <LoadingState size="sm" />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- quick actions */

function QuickActions() {
  const m = useT();
  const t = m.dashboard.coach;
  const create = useFeatureAccess("training.programs.create");
  const importCsv = useFeatureAccess("training.import.csv");
  const analysis = useFeatureAccess("video.library.manage");
  const actions = [
    {
      href: "/app/invitations",
      icon: UserPlus,
      tone: "green" as Tone,
      label: t.action.invite,
      show: true,
    },
    {
      href: "/app/programs?create=1",
      icon: FilePlus2,
      tone: "violet" as Tone,
      label: m.dashboard.newProgram,
      show: create.allowed,
    },
    {
      href: "/app/check-in-schedules/new",
      icon: ClipboardCheck,
      tone: "blue" as Tone,
      label: t.action.checkIn,
      show: true,
    },
    {
      href: "/app/offers/new",
      icon: Tag,
      tone: "orange" as Tone,
      label: t.action.offer,
      show: true,
    },
    {
      href: "/app/video-analyses/new",
      icon: Video,
      tone: "rose" as Tone,
      label: m.dashboard.newAnalysis,
      show: analysis.allowed,
    },
    {
      href: "/app/programs?import=1",
      icon: Upload,
      tone: "blue" as Tone,
      label: m.dashboard.importCsv,
      show: importCsv.allowed,
    },
  ].filter((a) => a.show);
  return (
    <Card
      as="section"
      padding="none"
      aria-labelledby="quick-title"
      className={styles.quick}
    >
      <h2 id="quick-title" className={styles.panelTitle}>
        {t.quickActions}
      </h2>
      <ul className={styles.quickList}>
        {actions.map((a, i) => (
          <li key={a.href} style={{ "--i": i } as React.CSSProperties}>
            <RouterLink to={a.href} className={styles.quickAction}>
              <Chip tone={a.tone} icon={a.icon} />
              <span>{a.label}</span>
              <ChevronRight aria-hidden="true" />
            </RouterLink>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ page */

/**
 * The coach's business at a glance. Figures come from the Analyze overview (last 30 days);
 * lists from the coaching and calendar endpoints. Nothing here is estimated.
 */
export function CoachDashboard({ recent }: { recent: ReactNode }) {
  const t = useT().dashboard.coach;
  const locale = useLocale();
  const analytics = useFeatureAccess("analytics.view");
  const overview = useOverview(30, analytics.allowed);
  const data = overview.data;
  const advanced = data && "previousFinance" in data ? data : undefined;
  const currency =
    data?.finance.totals.slice().sort((a, b) => b.net - a.net)[0]?.currency ??
    advanced?.previousFinance.totals[0]?.currency ??
    "EUR";
  const now = data?.finance.totals.find((x) => x.currency === currency);
  const before = advanced?.previousFinance.totals.find(
    (x) => x.currency === currency,
  );
  const a = advanced?.acquisition;
  const pa = advanced?.previousAcquisition;
  const value = (v: ReactNode) =>
    data ? v : <Skeleton width="4rem" height="1.75rem" />;

  return (
    <div className={styles.board}>
      <div className={styles.boardMain}>
        {analytics.allowed ? (
          <div className={styles.metrics}>
            <Metric
              index={0}
              tone="green"
              icon={Banknote}
              label={t.revenue}
              href="/app/analyze"
              value={value(money(now?.net ?? 0, currency))}
              delta={
                now && before ? (
                  <Delta current={now.net} previous={before.net} />
                ) : (
                  <span>{t.range}</span>
                )
              }
              spark={data?.finance.series
                .filter((x) => x.currency === currency)
                .map((x) => x.net)}
              sparkTone="accent"
            />
            <Metric
              index={1}
              tone="blue"
              icon={UsersRound}
              label={t.activeClients}
              href="/app/clients"
              value={value(formatNumber(locale, data?.clients.active ?? 0))}
              delta={
                advanced ? (
                  <Delta
                    current={advanced.clients.active}
                    previous={advanced.previousClients.active}
                  />
                ) : null
              }
              spark={advanced?.clients.series.map((x) => x.active)}
              sparkTone="info"
            />
            {/* Leads need advanced analytics; without it the third tile shows check-ins, which every plan has. */}
            {a || !data ? (
              <Metric
                index={2}
                tone="violet"
                icon={Inbox}
                label={t.leads}
                href="/app/leads"
                value={value(formatNumber(locale, a?.submitted ?? 0))}
                delta={
                  a && pa ? (
                    <Delta current={a.submitted} previous={pa.submitted} />
                  ) : null
                }
                spark={advanced?.clients.series.map((x) => x.newClients)}
                sparkTone="violet"
              />
            ) : (
              <Metric
                index={2}
                tone="violet"
                icon={ClipboardCheck}
                label={t.checkInsSubmitted}
                href="/app/check-ins"
                value={formatNumber(locale, Number(data.checkIns.submitted))}
                delta={
                  data.checkIns.submissionRate == null ? (
                    <span>{t.range}</span>
                  ) : (
                    <span>
                      {t.submissionRate(
                        Math.round(Number(data.checkIns.submissionRate)),
                      )}
                    </span>
                  )
                }
                spark={data.checkIns.series.map((x) => Number(x.submitted))}
                sparkTone="violet"
              />
            )}
          </div>
        ) : null}

        <div className={styles.split}>
          {analytics.allowed ? <Income currency={currency} /> : null}
          <Sessions />
        </div>

        <QuickActions />

        <div className={styles.lists}>
          <Section
            title={t.newLeads}
            sub={t.newLeadsSub}
            action={<More to="/app/leads">{t.viewAll}</More>}
          >
            <Leads />
          </Section>
          <Section
            title={t.clients}
            sub={t.clientsSub}
            action={<More to="/app/clients">{t.viewAll}</More>}
          >
            <Clients data={data} />
          </Section>
          {recent}
        </div>
      </div>

      <aside className={styles.boardSide}>
        {analytics.allowed ? <Tasks data={data} currency={currency} /> : null}
        <UsagePanel />
      </aside>
    </div>
  );
}
