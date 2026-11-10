import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { ClipboardCheck, Plus } from "lucide-react";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import {
  AlertDialog,
  Button,
  DataTable,
  Dialog,
  EmptyState,
  Option,
  Select,
  TextField,
  Toolbar,
  useMobileLayout,
} from "@metrivum/ui-web";
import {
  Facts,
  Panel,
  PanelSkeleton,
  StatStrip,
  StatStripSkeleton,
  type Stat,
} from "~/shared/ui/Panel";
import { useFeatureAccess } from "~/shared/access";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading, StatusBadge } from "../components";
import { CheckInDetail } from "../routes/check-in";
import { ScheduleEditorPanel } from "../routes/schedule";
import { pageFromParam } from "~/shared/lib/useUrlState";
import { endExclusive, useClientDetailsUrl } from "./url";
import styles from "./client-details.module.css";

export function CheckInSummary({
  relationshipId,
  compact = false,
}: {
  relationshipId: string;
  compact?: boolean;
}) {
  const uiCopy = useUiCopy();

  const access = useFeatureAccess("checkins.review");
  const query = useCoachingQuery<Schema<"CheckInSummaryDto">>(
    `/api/v1/check-ins/relationships/${relationshipId}/summary`,
    undefined,
    access.allowed,
  );
  const { update } = useClientDetailsUrl();
  if (!access.allowed) return null;
  if (query.isPending)
    return compact ? (
      <PanelSkeleton title={uiCopy["ui"]["Check-ins"]} lines={4} />
    ) : (
      <StatStripSkeleton
        labels={["Awaiting review", "Overdue", "Submitted", "Reviewed"]}
      />
    );
  if (query.isError)
    return <Failure error={query.error} retry={() => void query.refetch()} />;
  const s = query.data;
  const stats: Stat[] = [
    {
      label: uiCopy["ui"]["Awaiting review"],
      value: s.awaitingReview,
      tone: Number(s.awaitingReview) > 0 ? "accent" : "default",
    },
    {
      label: uiCopy["ui"]["Overdue"],
      value: s.overdue,
      tone: Number(s.overdue) > 0 ? "warning" : "default",
    },
    { label: uiCopy["ui"]["Submitted"], value: s.submitted },
    { label: uiCopy["ui"]["Reviewed"], value: s.reviewed },
  ];
  if (!compact) return <StatStrip items={stats} />;
  return (
    <Panel
      title={uiCopy["ui"]["Check-ins"]}
      icon={<ClipboardCheck />}
      tone="violet"
      actions={
        <Button
          size="sm"
          variant="ghost"
          onPress={() => update({ tab: "check-ins" })}
        >
          {uiCopy["dashboard"]["viewAll"]}
        </Button>
      }
    >
      <Facts
        items={[
          { label: uiCopy["ui"]["Awaiting review"], value: s.awaitingReview },
          { label: uiCopy["ui"]["Overdue"], value: s.overdue },
          {
            label: uiCopy["ui"]["Latest"],
            value: s.lastCheckIn ? (
              <span className={styles.inline}>
                {s.lastCheckIn.scheduleName}
                <StatusBadge status={s.lastCheckIn.status} />
              </span>
            ) : (
              "No check-ins yet"
            ),
          },
          {
            label: uiCopy["ui"]["Next due"],
            value: s.nextDueAtUtc
              ? new Date(s.nextDueAtUtc).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : "Nothing scheduled",
          },
        ]}
      />
    </Panel>
  );
}
export function ClientCheckIns({
  relationshipId,
  active,
}: {
  relationshipId: string;
  active: boolean;
}) {
  const uiCopy = useUiCopy();

  const mobile = useMobileLayout();
  const { params, update } = useClientDetailsUrl();
  const review = useFeatureAccess("checkins.review");
  const manage = useFeatureAccess("checkins.schedules.manage");
  const selected = params.get("checkIn");
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const filter = (patch: Record<string, string | null>) =>
    update({ ...patch, ciPage: null });
  const query = useCoachingQuery<Page<Schema<"CheckInRequestDto">>>(
    "/api/v1/check-ins/requests",
    {
      role: "coach",
      relationshipId,
      page: pageFromParam(params.get("ciPage") ?? "1"),
      pageSize: 20,
      status: params.get("ciStatus") || undefined,
      sort: params.get("ciSort") || "latest",
      from: params.get("ciFrom") || undefined,
      to: endExclusive(params.get("ciTo")),
      formTemplateId: params.get("ciForm") || undefined,
      scheduleId: params.get("ciSchedule") || undefined,
    },
    review.allowed,
  );
  const forms = useCoachingQuery<Page<Schema<"FormTemplateDto">>>(
    "/api/v1/forms",
    { purpose: "CheckIn", pageSize: 100 },
    manage.allowed,
  );
  const schedules = useCoachingQuery<Page<Schema<"ScheduleDto">>>(
    "/api/v1/check-ins/schedules",
    { pageSize: 100, relationshipId },
    manage.allowed,
  );
  const close = () => {
    if (dirty) setDiscard(true);
    else update({ checkIn: null });
  };
  if (!review.allowed)
    return (
      <EmptyState title={uiCopy["ui"]["Check-in access is not available"]} />
    );
  const source = (r: Schema<"CheckInRequestDto">) =>
    r.assignmentSource === "Direct"
      ? "Direct assignment"
      : r.assignmentSource === "Group"
        ? r.assignmentGroups?.map((g) => g.name).join(", ") || "Group"
        : "Not recorded";
  const dateTime = (value: string) =>
    new Date(value).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  return (
    <div className={styles.stack}>
      <CheckInSummary relationshipId={relationshipId} />
      <Toolbar
        aria-label={uiCopy["ui"]["Check-in filters"]}
        className={styles.toolbar}
      >
        <Select
          aria-label={uiCopy["ui"]["Check-in status"]}
          selectedKey={params.get("ciStatus") || "all"}
          onSelectionChange={(key) =>
            filter({ ciStatus: key === "all" ? null : String(key) })
          }
        >
          <Option id="all">{uiCopy["ui"]["All statuses"]}</Option>
          {[
            "Scheduled",
            "Available",
            "Submitted",
            "Reviewed",
            "Overdue",
            "Cancelled",
          ].map((s) => (
            <Option key={s} id={s}>
              {s}
            </Option>
          ))}
        </Select>
        {manage.allowed && (
          <Select
            aria-label={uiCopy["ui"]["Check-in form"]}
            selectedKey={params.get("ciForm") || "all"}
            onSelectionChange={(key) =>
              filter({ ciForm: key === "all" ? null : String(key) })
            }
          >
            <Option id="all">{uiCopy["ui"]["All forms"]}</Option>
            {(forms.data?.items ?? []).map((f) => (
              <Option key={f.id} id={f.id}>
                {f.name}
              </Option>
            ))}
          </Select>
        )}
        {manage.allowed && (
          <Select
            aria-label={uiCopy["ui"]["Check-in schedule"]}
            selectedKey={params.get("ciSchedule") || "all"}
            onSelectionChange={(key) =>
              filter({ ciSchedule: key === "all" ? null : String(key) })
            }
          >
            <Option id="all">{uiCopy["ui"]["All schedules"]}</Option>
            {(schedules.data?.items ?? []).map((s) => (
              <Option key={s.id} id={s.id}>
                {s.name}
              </Option>
            ))}
          </Select>
        )}
        <span className={styles.range}>
          <TextField
            aria-label={uiCopy["editor"]["panel"]["loadMin"]}
            type="date"
            value={params.get("ciFrom") || ""}
            onChange={(value) => filter({ ciFrom: value })}
          />
          <span aria-hidden="true">–</span>
          <TextField
            aria-label={uiCopy["editor"]["panel"]["loadMax"]}
            type="date"
            value={params.get("ciTo") || ""}
            onChange={(value) => filter({ ciTo: value })}
          />
        </span>
        <Select
          aria-label={uiCopy["ui"]["Sort check-ins"]}
          selectedKey={params.get("ciSort") || "latest"}
          onSelectionChange={(key) => filter({ ciSort: String(key) })}
        >
          <Option id="latest">{uiCopy["ui"]["Latest"]}</Option>
          <Option id="due">{uiCopy["ui"]["Due date"]}</Option>
          <Option id="status">{uiCopy["usage"]["colState"]}</Option>
        </Select>
        <span className={styles.spacer} />
        {active && manage.allowed && (
          <Button
            variant="primary"
            iconStart={<Plus />}
            onPress={() => setAssigning(true)}
          >
            {uiCopy["ui"]["Assign check-in"]}
          </Button>
        )}
      </Toolbar>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.items.length ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title={uiCopy["ui"]["No check-ins"]}
          description={
            uiCopy["ui"]["No requests match this period and filters."]
          }
        />
      ) : (
        <>
          {mobile ? (
            <ul
              className={styles.rows}
              aria-label={uiCopy["ui"]["Client check-ins"]}
            >
              {query.data.items.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={styles.checkInRow}
                    onClick={() => update({ checkIn: r.id })}
                  >
                    <span className={styles.itemMain}>
                      <strong>{r.scheduleName}</strong>
                      <span className={styles.itemMeta}>
                        {uiCopy["ui"]["Due"]} {dateTime(r.dueAtUtc)}
                      </span>
                      <span className={styles.itemMeta}>{source(r)}</span>
                      {r.wasLate && (
                        <span className={styles.late}>
                          {uiCopy["ui"]["Submitted late"]}
                        </span>
                      )}
                    </span>
                    <StatusBadge status={r.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <DataTable
              label={uiCopy["ui"]["Client check-ins"]}
              rows={query.data.items}
              rowKey={(r) => r.id}
              columns={[
                {
                  id: "name",
                  header: "Check-in",
                  width: "28%",
                  cell: (r) => (
                    <button
                      type="button"
                      data-row-link
                      className={styles.rowButton}
                      onClick={() => update({ checkIn: r.id })}
                    >
                      <span className={styles.twoLine}>
                        <span>{r.scheduleName}</span>
                        <small>{source(r)}</small>
                      </span>
                    </button>
                  ),
                },
                {
                  id: "available",
                  header: "Available",
                  hideOnMobile: true,
                  cell: (r) => new Date(r.availableAtUtc).toLocaleDateString(),
                },
                { id: "due", header: "Due", cell: (r) => dateTime(r.dueAtUtc) },
                {
                  id: "submitted",
                  header: "Submitted",
                  hideOnMobile: true,
                  cell: (r) =>
                    r.submittedAt ? (
                      <>
                        {dateTime(r.submittedAt)}
                        {r.wasLate ? (
                          <span className={styles.late}>
                            {" "}
                            {uiCopy["ui"]["· late"]}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className={styles.muted}>—</span>
                    ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (r) => <StatusBadge status={r.status} />,
                },
              ]}
            />
          )}
          {Number(query.data.total) > Number(query.data.pageSize) ? (
            <ListPagination
              data={query.data}
              onChange={(page) => update({ ciPage: String(page) })}
            />
          ) : null}
        </>
      )}
      <ScheduleEditorPanel
        isOpen={assigning}
        seed={{ relationshipId }}
        onClose={() => setAssigning(false)}
      />
      {selected && (
        <Dialog
          isOpen
          placement="right"
          size="lg"
          title={uiCopy["ui"]["Check-in details"]}
          onOpenChange={(open) => {
            if (!open) close();
          }}
        >
          <CheckInDetail
            key={selected}
            requestId={selected}
            relationshipId={relationshipId}
            embedded
            onDirtyChange={setDirty}
          />
        </Dialog>
      )}
      <AlertDialog
        isOpen={discard}
        onOpenChange={setDiscard}
        title={uiCopy["ui"]["Discard unsaved review?"]}
        confirmLabel={uiCopy["common"]["discard"]}
        cancelLabel={uiCopy["common"]["keepEditing"]}
        onConfirm={() => {
          setDirty(false);
          setDiscard(false);
          update({ checkIn: null });
        }}
      >
        {uiCopy["ui"]["Your review has not been saved."]}
      </AlertDialog>
    </div>
  );
}
