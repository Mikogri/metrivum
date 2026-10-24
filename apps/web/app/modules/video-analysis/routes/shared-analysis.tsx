import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, BookmarkPlus, Share2 } from "lucide-react";
import { useParams } from "react-router";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, toast } from "@trainflow/ui-web";
import { ApiError } from "~/shared/http/errors";
import { formatDateTime } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { getShared, getSharedResult, saveShared, sharedVideoUrl, unsaveShared } from "../api";
import { ResultView } from "../components/ResultView";
import styles from "./analysis-detail.module.css";

export const meta = () => privateMeta("Shared analysis — Metrivum");

/** What someone sees when they open a shared analysis link: the result and the video, read-only. */
export default function SharedAnalysis() {
  const { token = "" } = useParams();
  const m = useT();
  const t = m.video.share;
  const locale = useLocale();
  const api = useApi();
  const a = useAccountKey();
  const analysis = useQuery({ queryKey: [a, "video", "shared", token], queryFn: ({ signal }) => getShared(api, token, signal), retry: false });
  const cache = useQueryClient();
  // Keeping it adds a reference to the owner's analysis to this account's list; nothing is copied.
  const keep = useMutation({
    mutationFn: (save: boolean) => (save ? saveShared(api, token) : unsaveShared(api, token)),
    onSuccess: (_, save) => {
      void cache.invalidateQueries({ queryKey: [a, "video"] });
      toast({ tone: "success", title: save ? "Saved to your analyses" : "Removed from your analyses" });
    },
    onError: (error) => toast({ tone: "danger", title: errorText(m, error) }),
  });
  const result = useQuery({ queryKey: [a, "video", "shared", token, "result"], queryFn: ({ signal }) => getSharedResult(api, token, signal), enabled: analysis.isSuccess });

  if (analysis.isError) {
    const gone = analysis.error instanceof ApiError && analysis.error.status === 404;
    return gone
      ? <EmptyState icon={<Share2 />} title={t.sharedMissing} description={t.sharedMissingBody} />
      : <ErrorState title={errorText(m, analysis.error)} actions={<Button onPress={() => void analysis.refetch()}>{m.common.retry}</Button>} />;
  }
  if (!analysis.data) return <Skeleton height="20rem" radius="lg" />;

  return (
    <>
      <PageHeader
        title={analysis.data.name}
        description={analysis.data.ownerName ? `Shared by ${analysis.data.ownerName}. ${t.sharedNote}` : t.sharedNote}
        actions={analysis.data.allowSave && !analysis.data.own ? (analysis.data.saved
          ? <Button iconStart={<BookmarkCheck />} loading={keep.isPending} onPress={() => keep.mutate(false)}>Saved · remove</Button>
          : <Button variant="primary" iconStart={<BookmarkPlus />} loading={keep.isPending} onPress={() => keep.mutate(true)}>Save to my analyses</Button>) : undefined}
        meta={
          <>
            <Badge tone="violet">{t.sharedBadge}</Badge>
            {analysis.data.completedAt ? <span className={styles.muted}>{formatDateTime(locale, analysis.data.completedAt)}</span> : null}
          </>
        }
      />
      <section className={styles.section} aria-label={t.sharedTitle}>
        {result.data ? (
          <ResultView result={result.data} mediaId={analysis.data.hasVideo ? token : undefined} videoSource={() => sharedVideoUrl(api, token)} />
        ) : result.isError ? (
          <ErrorState title={errorText(m, result.error)} actions={<Button onPress={() => void result.refetch()}>{m.common.retry}</Button>} />
        ) : (
          <Skeleton height="20rem" radius="lg" />
        )}
      </section>
    </>
  );
}
