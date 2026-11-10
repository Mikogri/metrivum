import { formatInterfaceText } from "~/shared/i18n/interface-format";
import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";

export const meta = () => privateMeta("Forms — Metrivum");

import {
  Archive,
  ArchiveRestore,
  ClipboardCheck,
  EyeOff,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Upload,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import {
  Badge,
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  LinkButton,
  EmptyState,
  Option,
  PageHeader,
  SearchInput,
  Select,
  Toolbar,
  toast,
} from "@metrivum/ui-web";
import { useDangerConfirm } from "~/shared/lib/useConfirm";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useAccessSnapshot } from "~/shared/access";
import { useCoachingMutation, useCoachingQuery, type Page } from "../api";
import {
  Failure,
  ListPagination,
  Loading,
  MutationError,
  StatusBadge,
} from "../components";
import { CardGrid, ListCard } from "~/shared/library/DataView";
import {
  LibraryViewToggle,
  useLibraryView,
} from "~/shared/library/LibraryViewToggle";
import styles from "../coaching.module.css";

function questionCount(form: Schema<"FormSummaryDto">) {
  const count = form.questionCount;
  return `${count} ${count === 1 ? "question" : "questions"}`;
}

/** Rough time to fill it in, worked out from its kinds of questions: under a minute, or whole minutes. */
function takes(form: Schema<"FormSummaryDto">) {
  const seconds = Number(form.estimatedSeconds ?? 0);
  if (!Number(form.questionCount)) return "—";
  return seconds < 50 ? "< 1 min" : `≈ ${Math.round(seconds / 60)} min`;
}

/** What a form is for, with its own colour and icon: an offer's application form, or a check-in. */
function kind(form: Schema<"FormSummaryDto">) {
  return form.purpose === "CheckIn"
    ? {
        label: "Check-in form",
        tone: "violet" as const,
        badge: "violet" as const,
        icon: <ClipboardCheck />,
      }
    : {
        label: "Offer application form",
        tone: "blue" as const,
        badge: "info" as const,
        icon: <FileText />,
      };
}

export default function Forms() {
  const uiCopy = useUiCopy();

  const [state, update] = useUrlState({
    purpose: "Application",
    q: "",
    page: "1",
    sort: "updated",
    archived: "false",
    create: "",
    view: "list",
  });
  const view = useLibraryView(state.view);
  const navigate = useNavigate();
  // Status changes from the list: publish, take out of use, archive, restore. Taking out of use and archiving ask first.
  const change = useCoachingMutation();
  const done: Record<string, string> = {
    publish: "Form published",
    unpublish: "Form unpublished",
    archive: "Form archived",
    restore: "Form restored",
  };
  const { ask, dialog: confirmDialog } = useDangerConfirm();
  const formAction = async (f: Schema<"FormSummaryDto">, action: string) => {
    if (action === "open") return navigate(`/app/forms/${f.id}`);
    if (
      action === "unpublish" &&
      !(await ask({
        title: `Unpublish ${f.name}?`,
        body: "It stops being used for anything new: no new check-ins or applications with it until you publish it again. Answers already given stay.",
        confirmLabel: uiCopy["ui"]["Unpublish"],
        cancelLabel: uiCopy["ui"]["Keep published"],
      }))
    )
      return;
    if (
      action === "archive" &&
      !(await ask({
        title: `Archive ${f.name}?`,
        body: "It leaves your forms and can't be used until restored.",
        confirmLabel: uiCopy["ui"]["Archive form"],
        cancelLabel: uiCopy["ui"]["Keep form"],
      }))
    )
      return;
    change.mutate(
      {
        method: "POST",
        path: `/api/v1/forms/${f.id}/${action}`,
        ifMatch: f.version,
      },
      {
        onSuccess: () =>
          toast({ tone: "success", title: done[action] ?? "Form updated" }),
      },
    );
  };
  const formMenu = (f: Schema<"FormSummaryDto">) => (
    <DropdownMenuTrigger>
      <IconButton
        size="sm"
        variant="ghost"
        label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [f.name])}
        icon={<MoreHorizontal />}
        isDisabled={change.isPending}
      />
      <DropdownMenu
        aria-label={formatInterfaceText(uiCopy["ui"]["Actions for {0}"], [
          f.name,
        ])}
        onAction={(key) => void formAction(f, String(key))}
      >
        <DropdownMenuItem id="open" icon={<Pencil />}>
          {uiCopy["common"]["open"]}
        </DropdownMenuItem>
        {!f.archived ? (
          f.currentPublishedVersionId ? (
            <DropdownMenuItem id="unpublish" icon={<EyeOff />}>
              {uiCopy["ui"]["Unpublish"]}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem id="publish" icon={<Upload />}>
              {uiCopy["ui"]["Publish"]}
            </DropdownMenuItem>
          )
        ) : null}
        <DropdownMenuSeparator />
        {f.archived ? (
          <DropdownMenuItem id="restore" icon={<ArchiveRestore />}>
            {uiCopy["common"]["restore"]}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem id="archive" tone="danger" icon={<Archive />}>
            {uiCopy["common"]["archive"]}
          </DropdownMenuItem>
        )}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
  const access = useAccessSnapshot();
  const purpose = state.purpose === "CheckIn" ? "CheckIn" : "Application";
  const allowed =
    access.data?.features.some(
      (f) =>
        f.key ===
          (purpose === "Application"
            ? "forms.application.manage"
            : "forms.checkin.manage") && f.available,
    ) === true;
  const createHref = `/app/forms/new?purpose=${purpose}`;
  const list = useCoachingQuery<Page<Schema<"FormSummaryDto">>>(
    "/api/v1/forms/summaries",
    {
      purpose,
      search: state.q || undefined,
      sort: state.sort,
      archived: state.archived === "true",
      page: pageFromParam(state.page),
      pageSize: 20,
    },
    allowed,
  );
  // Older links open the builder screen directly.
  if (state.create === "1") return <Navigate to={createHref} replace />;
  return (
    <>
      <PageHeader
        title={uiCopy["ui"]["Forms"]}
        description={
          uiCopy["ui"][
            "Create application questionnaires and recurring check-in forms."
          ]
        }
        actions={
          allowed && (
            <LinkButton
              href={createHref}
              variant="primary"
              iconStart={<Plus />}
            >
              {uiCopy["ui"]["Create form"]}
            </LinkButton>
          )
        }
      />
      <Toolbar
        aria-label={uiCopy["ui"]["Filter forms"]}
        className={styles.toolbar}
      >
        <Select
          aria-label={uiCopy["ui"]["Form purpose"]}
          selectedKey={purpose}
          onSelectionChange={(key) => update({ purpose: String(key) })}
        >
          <Option id="Application">
            {uiCopy["access"]["features"]["forms.application.manage"]}
          </Option>
          <Option id="CheckIn">
            {uiCopy["access"]["features"]["forms.checkin.manage"]}
          </Option>
        </Select>
        <SearchInput
          aria-label={uiCopy["ui"]["Search forms"]}
          value={state.q}
          onChange={(q) => update({ q })}
          placeholder={uiCopy["ui"]["Find a form"]}
        />
        <Select
          aria-label={uiCopy["ui"]["Sort forms"]}
          selectedKey={state.sort}
          onSelectionChange={(key) => update({ sort: String(key) })}
        >
          <Option id="updated">
            {uiCopy["training"]["library"]["sort"]["updated"]}
          </Option>
          <Option id="name">{uiCopy["video"]["list"]["sort"]["name"]}</Option>
        </Select>
        <Select
          aria-label={uiCopy["ui"]["Form visibility"]}
          selectedKey={state.archived}
          onSelectionChange={(key) => update({ archived: String(key) })}
        >
          <Option id="false">{uiCopy["ui"]["Current forms"]}</Option>
          <Option id="true">{uiCopy["ui"]["Archived forms"]}</Option>
        </Select>
        <LibraryViewToggle
          value={view === "cards" ? "cards" : "list"}
          onChange={(view) => update({ view, page: state.page })}
        />
      </Toolbar>
      <MutationError error={change.error} />
      {confirmDialog}
      {access.isPending ? (
        <Loading />
      ) : !allowed ? (
        <EmptyState
          title={uiCopy["ui"]["Form management is unavailable"]}
          description={
            uiCopy["ui"][
              "Your current account needs access to manage this type of form."
            ]
          }
        />
      ) : list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <Failure error={list.error} retry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        <EmptyState
          title={
            state.archived === "true"
              ? uiCopy["ui"]["No archived forms"]
              : state.q
                ? uiCopy["ui"]["No matching forms"]
                : uiCopy["ui"]["Build your first form"]
          }
          description={
            state.archived === "true"
              ? uiCopy["ui"][
                  "Archived forms appear here and can be restored anytime."
                ]
              : uiCopy["ui"][
                  "Start with a few questions. Publish when it is ready to use in an offer or check-in."
                ]
          }
          actions={
            <LinkButton
              href={createHref}
              variant="primary"
              iconStart={<Plus />}
            >
              {uiCopy["ui"]["Create form"]}
            </LinkButton>
          }
        />
      ) : (
        <>
          {view === "cards" ? (
            <CardGrid label={uiCopy["ui"]["Forms"]}>
              {list.data.items.map((f) => (
                <ListCard
                  key={f.id}
                  href={`/app/forms/${f.id}`}
                  title={f.name}
                  subtitle={kind(f).label}
                  icon={kind(f).icon}
                  tone={kind(f).tone}
                  menu={formMenu(f)}
                  status={
                    <StatusBadge
                      status={
                        f.archived
                          ? "Archived"
                          : f.currentPublishedVersionId
                            ? "Published"
                            : "Draft"
                      }
                    />
                  }
                  details={[
                    { label: uiCopy["ui"]["Length"], value: questionCount(f) },
                    { label: uiCopy["ui"]["Takes"], value: takes(f) },
                    {
                      label: uiCopy["ui"]["Used for"],
                      value:
                        f.purpose === "CheckIn" ? "Check-ins" : "Applications",
                    },
                    {
                      label:
                        uiCopy["training"]["library"]["columns"]["updated"],
                      value: new Date(f.updatedAt).toLocaleDateString([], {
                        dateStyle: "medium",
                      }),
                    },
                  ]}
                />
              ))}
            </CardGrid>
          ) : (
            <DataTable
              label={uiCopy["ui"]["Forms"]}
              rows={list.data.items}
              rowKey={(f) => f.id}
              columns={[
                {
                  id: "name",
                  header: "Form",
                  cell: (f) => (
                    <Link data-row-link to={`/app/forms/${f.id}`}>
                      {f.name}
                    </Link>
                  ),
                },
                {
                  id: "type",
                  header: "Type",
                  cell: (f) => (
                    <Badge tone={kind(f).badge} icon={kind(f).icon}>
                      {kind(f).label}
                    </Badge>
                  ),
                },
                {
                  id: "description",
                  header: "Description",
                  cell: (f) => f.description,
                  muted: true,
                  hideOnMobile: true,
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (f) => (
                    <StatusBadge
                      status={
                        f.archived
                          ? "Archived"
                          : f.currentPublishedVersionId
                            ? "Published"
                            : "Draft"
                      }
                    />
                  ),
                },
                {
                  id: "updated",
                  header: "Updated",
                  cell: (f) => new Date(f.updatedAt).toLocaleDateString(),
                  hideOnMobile: true,
                },
                {
                  id: "actions",
                  header: (
                    <span className="tf-visually-hidden">
                      {uiCopy["editor"]["sheet"]["contextLabel"]}
                    </span>
                  ),
                  width: "3.5rem",
                  align: "end",
                  cell: (f) => formMenu(f),
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
      {access.isError && (
        <Button onPress={() => void access.refetch()}>
          {uiCopy["ui"]["Retry access check"]}
        </Button>
      )}
    </>
  );
}
