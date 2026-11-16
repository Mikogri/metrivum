import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarDays, Dumbbell, Play } from "lucide-react";
import {
  EmptyState,
  Option,
  PageHeader,
  Segment,
  SegmentedControl,
  Select,
  Tab,
  TabList,
  Tabs,
} from "@portable-ui/react";
import {
  Failure,
  Loading,
  useCoachingQuery,
  type Page,
} from "~/modules/coaching";
import { localDate, type Assignment } from "./Assignments";
import { TrainingProgress } from "./Progress";
import { TrainingPlansTab } from "../purchases/TrainingPlans";
import {
  MobileWorkoutRows,
  TrainingSchedule,
  type Occurrence,
} from "./TrainingHome";
import styles from "./delivery.module.css";

type View = "upcoming" | "plan" | "all";
const DAY = 86_400_000;
const plusDays = (days: number, from = new Date()) =>
  localDate(new Date(from.valueOf() + days * DAY));
const sortByDate = (a: Occurrence, b: Occurrence) =>
  a.scheduledDate.localeCompare(b.scheduledDate);

/** Every workout of one query range, all pages (the schedule pages by 100). */
function useWorkouts(
  query: Record<string, string | undefined>,
  enabled = true,
) {
  return useCoachingQuery<Page<Occurrence>>(
    "/api/v1/training/schedule",
    { ...query, page: 1, pageSize: 100, view: "client" },
    enabled,
  );
}

/**
 * The client's training on a phone, in three tabs: what's next (the next workout big, then the ones after it), the
 * whole current plan week by week, and every workout (history and future, with filters and progress).
 */
export function MobileTraining() {
  const uiCopy = useUiCopy();
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view: View =
    raw === "plan" || raw === "all"
      ? raw
      : params.get("tab") === "history"
        ? "all"
        : params.get("tab") === "plans"
          ? "plan"
          : "upcoming";
  const setView = (next: View) =>
    setParams(
      (previous) => {
        const url = new URLSearchParams(previous);
        url.delete("tab");
        if (next === "upcoming") url.delete("view");
        else url.set("view", next);
        return url;
      },
      { replace: true },
    );
  return (
    <>
      <PageHeader title={uiCopy["ui"]["Training"]} />
      <div className={styles.stack}>
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => setView(String(key) as View)}
        >
          <TabList
            aria-label={uiCopy["ui"]["Training views"]}
            className={styles.mobileTabs}
          >
            <Tab id="upcoming">{uiCopy["ui"]["Upcoming"]}</Tab>
            <Tab id="plan">{uiCopy["ui"]["Whole plan"]}</Tab>
            <Tab id="all">{uiCopy["ui"]["All workouts"]}</Tab>
          </TabList>
        </Tabs>
        <div key={view} className={styles.mobileView}>
          {view === "upcoming" ? (
            <Upcoming />
          ) : view === "plan" ? (
            <WholePlan />
          ) : (
            <AllWorkouts />
          )}
        </div>
      </div>
    </>
  );
}

/** "Today", "Tomorrow" or "Mon, 27 Oct". */
function useDayName() {
  const uiCopy = useUiCopy();
  return (iso: string) => {
    if (iso === localDate()) return uiCopy["ui"]["Today"];
    if (iso === plusDays(1)) return uiCopy["ui"]["Tomorrow"];
    return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  };
}

function Upcoming() {
  const uiCopy = useUiCopy();
  const dayName = useDayName();
  // A started workout and anything from a week ago that is still open come first; then the next six weeks.
  const query = useWorkouts({ from: plusDays(-7), to: plusDays(42) });
  if (query.isPending) return <Loading />;
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const today = localDate();
  const open = query.data.items
    .filter(
      (item) =>
        item.status === "InProgress" ||
        (item.status === "Scheduled" && item.scheduledDate >= today),
    )
    .sort((a, b) =>
      a.status === "InProgress"
        ? -1
        : b.status === "InProgress"
          ? 1
          : sortByDate(a, b),
    );
  const [next, ...later] = open;
  if (!next)
    return (
      <EmptyState
        icon={<CalendarDays />}
        title={uiCopy["ui"]["No upcoming workouts"]}
        description={
          uiCopy["ui"][
            "When your coach assigns a program, your next workouts show up here."
          ]
        }
      />
    );
  const started = next.status === "InProgress";
  return (
    <>
      <Link
        to={`/app/my-training/workouts/${next.id}`}
        className={styles.nextWorkout}
        data-started={started || undefined}
      >
        <span className={styles.nextLabel}>
          {started ? uiCopy["ui"]["In progress"] : uiCopy["ui"]["Next workout"]}{" "}
          · {dayName(next.scheduledDate)}
        </span>
        <strong className={styles.nextName}>{next.name}</strong>
        <span className={styles.nextMeta}>
          {next.programName}
          {next.exerciseCount != null ? (
            <>
              {" "}
              · <Dumbbell aria-hidden="true" /> {next.exerciseCount}{" "}
              {uiCopy["ui"]["exercises"]}
            </>
          ) : null}
        </span>
        <span className={styles.nextAction}>
          <Play aria-hidden="true" />
          {started
            ? uiCopy["ui"]["Continue workout"]
            : uiCopy["ui"]["Open workout"]}
        </span>
      </Link>
      {later.length ? (
        <section
          className={styles.mobileSection}
          aria-label={uiCopy["ui"]["Coming up"]}
        >
          <h2>{uiCopy["ui"]["Coming up"]}</h2>
          <MobileWorkoutRows items={later.slice(0, 20)} />
        </section>
      ) : null}
    </>
  );
}

function WholePlan() {
  const uiCopy = useUiCopy();
  const assignments = useCoachingQuery<Page<Assignment>>(
    "/api/v1/training/assignments",
    { page: 1, pageSize: 20, view: "client" },
  );
  const active = (assignments.data?.items ?? []).filter(
    (item) => item.status === "Active" || item.status === "Paused",
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const current = active.find((item) => item.id === chosen) ?? active[0];
  const workouts = useWorkouts(
    {
      programId: current?.programId,
      relationshipId: current?.relationshipId,
      from: current?.startDate,
      to: current
        ? plusDays(730, new Date(`${current.startDate}T00:00:00`))
        : undefined,
    },
    Boolean(current),
  );
  // Week by week from the plan's start: "Week 1", "Week 2", …
  const weeks = useMemo(() => {
    if (!current || !workouts.data) return [];
    const start = new Date(`${current.startDate}T00:00:00`).valueOf();
    const groups = new Map<number, Occurrence[]>();
    for (const item of [...workouts.data.items]
      .filter((w) => w.assignmentId === current.id)
      .sort(sortByDate)) {
      const week =
        Math.floor(
          (new Date(`${item.scheduledDate}T00:00:00`).valueOf() - start) /
            (7 * DAY),
        ) + 1;
      groups.set(week, [...(groups.get(week) ?? []), item]);
    }
    return [...groups.entries()];
  }, [current, workouts.data]);
  if (assignments.isPending) return <Loading />;
  if (assignments.isError)
    return (
      <Failure
        error={assignments.error}
        retry={() => void assignments.refetch()}
      />
    );
  const all = weeks.flatMap(([, items]) => items);
  const done = all.filter((item) => item.status === "Completed").length;
  return (
    <>
      {!current ? (
        <EmptyState
          icon={<CalendarDays />}
          title={uiCopy["ui"]["No active plan"]}
          description={
            uiCopy["ui"]["Your coach has not assigned a program yet."]
          }
        />
      ) : (
        <>
          {active.length > 1 ? (
            <Select
              aria-label={uiCopy["ui"]["Assigned programs"]}
              selectedKey={current.id}
              onSelectionChange={(key) => setChosen(String(key))}
            >
              {active.map((item) => (
                <Option key={item.id} id={item.id}>
                  {item.programName}
                </Option>
              ))}
            </Select>
          ) : null}
          <section className={styles.planHead}>
            <strong>{current.programName}</strong>
            <span>
              {formatInterfaceText(uiCopy["ui"]["Started {0}"], [
                new Date(`${current.startDate}T00:00:00`).toLocaleDateString(
                  undefined,
                  { day: "numeric", month: "short", year: "numeric" },
                ),
              ])}
              {current.status === "Paused"
                ? ` · ${uiCopy["ui"]["Paused"]}`
                : ""}
            </span>
            {all.length ? (
              <>
                <span className={styles.planBar} aria-hidden="true">
                  <span style={{ transform: `scaleX(${done / all.length})` }} />
                </span>
                <span>
                  {formatInterfaceText(
                    uiCopy["ui"]["{0} of {1} workouts done"],
                    [done, all.length],
                  )}
                </span>
              </>
            ) : null}
          </section>
          {workouts.isPending ? (
            <Loading />
          ) : workouts.isError ? (
            <Failure
              error={workouts.error}
              retry={() => void workouts.refetch()}
            />
          ) : (
            weeks.map(([week, items]) => (
              <section key={week} className={styles.mobileSection}>
                <h2>
                  {formatInterfaceText(uiCopy["ui"]["Week {0}"], [week])}
                  <span>
                    {items.filter((item) => item.status === "Completed").length}
                    /{items.length}
                  </span>
                </h2>
                <MobileWorkoutRows items={items} />
              </section>
            ))
          )}
        </>
      )}
      <section className={styles.mobileSection}>
        <h2>{uiCopy["ui"]["Plans you own"]}</h2>
        <TrainingPlansTab />
      </section>
    </>
  );
}

function AllWorkouts() {
  const uiCopy = useUiCopy();
  const [params] = useSearchParams();
  const relationshipId = params.get("relationshipId") || undefined;
  const programId = params.get("programId") || undefined;
  const [show, setShow] = useState<"workouts" | "progress">(() =>
    params.get("historyView") === "progress" ? "progress" : "workouts",
  );
  return (
    <>
      <SegmentedControl
        aria-label={uiCopy["ui"]["History view"]}
        selectedKeys={[show]}
        onSelectionChange={(keys) =>
          setShow(([...keys][0] as "workouts" | "progress") ?? "workouts")
        }
      >
        <Segment id="workouts">{uiCopy["ui"]["Workouts"]}</Segment>
        <Segment id="progress">
          {uiCopy["editor"]["sheet"]["progression"]["kind"]}
        </Segment>
      </SegmentedControl>
      {show === "progress" ? (
        <TrainingProgress relationshipId={relationshipId} />
      ) : (
        <TrainingSchedule
          relationshipId={relationshipId}
          programId={programId}
        />
      )}
    </>
  );
}
