import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, GitCompare, LoaderCircle, MoreHorizontal, Plus, SearchX, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router";
import { AlertDialog, Button, DataTable, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, IconButton, LinkButton, LoadingState, Option, PageHeader, Pagination, SearchInput, Select, TextField, Toolbar, toast } from "@metrivum/ui-web";
import { LockedReason, useFeatures } from "~/shared/access";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { LibraryViewToggle, useLibraryView } from "~/shared/library/LibraryViewToggle";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { deleteAnalysis, listSaved, retryAnalysis } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalyzerJobs } from "../analyzer-jobs";
import { JobProgress } from "../components/JobProgress";
import type { AnalysisDto } from "@metrivum/api-client-web";
import type { AnalyzerJob } from "../local-analysis";
import { ShareAnalysisDialog } from "../components/ShareAnalysisDialog";
import { useAnalysisList, useMediaList, videoKeys } from "../queries";

type Row = { kind: "job"; job: AnalyzerJob } | { kind: "analysis"; analysis: AnalysisDto };
import styles from "./analyses.module.css";
import { privateMeta } from "~/shared/i18n/site";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

export const meta = () => privateMeta("Video analyses — Metrivum");

const DEFAULTS = { q: "", status: "", tag: "", sort: "newest", page: "1", view: "list" };

/** Analyses other people shared and this account kept: references opened through their link, never copies. */
function SavedFromOthers() {
  const api = useApi();
  const a = useAccountKey();
  const locale = useLocale();
  const saved = useQuery({ queryKey: [a, "video", "saved"] as const, queryFn: ({ signal }) => listSaved(api, signal) });
  if (!saved.data?.length) return null;
  return (
    <section className={styles.saved} aria-labelledby="saved-title">
      <h2 id="saved-title" className={styles.savedTitle}><BookmarkCheck aria-hidden="true" />Shared with you</h2>
      <ul className={styles.savedList}>
        {saved.data.map((item) => (
          <li key={item.token}>
            <span className={styles.tableIcon} data-tone="violet" aria-hidden="true"><Video /></span>
            <RouterLink to={`/app/video-analyses/shared/${encodeURIComponent(item.token)}`} className={styles.savedName}>{item.name}</RouterLink>
            <span className={styles.savedMeta}>{item.ownerName} · {formatRelative(locale, item.completedAt ?? item.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AnalysesRoute() {
  const m = useT();
  const t = m.video.list;
  const locale = useLocale();
  const [state, update] = useUrlState(DEFAULTS);
  const view = useLibraryView(state.view);
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

  const list = useAnalysisList({ search: state.q || undefined, status: state.status || undefined, tag: state.tag || undefined, sort: state.sort, page, pageSize });
  const filtersActive = Boolean(state.q || state.status || state.tag);
  // Videos still in the local analyzer lead the first page; finished ones become normal rows once saved.
  const queue = useAnalyzerJobs();
  const media = useMediaList({ pageSize: 100 });
  const files = new Map((media.data ?? []).map((item) => [item.id, item.name]));
  const fileOf = (analysis: AnalysisDto) => (analysis.mediaId ? files.get(analysis.mediaId) : undefined);
  const jobs = page === 1 && !filtersActive ? queue.jobs.filter((job) => !queue.saved.some((item) => item.id === job.id)) : [];
  const rows: Row[] = [...jobs.map((job) => ({ kind: "job" as const, job })), ...(list.data ?? []).map((analysis) => ({ kind: "analysis" as const, analysis }))];
  const [sharing, setSharing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<AnalysisDto | null>(null);
  const api = useApi();
  const account = useAccountKey();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const remove = useMutation({
    mutationFn: (analysis: AnalysisDto) => deleteAnalysis(api, analysis.id, Number(analysis.version)),
    onSuccess: (_, analysis) => {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: videoKeys.all(account) });
      toast({ tone: "success", title: `Deleted ${analysis.name}` });
    },
    onError: (error) => { setDeleting(null); toast({ tone: "danger", title: errorText(m, error) }); },
  });
  const retry = useMutation({
    mutationFn: (analysis: AnalysisDto) => retryAnalysis(api, analysis.id, Number(analysis.version)),
    onSuccess: (_, analysis) => { void queryClient.invalidateQueries({ queryKey: videoKeys.all(account) }); toast({ tone: "success", title: `Queued again: ${analysis.name}` }); },
    onError: (error) => toast({ tone: "danger", title: errorText(m, error) }),
  });
  // Failed or cancelled analyses run on the server can be queued again (local ones are retried in the analyzer).
  const retryable = (analysis: AnalysisDto) => (analysis.status === "Failed" || analysis.status === "Cancelled") && analysis.executionLocation === "server" && Boolean(analysis.mediaId);
  const working = (analysis: AnalysisDto) => analysis.status === "Queued" || analysis.status === "Processing";
  // One menu per analysis: open, share, compare and delete (a running analysis stops when it is deleted).
  const actions = (analysis: AnalysisDto) => (
    <DropdownMenuTrigger>
      <IconButton size="sm" variant="ghost" label={`Actions for ${analysis.name}`} icon={<MoreHorizontal />} />
      <DropdownMenu aria-label={`Actions for ${analysis.name}`} onAction={(key) => {
        if (key === "open") navigate(`/app/video-analyses/${analysis.id}`);
        else if (key === "share") setSharing({ id: analysis.id, name: analysis.name });
        else if (key === "compare") navigate(`/app/video-analyses/compare?${new URLSearchParams({ with: encodeURIComponent(JSON.stringify([{ kind: "own", id: analysis.id, name: analysis.name, mediaId: analysis.mediaId }])) })}`);
        else if (key === "retry") retry.mutate(analysis);
        else if (key === "delete") setDeleting(analysis);
      }}>
        <DropdownMenuItem id="open">Open</DropdownMenuItem>
        {retryable(analysis) && access["video.analysis.run"].allowed ? <DropdownMenuItem id="retry">Retry</DropdownMenuItem> : null}
        {analysis.status === "Completed" ? <DropdownMenuItem id="share">{m.video.share.action}</DropdownMenuItem> : null}
        {analysis.status === "Completed" && access["video.analysis.compare"].allowed ? <DropdownMenuItem id="compare">Compare</DropdownMenuItem> : null}
        {access["video.library.manage"].allowed ? <DropdownMenuSeparator /> : null}
        {access["video.library.manage"].allowed ? <DropdownMenuItem id="delete" tone="danger">{working(analysis) ? "Stop and delete" : "Delete"}</DropdownMenuItem> : null}
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
  const [removingJob, setRemovingJob] = useState<AnalyzerJob | null>(null);
  const jobActions = (job: AnalyzerJob) => (
    <DropdownMenuTrigger>
      <IconButton size="sm" variant="ghost" label={`Actions for ${job.name}`} icon={<MoreHorizontal />} />
      <DropdownMenu aria-label={`Actions for ${job.name}`} onAction={(key) => {
        if (key === "retry") void queue.retry(job.id).then(() => toast({ tone: "success", title: `Retrying ${job.name}` }), () => { queue.refresh(); toast({ tone: "danger", title: `Could not retry ${job.name}` }); });
        else if (key === "remove") setRemovingJob(job);
      }}>
        {job.state === "failed" || queue.saveErrors[job.id] ? <DropdownMenuItem id="retry">Retry</DropdownMenuItem> : null}
        <DropdownMenuItem id="remove" tone="danger">{job.state === "analyzing" ? "Stop and remove" : "Remove"}</DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  );
  // Work in progress stands out: an amber tile with a spinning icon instead of the video icon.
  const icon = (busy: boolean, tone: string) => (
    <span className={styles.tableIcon} data-tone={busy ? "working" : tone} aria-hidden="true">{busy ? <LoaderCircle className={styles.spin} /> : <Video />}</span>
  );

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
      {/* One list: what is being analyzed now, then everything analyzed (yours and the ones people shared with you). */}
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
            <LibraryViewToggle value={view} onChange={(next) => update({ view: next, page: state.page })} />
          </Toolbar>
          {list.isPending ? (
            <LoadingState label={m.common.loading} />
          ) : list.isError ? (
            <ErrorState title={errorText(m, list.error)} reference={traceIdOf(list.error)} actions={<Button onPress={() => void list.refetch()}>{m.common.retry}</Button>} />
          ) : rows.length === 0 ? (
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
              {view === "cards" ? (
                <ul className={styles.cards} aria-label={t.analyses} data-stale={list.isPlaceholderData || undefined}>
                  {rows.map((row) => row.kind === "job" ? (
                    <li key={row.job.id} className={styles.card} data-analyzing="">
                      <div className={styles.cardTop}>
                        {icon(row.job.state !== "failed", "rose")}
                        {jobActions(row.job)}
                      </div>
                      <span className={styles.cardTitle}>{row.job.name}</span>
                      <span className={styles.fileName} title={row.job.fileName}>{row.job.fileName}</span>
                      <div className={styles.cardBottom}>
                        <JobProgress job={row.job} />
                      </div>
                    </li>
                  ) : (
                    <li key={row.analysis.id} className={styles.card} data-analyzing={working(row.analysis) || undefined}>
                      <div className={styles.cardTop}>
                        {icon(working(row.analysis), "rose")}
                        {actions(row.analysis)}
                      </div>
                      <RouterLink className={styles.cardTitle} to={`/app/video-analyses/${row.analysis.id}`}>{row.analysis.name}</RouterLink>
                      {fileOf(row.analysis) ? <span className={styles.fileName} title={fileOf(row.analysis)}>{fileOf(row.analysis)}</span> : null}
                      <div className={styles.cardBottom}>
                        <span className={styles.cardMeta}>{formatRelative(locale, row.analysis.createdAt)}</span>
                        <StatusBadge status={row.analysis.status} size="sm" />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <DataTable
                label={t.title}
                stale={list.isPlaceholderData}
                rows={rows}
                rowKey={(row) => (row.kind === "job" ? `job:${row.job.id}` : row.analysis.id)}
                columns={[
                  {
                    id: "name",
                    header: m.common.col.name,
                    cell: (row) => (
                      <span className={styles.nameCell}>
                        {icon(row.kind === "job" ? row.job.state !== "failed" : working(row.analysis), "rose")}
                        {row.kind === "job" ? <span className={styles.jobName}>{row.job.name}</span> : (
                          <RouterLink to={`/app/video-analyses/${row.analysis.id}`} data-row-link>
                            {row.analysis.name}
                          </RouterLink>
                        )}
                      </span>
                    ),
                  },
                  {
                    id: "file", header: "File", muted: true, hideOnMobile: true,
                    cell: (row) => { const file = row.kind === "job" ? row.job.fileName : fileOf(row.analysis); return file ? <span className={styles.fileName} title={file}>{file}</span> : "—"; },
                  },
                  { id: "status", header: m.common.col.status, width: "13rem", cell: (row) => (row.kind === "job" ? <JobProgress job={row.job} /> : <StatusBadge status={row.analysis.status} size="sm" />) },
                  { id: "created", header: m.common.col.created, width: "8rem", muted: true, hideOnMobile: true, cell: (row) => (row.kind === "job" ? "now" : formatRelative(locale, row.analysis.createdAt)) },
                  {
                    id: "actions",
                    header: <span className="tf-visually-hidden">{m.common.actions}</span>,
                    width: "3.5rem",
                    cell: (row) => (row.kind === "analysis" ? actions(row.analysis) : jobActions(row.job)),
                  },
                ]}
              />}
              {sharing ? <ShareAnalysisDialog analysisId={sharing.id} name={sharing.name} onClose={() => setSharing(null)} /> : null}
              <AlertDialog isOpen={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }} title="Delete this analysis?" tone="danger"
                confirmLabel="Delete" cancelLabel="Keep it" isConfirming={remove.isPending} onConfirm={() => { if (deleting) remove.mutate(deleting); }}>
                <p>{deleting ? `${deleting.name} ${working(deleting) ? "stops and is" : "is"} deleted with its results and share links. The video is deleted too unless another analysis uses it. This cannot be undone.` : null}</p>
              </AlertDialog>
              <AlertDialog isOpen={removingJob !== null} onOpenChange={(open) => { if (!open) setRemovingJob(null); }} tone="danger"
                title={removingJob?.state === "analyzing" ? "Stop and remove this video?" : "Remove this video?"} confirmLabel="Remove" cancelLabel="Keep it"
                onConfirm={() => {
                  const job = removingJob; setRemovingJob(null);
                  if (job) void queue.remove(job.id).then(() => toast({ tone: "success", title: `Removed ${job.name}` }), () => { queue.refresh(); toast({ tone: "danger", title: `Could not remove ${job.name}` }); });
                }}>
                <p>{removingJob ? `${removingJob.name} is deleted from the analyzer on this computer${removingJob.state === "analyzing" ? " and its analysis stops" : ""}. Nothing is saved to your library.` : null}</p>
              </AlertDialog>
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
      <SavedFromOthers />
    </>
  );
}
