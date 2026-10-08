import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Film, GitCompare, Plus, SearchX, Trash2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import type { MediaDto } from "@trainflow/api-client-web";
import { AlertDialog, Badge, Button, DataTable, EmptyState, ErrorState, IconButton, LinkButton, LoadingState, Option, PageHeader, Pagination, SearchInput, Select, Tab, TabList, TabPanel, Tabs, TextField, Toolbar, toast } from "@trainflow/ui-web";
import { LockedReason, useFeatures } from "~/shared/access";
import { formatBytes, formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { useErrorToast } from "~/shared/lib/useErrorToast";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { deleteMedia } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalysisList, useMediaList, videoKeys } from "../queries";
import styles from "./analyses.module.css";
import { privateMeta } from "~/shared/i18n/site";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

export const meta = () => privateMeta("Video analyses — TrainFlow");

const DEFAULTS = { tab: "analyses", q: "", status: "", tag: "", sort: "newest", page: "1" };

function Videos() {
  const m = useT();
  const t = m.video.list;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const queryClient = useQueryClient();
  const showError = useErrorToast();
  const access = useFeatures(["video.library.manage"] as const);
  const [page, setPage] = useState(1);
  const pageSize = PAGE_SIZE;
  const list = useMediaList({ sort: "newest", page, pageSize });
  const [target, setTarget] = useState<MediaDto | null>(null);
  const remove = useMutation({
    mutationFn: (media: MediaDto) => deleteMedia(api, media.id, media.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(a) });
      toast({ tone: "success", title: t.deleteScheduled });
      setTarget(null);
    },
    onError: (error) => {
      setTarget(null);
      showError(error);
    },
  });
  if (list.isPending) return <LoadingState label={m.common.loading} />;
  if (list.isError) return <ErrorState title={errorText(m, list.error)} actions={<Button onPress={() => void list.refetch()}>{m.common.retry}</Button>} />;
  if (!list.data.length)
    return (
      <EmptyState
        icon={<Film />}
        title={t.videosEmpty}
        description={t.videosEmptyBody}
        actions={
          access["video.library.manage"].allowed ? (
            <LinkButton href="/app/video-analyses/new" variant="primary" iconStart={<Plus />}>
              {t.new}
            </LinkButton>
          ) : undefined
        }
      />
    );
  return (
    <>
      <DataTable
        label={t.videos}
        rows={list.data}
        rowKey={(media) => media.id}
        columns={[
          {
            id: "name",
            header: m.common.col.name,
            cell: (media) => (
              <span className={styles.nameCell}>
                <span className={styles.tableIcon} data-tone="blue" aria-hidden="true">
                  <Film />
                </span>
                {media.name}
              </span>
            ),
          },
          { id: "type", header: m.common.col.type, width: "9rem", muted: true, hideOnMobile: true, cell: (media) => media.contentType },
          { id: "size", header: m.common.col.size, width: "7rem", muted: true, hideOnMobile: true, cell: (media) => formatBytes(locale, media.size) },
          {
            id: "status",
            header: m.common.col.status,
            width: "8rem",
            cell: (media) => (
              <Badge size="sm" tone={media.state === "Ready" ? "success" : media.state === "Deleting" ? "warning" : "neutral"} dot>
                {m.video.mediaStates[media.state] ?? media.state}
              </Badge>
            ),
          },
          { id: "created", header: m.common.col.created, width: "9rem", muted: true, hideOnMobile: true, cell: (media) => formatRelative(locale, media.createdAt) },
          {
            id: "actions",
            header: <span className="tf-visually-hidden">{m.common.actions}</span>,
            width: "3.5rem",
            align: "end",
            cell: (media) => (
              <IconButton
                label={t.deleteVideo}
                icon={<Trash2 />}
                variant="danger"
                size="sm"
                isDisabled={!access["video.library.manage"].allowed || media.state === "Deleting" || media.pinned}
                onPress={() => setTarget(media)}
              />
            ),
          },
        ]}
      />
      <Pagination
        page={page}
        pageCount={null}
        hasNextPage={list.data.length === pageSize}
        onPageChange={setPage}
        pageSize={pageSize}
            labels={{ previous: m.common.previous, next: m.common.next, status: m.common.pageStatus, navigation: m.common.pagination, pageSize: m.common.perPage }}
      />
      <AlertDialog
        isOpen={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={t.deleteVideoTitle}
        tone="danger"
        confirmLabel={t.deleteVideo}
        cancelLabel={m.common.cancel}
        isConfirming={remove.isPending}
        onConfirm={() => {
          if (target) remove.mutate(target);
        }}
      >
        <p>{t.deleteVideoBody}</p>
      </AlertDialog>
    </>
  );
}

export default function AnalysesRoute() {
  const m = useT();
  const t = m.video.list;
  const locale = useLocale();
  const [state, update] = useUrlState(DEFAULTS);
  const pageSize = PAGE_SIZE;
  const [search, setSearch] = useState(state.q);
  const [tag, setTag] = useState(state.tag);
  const debounced = useDebounced(search, 300);
  const debouncedTag = useDebounced(tag, 400);
  const page = pageFromParam(state.page);
  const access = useFeatures(["video.library.manage", "video.analysis.run", "video.analysis.compare"] as const);
  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    if (debouncedTag !== state.tag) update({ tag: debouncedTag });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTag]);

  const list = useAnalysisList({ search: state.q || undefined, status: state.status || undefined, tag: state.tag || undefined, sort: state.sort, page, pageSize }, state.tab === "analyses");
  const filtersActive = Boolean(state.q || state.status || state.tag);

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <>
            <LockedReason access={access["video.analysis.compare"]}>
              <LinkButton href="/app/video-analyses/compare" iconStart={<GitCompare />} isDisabled={!access["video.analysis.compare"].allowed}>
                {t.compare}
              </LinkButton>
            </LockedReason>
            <LockedReason access={access["video.library.manage"]}>
              <LinkButton href="/app/video-analyses/new" variant="primary" iconStart={<Plus />} isDisabled={!access["video.library.manage"].allowed}>
                {t.new}
              </LinkButton>
            </LockedReason>
          </>
        }
      />
      <Tabs selectedKey={state.tab} onSelectionChange={(key) => update({ tab: String(key) })}>
        <TabList aria-label={t.title}>
          <Tab id="analyses">
            {t.analyses}
          </Tab>
          <Tab id="videos">
            {t.videos}
          </Tab>
        </TabList>
        <TabPanel id="analyses">
          <Toolbar aria-label={m.common.search} className={styles.toolbar}>
            <SearchInput aria-label={t.searchLabel} placeholder={m.common.search} value={search} onChange={setSearch} className={styles.search} />
            <Select aria-label={t.status} selectedKey={state.status || "__any"} onSelectionChange={(key) => update({ status: key === "__any" ? null : String(key) })} className={styles.filter}>
              {[["__any", t.anyStatus], ...Object.entries(m.video.statuses)].map(([key, label]) => (
                <Option key={key} id={key}>
                  {label}
                </Option>
              ))}
            </Select>
            <TextField aria-label={t.tag} placeholder={t.tagPlaceholder} value={tag} onChange={setTag} className={styles.filter} />
            <Select aria-label={m.common.sortBy} selectedKey={state.sort} onSelectionChange={(key) => update({ sort: String(key) })} className={styles.filter}>
              {Object.entries(t.sort).map(([key, label]) => (
                <Option key={key} id={key}>
                  {label}
                </Option>
              ))}
            </Select>
          </Toolbar>
          {list.isPending ? (
            <LoadingState label={m.common.loading} />
          ) : list.isError ? (
            <ErrorState title={errorText(m, list.error)} reference={traceIdOf(list.error)} actions={<Button onPress={() => void list.refetch()}>{m.common.retry}</Button>} />
          ) : list.data.length === 0 ? (
            filtersActive ? (
              <EmptyState icon={<SearchX />} title={t.noResultsTitle} description={t.noResultsBody} />
            ) : (
              <EmptyState
                icon={<Video />}
                title={t.emptyTitle}
                description={t.emptyBody}
                actions={
                  access["video.library.manage"].allowed ? (
                    <LinkButton href="/app/video-analyses/new" variant="primary" iconStart={<Plus />}>
                      {t.new}
                    </LinkButton>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <DataTable
                label={t.title}
                stale={list.isPlaceholderData}
                rows={list.data}
                rowKey={(analysis) => analysis.id}
                columns={[
                  {
                    id: "name",
                    header: m.common.col.name,
                    cell: (analysis) => (
                      <span className={styles.nameCell}>
                        <span className={styles.tableIcon} data-tone="rose" aria-hidden="true">
                          <Video />
                        </span>
                        <RouterLink to={`/app/video-analyses/${analysis.id}`} data-row-link>
                          {analysis.name}
                        </RouterLink>
                      </span>
                    ),
                  },
                  { id: "tags", header: m.common.col.tags, muted: true, hideOnMobile: true, cell: (analysis) => (analysis.tags.length ? analysis.tags.join(", ") : analysis.note || "—") },
                  { id: "status", header: m.common.col.status, width: "9rem", cell: (analysis) => <StatusBadge status={analysis.status} size="sm" /> },
                  { id: "created", header: m.common.col.created, width: "9rem", muted: true, hideOnMobile: true, cell: (analysis) => formatRelative(locale, analysis.createdAt) },
                ]}
              />
              <Pagination
                page={page}
                pageCount={null}
                hasNextPage={list.data.length === pageSize}
                onPageChange={(next) => update({ page: String(next) }, { replace: false })}
                pageSize={pageSize}
            labels={{ previous: m.common.previous, next: m.common.next, status: m.common.pageStatus, navigation: m.common.pagination, pageSize: m.common.perPage }}
              />
            </>
          )}
        </TabPanel>
        <TabPanel id="videos">
          <Videos />
        </TabPanel>
      </Tabs>
    </>
  );
}
