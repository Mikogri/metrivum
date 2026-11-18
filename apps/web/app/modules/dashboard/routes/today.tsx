import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Today — Metrivum");

import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Inbox,
  Play,
  Users,
} from "lucide-react";
import type { Schema } from "@metrivum/api-client-web";
import { Badge, PageHeader, EmptyState } from "@portable-ui/react";
import {
  Failure,
  Loading,
  useCoachingQuery,
  type Page,
} from "~/modules/coaching";
import { WorkoutStatus } from "~/modules/training";
import { useWorkspace } from "~/shared/session/WorkspaceScope";
import styles from "./today.module.css";

const day = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

type Tone = "green" | "orange" | "blue" | "violet" | "rose";

/** One panel of the day: an icon, a title with how many there are, an optional link to the full list. */
function Panel({
  title,
  icon,
  tone,
  count,
  link,
  highlight,
  children,
}: {
  title: string;
  icon: ReactNode;
  tone: Tone;
  count?: number;
  link?: { to: string; label: string };
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} data-highlight={highlight || undefined}>
      <header className={styles.panelHeader}>
        <span className={styles.chip} data-tone={tone} aria-hidden="true">
          {icon}
        </span>
        <h2 className={styles.panelTitle}>{title}</h2>
        {count ? <span className={styles.count}>{count}</span> : null}
        {link ? (
          <Link className={styles.viewAll} to={link.to}>
            {link.label}
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <EmptyState size="sm" title={children} />;
}

function Workouts({
  active = false,
  date,
}: {
  active?: boolean;
  date: string;
}) {
  const uiCopy = useUiCopy();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Schema<"OccurrenceDto">>>(
    "/api/v1/training/schedule",
    {
      from: active ? day(new Date(Date.now() - 365 * 86400000)) : date,
      to: date,
      status: active ? "InProgress" : undefined,
      page: 1,
      pageSize: 10,
      view: mode,
    },
  );
  if (active && query.data?.items.length === 0) return null;
  const listPath =
    mode === "coach" ? "/app/training" : "/app/my-training?tab=history";
  return (
    <Panel
      title={
        active ? uiCopy["ui"]["In progress"] : uiCopy["ui"]["Workouts today"]
      }
      icon={active ? <Play /> : <Dumbbell />}
      tone={active ? "orange" : "green"}
      count={query.data?.total}
      highlight={active}
      link={
        Number(query.data?.total) > 10
          ? { to: listPath, label: uiCopy["dashboard"]["viewAll"] }
          : undefined
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <ul className={styles.rows}>
          {query.data.items.map((item) => (
            <li key={item.id}>
              <Link
                className={styles.row}
                to={`/app/${mode === "coach" ? "training" : "my-training"}/workouts/${item.id}`}
              >
                <span className={styles.rowText}>
                  <strong>{item.name}</strong>
                  <small>
                    {item.programName}
                    {item.exerciseCount != null
                      ? ` · ${item.exerciseCount} exercises`
                      : ""}
                  </small>
                </span>
                {active ? (
                  <span className={styles.rowAction}>
                    {uiCopy["ui"]["Continue workout"]}
                  </span>
                ) : (
                  <WorkoutStatus status={item.status} />
                )}
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{uiCopy["ui"]["No workouts scheduled for today."]}</Empty>
      )}
    </Panel>
  );
}

function CheckIns({ overdue = false }: { overdue?: boolean }) {
  const uiCopy = useUiCopy();
  const { mode } = useWorkspace();
  const query = useCoachingQuery<Page<Schema<"CheckInRequestDto">>>(
    "/api/v1/check-ins/requests",
    {
      role: mode,
      page: 1,
      pageSize: 10,
      status: overdue
        ? "Overdue"
        : mode === "coach"
          ? "Submitted"
          : "Available",
      sort: "due",
    },
  );
  if (overdue && !query.isError && !query.data?.items.length) return null;
  return (
    <Panel
      title={
        overdue
          ? uiCopy["dashboard"]["coach"]["task"]["overdue"]
          : mode === "coach"
            ? uiCopy["ui"]["Awaiting your review"]
            : uiCopy["ui"]["Check-ins to fill in"]
      }
      icon={overdue ? <AlarmClock /> : <ClipboardCheck />}
      tone={overdue ? "rose" : "violet"}
      count={query.data?.total}
      link={{
        to: mode === "coach" ? "/app/check-ins" : "/app/my-check-ins",
        label: uiCopy["dashboard"]["viewAll"],
      }}
    >
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : query.data.items.length ? (
        <ul className={styles.rows}>
          {query.data.items.map((item) => (
            <li key={item.id}>
              <Link className={styles.row} to={`/app/check-ins/${item.id}`}>
                <span className={styles.rowText}>
                  <strong>{item.scheduleName}</strong>
                  <small>
                    {uiCopy["ui"]["Due"]}{" "}
                    <time dateTime={item.dueAtUtc}>
                      {new Date(item.dueAtUtc).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </small>
                </span>
                {overdue && (
                  <Badge dot tone="danger">
                    {uiCopy["ui"]["Overdue"]}
                  </Badge>
                )}
                <ChevronRight className={styles.chevron} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{uiCopy["ui"]["No check-ins are waiting."]}</Empty>
      )}
    </Panel>
  );
}

function Week() {
  const uiCopy = useUiCopy();
  const { mode } = useWorkspace();
  const [range] = useState(() => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from: from.toISOString(), to: to.toISOString() };
  });
  const events = useCoachingQuery<Page<Schema<"EventDto">>>(
    "/api/v1/calendar/events",
    {
      ...range,
      role: mode,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      page: 1,
      pageSize: 10,
    },
  );
  return (
    <Panel
      title={uiCopy["ui"]["This week"]}
      icon={<CalendarDays />}
      tone="blue"
      count={events.data?.total}
      link={{ to: "/app/calendar", label: uiCopy["ui"]["Open calendar"] }}
    >
      {events.isPending ? (
        <Loading />
      ) : events.isError ? (
        <Failure error={events.error} retry={() => void events.refetch()} />
      ) : events.data.items.length ? (
        <ul className={styles.rows}>
          {events.data.items.map((event) => {
            const start = new Date(event.startsAtUtc);
            return (
              <li key={event.id}>
                <Link
                  className={styles.row}
                  to={`/app/calendar?event=${event.id}`}
                  data-cancelled={event.cancelled || undefined}
                >
                  <span className={styles.date} aria-hidden="true">
                    <b>{start.getDate()}</b>
                    <small>
                      {start.toLocaleDateString([], { weekday: "short" })}
                    </small>
                  </span>
                  <span className={styles.rowText}>
                    <strong>{event.title}</strong>
                    <small>
                      <time dateTime={event.startsAtUtc}>
                        {start.toLocaleString([], {
                          weekday: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </small>
                  </span>
                  {event.cancelled && (
                    <Badge tone="danger">
                      {uiCopy["video"]["statuses"]["Cancelled"]}
                    </Badge>
                  )}
                  <ChevronRight className={styles.chevron} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>{uiCopy["ui"]["No events this week."]}</Empty>
      )}
    </Panel>
  );
}

/** The coach's headline figures: who is active and who is waiting for an answer. */
function CoachSummary() {
  const uiCopy = useUiCopy();
  const clients = useCoachingQuery<Page<Schema<"CoachRelationshipDto">>>(
    "/api/v1/coaching/clients",
    { status: "Active", page: 1, pageSize: 1 },
  );
  const leads = useCoachingQuery<Page<Schema<"ApplicationDto">>>(
    "/api/v1/coaching/leads",
    { page: 1, pageSize: 1 },
  );
  if (clients.error || leads.error)
    return (
      <Failure
        error={clients.error || leads.error}
        retry={() => {
          void clients.refetch();
          void leads.refetch();
        }}
      />
    );
  const stats = [
    {
      to: "/app/clients",
      value: clients.data?.total,
      label: uiCopy["dashboard"]["coach"]["activeClients"],
      icon: <Users />,
      tone: "green" as const,
    },
    {
      to: "/app/leads",
      value: leads.data?.total,
      label: uiCopy["ui"]["Leads to answer"],
      icon: <Inbox />,
      tone: "violet" as const,
    },
  ];
  return (
    <div className={styles.stats}>
      {stats.map((stat) => (
        <Link key={stat.to} className={styles.stat} to={stat.to}>
          <span
            className={styles.chip}
            data-tone={stat.tone}
            aria-hidden="true"
          >
            {stat.icon}
          </span>
          <span className={styles.statText}>
            <strong>{stat.value ?? "–"}</strong>
            <span>{stat.label}</span>
          </span>
          <ChevronRight className={styles.chevron} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

/** The day at a glance: on a phone one column; on a desktop the training on the left, the rest beside it. */
export default function Today() {
  const uiCopy = useUiCopy();
  const { mode } = useWorkspace();
  const [date] = useState(() => day(new Date()));
  return (
    <div className={styles.page}>
      <PageHeader
        title={uiCopy["ui"]["Today"]}
        description={new Date().toLocaleDateString([], {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />
      {mode === "coach" && <CoachSummary />}
      <div className={styles.board}>
        <div className={styles.main}>
          <Workouts active date={date} />
          <Workouts date={date} />
        </div>
        <div className={styles.side}>
          <CheckIns overdue />
          <CheckIns />
          <Week />
        </div>
      </div>
    </div>
  );
}
