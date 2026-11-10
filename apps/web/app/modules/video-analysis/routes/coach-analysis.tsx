import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Video } from "lucide-react";
import { useParams } from "react-router";
import {
  Badge,
  Breadcrumbs,
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@metrivum/ui-web";
import { ApiError } from "~/shared/http/errors";
import { formatDateTime } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { fromCoachVideoUrl, getFromCoach, getFromCoachResult } from "../api";
import { ResultView } from "../components/ResultView";
import { describeLink } from "../components/WorkoutLink";
import styles from "./analysis-detail.module.css";

export const meta = () => privateMeta("Coach analysis — Metrivum");

/** Client view of an analysis the coach shared at one of their sets: the same result page, read-only. */
export default function CoachAnalysis() {
  const { analysisId = "" } = useParams();
  const m = useT();
  const locale = useLocale();
  const api = useApi();
  const account = useAccountKey();
  const shared = useQuery({
    queryKey: [account, "video", "from-coach", analysisId] as const,
    queryFn: ({ signal }) => getFromCoach(api, analysisId, signal),
    retry: false,
  });
  const result = useQuery({
    queryKey: [account, "video", "from-coach", analysisId, "result"] as const,
    queryFn: ({ signal }) => getFromCoachResult(api, analysisId, signal),
    enabled: shared.isSuccess,
  });

  if (shared.isError) {
    const gone =
      shared.error instanceof ApiError &&
      (shared.error.status === 404 || shared.error.status === 403);
    return gone ? (
      <EmptyState
        icon={<Video />}
        title={m["ui"]["This analysis is not shared with you"]}
        description={
          m["ui"][
            "Your coach may have stopped sharing it, or the coaching relationship ended."
          ]
        }
      />
    ) : (
      <ErrorState
        title={errorText(m, shared.error)}
        actions={
          <Button onPress={() => void shared.refetch()}>
            {m.common.retry}
          </Button>
        }
      />
    );
  }
  if (!shared.data) return <Skeleton height="20rem" radius="lg" />;
  const { analysis, set } = shared.data;
  const text = describeLink(locale, set);
  const tracking = analysis.configuration?.tracking;
  const aspect =
    tracking?.videoWidth && tracking.videoHeight
      ? Number(tracking.videoWidth) / Number(tracking.videoHeight)
      : 9 / 16;
  const aside = (
    <div className={styles.aside}>
      <dl className={styles.facts}>
        <div>
          <dt>{m["editor"]["columns"]["set"]}</dt>
          <dd className={styles.setFact}>
            <Dumbbell aria-hidden="true" />
            {text.title}
          </dd>
        </div>
        <div>
          <dt>{m["editor"]["sheet"]["addWorkout"]}</dt>
          <dd>{text.detail}</dd>
        </div>
        {analysis.completedAt ? (
          <div>
            <dt>{m.video.detail.completed}</dt>
            <dd>{formatDateTime(locale, analysis.completedAt)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );

  return (
    <>
      <PageHeader
        context={
          <Breadcrumbs
            items={[
              {
                id: "list",
                label: m["ui"]["Coach analyses"],
                href: "/app/my-analyses",
              },
              { id: "current", label: analysis.name },
            ]}
          />
        }
        title={analysis.name}
        description={analysis.note || undefined}
        meta={<Badge tone="violet">{m["ui"]["From your coach"]}</Badge>}
      />
      <section className={styles.section} aria-label={m.video.detail.result}>
        {result.data ? (
          <ResultView
            result={result.data}
            mediaId={analysis.mediaId ?? undefined}
            videoSource={() => fromCoachVideoUrl(api, analysis.id)}
            aside={aside}
            aspect={aspect}
          />
        ) : result.isError ? (
          <ErrorState
            title={errorText(m, result.error)}
            actions={
              <Button onPress={() => void result.refetch()}>
                {m.common.retry}
              </Button>
            }
          />
        ) : (
          <Skeleton height="20rem" radius="lg" />
        )}
      </section>
    </>
  );
}
