import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("My training — Metrivum");

import { useWorkspace } from "~/shared/session/WorkspaceScope";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  type BadgeTone,
  Tab,
  TabList,
  Tabs,
  TextField,
  Toolbar,
  Select,
  Option,
  useMobileLayout,
} from "@metrivum/ui-web";
import { useCoachingQuery, type Page } from "~/modules/coaching";
import { Failure, ListPagination, Loading } from "~/modules/coaching";
import { AssignmentList, localDate } from "./Assignments";
import { TrainingProgress } from "./Progress";
import { TrainingPlansTab } from "../purchases/TrainingPlans";
import { MobileTraining } from "./MobileTraining";
import {
  LibraryViewToggle,
  type LibraryView,
} from "~/shared/library/LibraryViewToggle";
import { CalendarDays, Clock, Dumbbell, MessageSquare } from "lucide-react";
import styles from "./delivery.module.css";

/** "Mon, 27 Oct" for a plain date. */
const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const minutes = (seconds: number | null) =>
  seconds == null ? null : `${Math.max(1, Math.round(seconds / 60))} min`;
/** A workout's status in colour: done green, missed red, in progress accent, the rest neutral. */
export function WorkoutStatus({ status }: { status: string }) {
  const uiCopy = useUiCopy();
  const tone: BadgeTone =
    status === "Completed"
      ? "success"
      : status === "Missed"
        ? "danger"
        : status === "InProgress"
          ? "accent"
          : "neutral";
  const label = status === "InProgress" ? uiCopy["ui"]["In progress"] : status;
  return (
    <Badge dot tone={tone}>
      {label}
    </Badge>
  );
}
const statusOf = (item: Occurrence) => <WorkoutStatus status={item.status} />;
const VIEW_KEY = "tf.training.scheduleView";

/** Workouts as cards: the date block, the workout and program, what was logged and its status. */
function WorkoutCards({
  items,
  coach,
}: {
  items: Occurrence[];
  coach: boolean;
}) {
  const uiCopy = useUiCopy();

  return (
    <ul className={styles.workoutCards} aria-label={uiCopy["ui"]["Workouts"]}>
      {items.map((item) => {
        const date = new Date(`${item.scheduledDate}T00:00:00`);
        return (
          <li key={item.id}>
            <Link
              className={styles.workoutCard}
              data-status={item.status}
              to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}
            >
              <span className={styles.workoutCardDate}>
                <strong>{date.getDate()}</strong>
                <span>
                  {date.toLocaleDateString(undefined, { month: "short" })}
                </span>
                <small>
                  {date.toLocaleDateString(undefined, { weekday: "short" })}
                </small>
              </span>
              <span className={styles.workoutCardBody}>
                <strong>{item.name}</strong>
                <span className={styles.workoutCardProgram}>
                  {item.programName}
                </span>
                <span className={styles.workoutCardMeta}>
                  {item.exerciseCount != null ? (
                    <span>
                      <Dumbbell aria-hidden="true" />
                      {item.exerciseCount} {uiCopy["ui"]["exercises"]}
                    </span>
                  ) : null}
                  {item.performedDate ? (
                    <span>
                      <CalendarDays aria-hidden="true" />
                      {uiCopy["dashboard"]["discovery"]["done"]}{" "}
                      {dayLabel(item.performedDate)}
                    </span>
                  ) : null}
                  {minutes(item.durationSeconds) ? (
                    <span>
                      <Clock aria-hidden="true" />
                      {minutes(item.durationSeconds)}
                    </span>
                  ) : null}
                  {item.hasComment ? (
                    <span>
                      <MessageSquare aria-hidden="true" />
                      {uiCopy["video"]["new"]["note"]}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className={styles.workoutCardStatus}>
                {statusOf(item)}
                {coach && item.loggedLate ? (
                  <small>{uiCopy["ui"]["Logged late"]}</small>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface Occurrence {
  plannedSets?: number | null;
  performedSets?: number | null;
  completedAt?: string | null;
  sessionRpe?: number | null;
  rating?: number | null;
  exerciseCount?: number | null;
  revisionId: string;
  blockId: string;
  cycleId: string;
  performedDate: string | null;
  durationSeconds: number | null;
  hasComment: boolean;
  id: string;
  assignmentId: string;
  relationshipId: string;
  programId: string;
  programName: string;
  name: string;
  scheduledDate: string;
  deadline: string;
  status: string;
  executionId: string | null;
  loggedLate: boolean;
  allowedActions: string[];
}
/** How much of a logged workout was done: a bar and "11/12 sets · 92%". Nothing for workouts not logged. */
export function completionOf(
  item: Pick<Occurrence, "plannedSets" | "performedSets">,
) {
  if (item.performedSets == null || !item.plannedSets) return null;
  return Math.round(Math.min(1, item.performedSets / item.plannedSets) * 100);
}

export function CompletionCell({ item }: { item: Occurrence }) {
  const uiCopy = useUiCopy();

  const percent = completionOf(item);
  if (percent == null) return <span className={styles.completionNone}>—</span>;
  // The colour moves smoothly from red (nothing done) to green (all of it).
  const color = `color-mix(in oklab, var(--tf-color-success) ${percent}%, var(--tf-color-danger))`;
  return (
    <span
      className={styles.completion}
      style={{ "--done": color } as React.CSSProperties}
      title={formatInterfaceText(uiCopy["ui"]["{0} of {1} sets done"], [
        item.performedSets,
        item.plannedSets,
      ])}
    >
      <span className={styles.completionBar}>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </span>
      <span className={styles.completionText}>
        <b style={{ color }}>{percent}%</b> {item.performedSets}/
        {item.plannedSets} {uiCopy["ui"]["sets"]}
      </span>
    </span>
  );
}

/** "4 Nov, 08:12" for when a workout was finished. */
export const completedLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function MobileWorkoutRows({
  items,
  coach = false,
  onOpen,
}: {
  items: Occurrence[];
  coach?: boolean;
  onOpen?: (id: string) => void;
}) {
  const uiCopy = useUiCopy();

  return (
    <ul className={styles.rows} aria-label={uiCopy["ui"]["Workouts"]}>
      {items.map((item) => {
        const content = (
          <>
            <span className={styles.itemMain}>
              <strong>{item.name}</strong>
              <span className={styles.itemMeta}>
                {item.programName} · {item.scheduledDate}
                {item.exerciseCount != null
                  ? ` · ${item.exerciseCount} exercises`
                  : ""}
              </span>
              {completionOf(item) != null ? (
                <span className={styles.itemMeta}>
                  {completionOf(item)}
                  {uiCopy["ui"]["% done ·"]} {item.performedSets}/
                  {item.plannedSets} {uiCopy["ui"]["sets"]}
                  {item.completedAt
                    ? ` · ${completedLabel(item.completedAt)}`
                    : ""}
                </span>
              ) : null}
              {coach && item.loggedLate && (
                <span className={styles.itemMeta}>
                  {uiCopy["ui"]["Logged late"]}
                </span>
              )}
            </span>
            <WorkoutStatus status={item.status} />
          </>
        );
        return (
          <li key={item.id}>
            {onOpen ? (
              <button
                type="button"
                className={styles.workoutRow}
                data-status={item.status}
                onClick={() => onOpen(item.id)}
              >
                {content}
              </button>
            ) : (
              <Link
                className={styles.workoutRow}
                data-status={item.status}
                to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
export function TrainingSchedule({
  relationshipId,
  programId,
  coach = false,
}: {
  relationshipId?: string;
  programId?: string;
  coach?: boolean;
}) {
  const uiCopy = useUiCopy();

  const mobile = useMobileLayout();
  const [from, setFrom] = useState(() =>
    localDate(new Date(Date.now() - (mobile ? 30 : 7) * 86400000)),
  );
  const [to, setTo] = useState(() =>
    localDate(new Date(Date.now() + 30 * 86400000)),
  );
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const { mode } = useWorkspace();
  // List or cards, remembered in this browser.
  const [view, setViewState] = useState<LibraryView>(() => {
    try {
      return window.localStorage.getItem(VIEW_KEY) === "cards"
        ? "cards"
        : "list";
    } catch {
      return "list";
    }
  });
  const setView = (next: LibraryView) => {
    setViewState(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };
  const query = useCoachingQuery<Page<Occurrence>>(
    "/api/v1/training/schedule",
    {
      relationshipId,
      programId,
      from,
      to,
      status: status || undefined,
      page,
      pageSize: 30,
      view: mode,
    },
  );
  return (
    <section
      className={styles.stack}
      aria-label={uiCopy["ui"]["Workout schedule and history"]}
    >
      <Toolbar
        aria-label={uiCopy["ui"]["Schedule filters"]}
        className={styles.filters}
      >
        <span className={styles.range}>
          <TextField
            aria-label={uiCopy["editor"]["panel"]["loadMin"]}
            type="date"
            value={from}
            onChange={(value) => {
              setFrom(value);
              setPage(1);
            }}
          />
          <span aria-hidden="true">–</span>
          <TextField
            aria-label={uiCopy["ui"]["Through"]}
            type="date"
            value={to}
            onChange={(value) => {
              setTo(value);
              setPage(1);
            }}
          />
        </span>
        <Select
          aria-label={uiCopy["ui"]["Workout status"]}
          selectedKey={status || "all"}
          onSelectionChange={(key) => {
            setStatus(key === "all" ? "" : String(key));
            setPage(1);
          }}
        >
          <Option id="all">{uiCopy["ui"]["All statuses"]}</Option>
          {["Scheduled", "InProgress", "Completed", "Skipped", "Missed"].map(
            (value) => (
              <Option key={value} id={value}>
                {value === "InProgress" ? uiCopy["ui"]["In progress"] : value}
              </Option>
            ),
          )}
        </Select>
        <Button
          variant="ghost"
          onPress={() => {
            setFrom(localDate());
            setTo(localDate());
            setPage(1);
          }}
        >
          {uiCopy["ui"]["Today"]}
        </Button>
        {!mobile ? (
          <span className={styles.viewToggle}>
            <LibraryViewToggle value={view} onChange={setView} />
          </span>
        ) : null}
      </Toolbar>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <EmptyState
          title={uiCopy["ui"]["No workouts in this period"]}
          description={
            uiCopy["ui"][
              "Change the date range or ask your coach to assign an applied program."
            ]
          }
        />
      ) : (
        <>
          {mobile ? (
            <MobileWorkoutRows items={query.data.items} coach={coach} />
          ) : view === "cards" ? (
            <WorkoutCards items={query.data.items} coach={coach} />
          ) : (
            <DataTable
              label={uiCopy["ui"]["Workouts"]}
              rows={query.data.items}
              rowKey={(item) => item.id}
              className={styles.scheduleTable}
              columns={[
                {
                  id: "scheduled",
                  header: "Date",
                  width: "8.5rem",
                  cell: (item) => (
                    <span className={styles.scheduleDate}>
                      {dayLabel(item.scheduledDate)}
                    </span>
                  ),
                },
                {
                  id: "workout",
                  header: "Workout",
                  cell: (item) => (
                    <Link
                      data-row-link
                      className={styles.rowLink}
                      to={`/app/${coach ? "training" : "my-training"}/workouts/${item.id}`}
                    >
                      <span>{item.name}</span>
                      <small>{item.programName}</small>
                    </Link>
                  ),
                },
                {
                  id: "completion",
                  header: "Completion",
                  width: "10rem",
                  hideOnMobile: true,
                  cell: (item) => <CompletionCell item={item} />,
                },
                {
                  id: "performed",
                  header: "Completed",
                  width: "10rem",
                  hideOnMobile: true,
                  muted: true,
                  cell: (item) =>
                    item.completedAt
                      ? completedLabel(item.completedAt)
                      : item.performedDate
                        ? dayLabel(item.performedDate)
                        : "—",
                },
                {
                  id: "duration",
                  header: "Time",
                  width: "6rem",
                  hideOnMobile: true,
                  muted: true,
                  cell: (item) => minutes(item.durationSeconds) ?? "—",
                },
                {
                  id: "status",
                  header: "Status",
                  width: "9.5rem",
                  cell: (item) => (
                    <span className={styles.scheduleStatus}>
                      {statusOf(item)}
                      {coach && item.loggedLate ? (
                        <small>{uiCopy["ui"]["Logged late"]}</small>
                      ) : null}
                    </span>
                  ),
                },
              ]}
            />
          )}
          <p className={styles.hint}>
            {
              uiCopy["ui"][
                "Dates follow each assignment’s time zone. You can still log a missed workout later."
              ]
            }
          </p>
          {Number(query.data.total) > Number(query.data.pageSize) ? (
            <ListPagination data={query.data} onChange={setPage} />
          ) : null}
        </>
      )}
    </section>
  );
}
export function RelationshipTraining({
  relationshipId,
  teamId,
}: {
  relationshipId: string;
  teamId?: string | null;
}) {
  return (
    <div className={styles.stack}>
      <AssignmentList
        relationshipId={relationshipId}
        assign={{ relationshipId, teamId }}
      />
      <TrainingSchedule relationshipId={relationshipId} coach />
    </div>
  );
}
export default function TrainingHome() {
  const uiCopy = useUiCopy();

  const [params, setParams] = useSearchParams();
  const mobile = useMobileLayout();
  const tab = ["schedule", "plans", "progress", "history"].includes(
    params.get("tab") ?? "",
  )
    ? params.get("tab")!
    : "schedule";
  // The tab lives in the URL (links can open "Training plans" directly) but replaces history, so Back leaves the page.
  const setTab = (next: string) =>
    setParams(
      (previous) => {
        const url = new URLSearchParams(previous);
        if (next === "schedule") url.delete("tab");
        else url.set("tab", next);
        return url;
      },
      { replace: true },
    );
  const relationshipId = params.get("relationshipId") || undefined;
  const programId = params.get("programId") || undefined;
  if (mobile) return <MobileTraining />;
  return (
    <>
      <PageHeader
        title={uiCopy["profile"]["completeItems"]["training"]}
        description={
          uiCopy["ui"]["Your workouts, training plans and progress."]
        }
      />
      <div className={styles.stack}>
        <Tabs
          selectedKey={tab === "history" ? "schedule" : tab}
          onSelectionChange={(key) => setTab(String(key))}
        >
          <TabList aria-label={uiCopy["ui"]["Training views"]}>
            <Tab id="schedule">{uiCopy["ui"]["Schedule & history"]}</Tab>
            <Tab id="plans">{uiCopy["ui"]["Training plans"]}</Tab>
            <Tab id="progress">
              {uiCopy["editor"]["sheet"]["progression"]["kind"]}
            </Tab>
          </TabList>
        </Tabs>
        {tab === "schedule" || tab === "history" ? (
          <TrainingSchedule
            relationshipId={relationshipId}
            programId={programId}
          />
        ) : tab === "plans" ? (
          <TrainingPlansTab relationshipId={relationshipId} />
        ) : (
          <TrainingProgress relationshipId={relationshipId} />
        )}
      </div>
    </>
  );
}
