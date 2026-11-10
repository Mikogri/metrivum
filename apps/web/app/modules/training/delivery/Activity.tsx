import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useSearchParams } from "react-router";
import {
  DataTable,
  EmptyState,
  Option,
  Select,
  Toolbar,
  useMobileLayout,
} from "@metrivum/ui-web";
import { useT } from "~/shared/i18n/AppLocale";
import { PeriodFilter } from "~/shared/ui/PeriodFilter";
import { StatStrip, StatStripSkeleton } from "~/shared/ui/Panel";
import {
  useCoachingQuery,
  Failure,
  Loading,
  ListPagination,
  StatusBadge,
  type Page,
} from "~/modules/coaching";
import { localDate } from "./Assignments";
import {
  CompletionCell,
  MobileWorkoutRows,
  completedLabel,
  type Occurrence,
} from "./TrainingHome";
import type { ProgressData } from "./Progress";
import { WorkoutDetail } from "./WorkoutLog";
import styles from "./delivery.module.css";

/** "Mon, 27 Oct" for a plain date. */
const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export interface ActivityOptions {
  earliestDate?: string | null;
  programs: { id: string; name: string }[];
  structure: {
    blockId: string;
    cycleId: string;
    firstDate: string;
    lastDate: string;
  }[];
}
export function TrainingActivity({
  relationshipId,
}: {
  relationshipId: string;
}) {
  const m = useT();
  const mobile = useMobileLayout();
  const [params, setParams] = useSearchParams();
  const get = (name: string, fallback = "") =>
    params.get(`activity.${name}`) || fallback;
  const update = (values: Record<string, string>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!Object.hasOwn(values, "workout") && !Object.hasOwn(values, "page"))
          next.delete("activity.page");
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(`activity.${key}`, value);
          else next.delete(`activity.${key}`);
        }
        return next;
      },
      { replace: true },
    );
  const from = get("from", localDate(new Date(Date.now() - 29 * 86400000))),
    to = get("to", localDate());
  const programId = get("program"),
    blockId = get("block"),
    cycleId = get("cycle"),
    occurrence = get("workout");
  const filters = {
    relationshipId,
    from,
    to,
    programId: programId || undefined,
    blockId: blockId || undefined,
    cycleId: cycleId || undefined,
  };
  const list = useCoachingQuery<Page<Occurrence>>("/api/v1/training/schedule", {
    ...filters,
    status: get("status") || undefined,
    sort: get("sort", "latest"),
    page: Number(get("page", "1")),
    pageSize: 25,
  });
  const summary = useCoachingQuery<ProgressData>(
    "/api/v1/training/progress",
    filters,
  );
  const options = useCoachingQuery<ActivityOptions>(
    "/api/v1/training/activity-options",
    { relationshipId, programId: programId || undefined },
  );
  const blocks = [
    ...new Set(options.data?.structure.map((item) => item.blockId) ?? []),
  ];
  if (occurrence)
    return (
      <WorkoutDetail
        occurrenceId={occurrence}
        relationshipId={relationshipId}
        onBack={{
          label: m.common.back,
          onPress: () => update({ workout: "" }),
        }}
      />
    );
  const completed =
    summary.data?.programs.reduce(
      (count, program) => count + program.completed,
      0,
    ) ?? 0;
  return (
    <section className={styles.stack} aria-label={m["ui"]["Training activity"]}>
      <Toolbar
        aria-label={m["ui"]["Activity filters"]}
        className={styles.filters}
      >
        <PeriodFilter
          from={from}
          to={to}
          earliest={options.data?.earliestDate}
          onChange={(range) => update(range)}
        />
        <Select
          aria-label={m["ui"]["Program"]}
          selectedKey={programId || "all"}
          onSelectionChange={(key) =>
            update({
              program: key === "all" ? "" : String(key),
              block: "",
              cycle: "",
            })
          }
        >
          <Option id="all">{m["ui"]["All programs"]}</Option>
          {(options.data?.programs ?? []).map((p) => (
            <Option key={p.id} id={p.id}>
              {p.name}
            </Option>
          ))}
        </Select>
        {programId && (
          <Select
            aria-label={m["editor"]["sheet"]["blockLabel"]}
            selectedKey={blockId || "all"}
            onSelectionChange={(key) =>
              update({ block: key === "all" ? "" : String(key), cycle: "" })
            }
          >
            <Option id="all">{m["ui"]["All blocks"]}</Option>
            {blocks.map((id, i) => (
              <Option key={id} id={id}>
                {formatInterfaceText(m["ui"]["Block {0}"], [i + 1])}
              </Option>
            ))}
          </Select>
        )}
        {programId && (
          <Select
            aria-label={m["editor"]["sheet"]["cycleLabel"]}
            selectedKey={cycleId || "all"}
            onSelectionChange={(key) =>
              update({ cycle: key === "all" ? "" : String(key) })
            }
          >
            <Option id="all">{m["ui"]["All cycles"]}</Option>
            {(options.data?.structure ?? [])
              .filter((s) => !blockId || s.blockId === blockId)
              .map((s, i) => (
                <Option key={`${s.blockId}:${s.cycleId}`} id={s.cycleId}>
                  {formatInterfaceText(m["ui"]["Cycle {0} · {1}"], [
                    i + 1,
                    s.firstDate,
                  ])}
                </Option>
              ))}
          </Select>
        )}
        <Select
          aria-label={m["usage"]["colState"]}
          selectedKey={get("status") || "all"}
          onSelectionChange={(key) =>
            update({ status: key === "all" ? "" : String(key) })
          }
        >
          <Option id="all">{m["ui"]["All statuses"]}</Option>
          {["Scheduled", "InProgress", "Completed", "Skipped", "Missed"].map(
            (s) => (
              <Option key={s} id={s}>
                {s === "InProgress" ? m["ui"]["In progress"] : s}
              </Option>
            ),
          )}
        </Select>
        <Select
          aria-label={m["ui"]["Sort"]}
          selectedKey={get("sort", "latest")}
          onSelectionChange={(key) => update({ sort: String(key) })}
        >
          <Option id="latest">{m["ui"]["Latest first"]}</Option>
          <Option id="oldest">{m["ui"]["Oldest first"]}</Option>
        </Select>
      </Toolbar>
      {options.isError && <Failure error={options.error} />}
      {summary.isPending ? (
        <StatStripSkeleton
          labels={[
            "Scheduled",
            "Completed",
            "Missed",
            "Skipped",
            "Completion rate",
          ]}
        />
      ) : summary.isError ? (
        <Failure error={summary.error} />
      ) : (
        <StatStrip
          items={[
            { label: m["ui"]["Scheduled"], value: summary.data.planned },
            {
              label: m["video"]["detail"]["completed"],
              value: completed,
              tone: "accent",
            },
            {
              label: m["ui"]["Missed"],
              value: summary.data.missed,
              tone: summary.data.missed ? "warning" : "default",
            },
            { label: m["ui"]["Skipped"], value: summary.data.skipped },
            {
              label: m["ui"]["Completion rate"],
              value:
                summary.data.completionPercentage == null
                  ? "—"
                  : `${summary.data.completionPercentage}%`,
            },
          ]}
        />
      )}
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState
          title={m["ui"]["No workouts in this period"]}
          description={
            m["ui"][
              "Change filters or assign a program with applied changes from Overview."
            ]
          }
        />
      ) : (
        <>
          {mobile ? (
            <MobileWorkoutRows
              items={list.data.items}
              onOpen={(id) => update({ workout: id })}
            />
          ) : (
            <DataTable
              label={m["ui"]["Workouts"]}
              rows={list.data.items}
              rowKey={(item) => item.id}
              columns={[
                {
                  id: "workout",
                  header: "Workout",
                  width: "22%",
                  cell: (item) => (
                    <button
                      type="button"
                      data-row-link
                      className={styles.rowLink}
                      onClick={() => update({ workout: item.id })}
                    >
                      <span>{item.name}</span>
                    </button>
                  ),
                },
                {
                  id: "plan",
                  header: "Plan",
                  width: "16%",
                  muted: true,
                  cell: (item) => item.programName || "—",
                },
                {
                  id: "scheduled",
                  header: "Planned for",
                  muted: true,
                  cell: (item) => shortDay(item.scheduledDate),
                },
                {
                  id: "completion",
                  header: "Completion",
                  width: "9rem",
                  hideOnMobile: true,
                  cell: (item) => <CompletionCell item={item} />,
                },
                {
                  id: "performed",
                  header: "Completed",
                  hideOnMobile: true,
                  muted: true,
                  cell: (item) =>
                    item.completedAt
                      ? completedLabel(item.completedAt)
                      : item.performedDate
                        ? shortDay(item.performedDate)
                        : "—",
                },
                {
                  id: "duration",
                  header: "Time",
                  hideOnMobile: true,
                  align: "end",
                  muted: true,
                  cell: (item) =>
                    item.durationSeconds == null
                      ? "—"
                      : `${Math.round(item.durationSeconds / 60)} min`,
                },
                {
                  id: "feedback",
                  header: "Feedback",
                  hideOnMobile: true,
                  muted: true,
                  cell: (item) =>
                    item.sessionRpe != null || item.rating != null
                      ? [
                          item.rating != null && `${item.rating}/5`,
                          item.sessionRpe != null && `RPE ${item.sessionRpe}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "—",
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (item) => (
                    <span className={styles.scheduleStatus}>
                      <StatusBadge
                        status={
                          item.status === "InProgress"
                            ? "In progress"
                            : item.status
                        }
                      />
                      {item.loggedLate || item.hasComment ? (
                        <small>
                          {[
                            item.loggedLate && "Logged late",
                            item.hasComment && "Comment",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      ) : null}
                    </span>
                  ),
                },
              ]}
            />
          )}
          <ListPagination
            data={list.data}
            onChange={(page) => update({ page: String(page) })}
          />
        </>
      )}
    </section>
  );
}
