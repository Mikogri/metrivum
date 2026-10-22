import { useQuery } from "@tanstack/react-query";
import { BookmarkCheck, GitCompare, Plus, SearchX, Share2, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router";
import { Button, DataTable, EmptyState, ErrorState, IconButton, LinkButton, LoadingState, Option, PageHeader, Pagination, SearchInput, Select, TextField, Toolbar } from "@trainflow/ui-web";
import { LockedReason, useFeatures } from "~/shared/access";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { errorText, traceIdOf } from "~/shared/lib/errorText";
import { useDebounced } from "~/shared/lib/useDebounced";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { LibraryViewToggle, useLibraryView } from "~/shared/library/LibraryViewToggle";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { listSaved } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useAnalyzerJobs } from "../analyzer-jobs";
import { JobProgress } from "../components/JobProgress";
import type { AnalysisDto } from "@trainflow/api-client-web";
import type { AnalyzerJob } from "../local-analysis";
import { ShareAnalysisDialog } from "../components/ShareAnalysisDialog";
import { useAnalysisList, useMediaList } from "../queries";

type Row = { kind: "job"; job: AnalyzerJob } | { kind: "analysis"; analysis: AnalysisDto };
import styles from "./analyses.module.css";
import { privateMeta } from "~/shared/i18n/site";

/** Rows per page in lists. */
const PAGE_SIZE = 20;

export const meta = () => privateMeta("Video analyses — TrainFlow");

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
                        <span className={styles.tableIcon} data-tone="neutral" aria-hidden="true"><Video /></span>
                      </div>
                      <span className={styles.cardTitle}>{row.job.name}</span>
                      <span className={styles.fileName} title={row.job.fileName}>{row.job.fileName}</span>
                      <JobProgress job={row.job} />
                    </li>
                  ) : (
                    <li key={row.analysis.id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <span className={styles.tableIcon} data-tone="rose" aria-hidden="true"><Video /></span>
                        <StatusBadge status={row.analysis.status} size="sm" />
                      </div>
                      <RouterLink className={styles.cardTitle} to={`/app/video-analyses/${row.analysis.id}`}>{row.analysis.name}</RouterLink>
                      {fileOf(row.analysis) ? <span className={styles.fileName} title={fileOf(row.analysis)}>{fileOf(row.analysis)}</span> : null}
                      <span className={styles.cardMeta}>{formatRelative(locale, row.analysis.createdAt)}</span>
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
                        <span className={styles.tableIcon} data-tone={row.kind === "job" ? "neutral" : "rose"} aria-hidden="true">
                          <Video />
                        </span>
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
                    id: "share",
                    header: <span className="tf-visually-hidden">{m.common.actions}</span>,
                    width: "3rem",
                    cell: (row) => row.kind === "analysis" && row.analysis.status === "Completed"
                      ? <IconButton size="sm" label={m.video.share.action} icon={<Share2 />} onPress={() => setSharing({ id: row.analysis.id, name: row.analysis.name })} />
                      : null,
                  },
                ]}
              />}
              {sharing ? <ShareAnalysisDialog analysisId={sharing.id} name={sharing.name} onClose={() => setSharing(null)} /> : null}
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
