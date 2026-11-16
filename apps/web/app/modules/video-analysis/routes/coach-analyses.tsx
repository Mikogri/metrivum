import { useQuery } from "@tanstack/react-query";
import { Dumbbell, Video } from "lucide-react";
import { Link as RouterLink } from "react-router";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@portable-ui/react";
import { formatRelative } from "~/shared/i18n/format";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { errorText } from "~/shared/lib/errorText";
import { useAccountKey, useApi } from "~/shared/session/AccountScope";
import { listFromCoach } from "../api";
import { describeLink } from "../components/WorkoutLink";
import styles from "./coach-analyses.module.css";

export const meta = () => privateMeta("Coach analyses — Metrivum");

/** Client view: video analyses a coach shared at one of the client's logged sets. */
export default function CoachAnalyses() {
  const m = useT();
  const locale = useLocale();
  const api = useApi();
  const account = useAccountKey();
  const list = useQuery({
    queryKey: [account, "video", "from-coach"] as const,
    queryFn: ({ signal }) => listFromCoach(api, undefined, signal),
  });

  return (
    <>
      <PageHeader
        title={m["ui"]["Coach analyses"]}
        description={
          m["ui"]["Video analyses your coach attached to sets you logged."]
        }
      />
      {list.isPending ? (
        <LoadingState label={m.common.loading} />
      ) : list.isError ? (
        <ErrorState
          title={errorText(m, list.error)}
          actions={
            <Button onPress={() => void list.refetch()}>
              {m.common.retry}
            </Button>
          }
        />
      ) : !list.data.length ? (
        <EmptyState
          icon={<Video />}
          title={m["video"]["list"]["emptyTitle"]}
          description={
            m["ui"][
              "When your coach shares a video analysis of one of your sets, it appears here and next to that set in your workout."
            ]
          }
        />
      ) : (
        <ul className={styles.list}>
          {list.data.map(({ analysis, set }) => {
            const text = describeLink(locale, set);
            return (
              <li key={analysis.id} className={styles.item}>
                <span className={styles.icon} aria-hidden="true">
                  <Video />
                </span>
                <span className={styles.body}>
                  <RouterLink
                    to={`/app/my-analyses/${analysis.id}`}
                    className={styles.name}
                  >
                    {analysis.name}
                  </RouterLink>
                  <span className={styles.set}>
                    <Dumbbell aria-hidden="true" />
                    {text.title}
                  </span>
                  <span className={styles.meta}>
                    {set.workoutName} ·{" "}
                    {formatRelative(
                      locale,
                      analysis.completedAt ?? analysis.createdAt,
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
