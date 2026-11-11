import { useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { Badge, LinkButton, PageHeader } from "@metrivum/ui-web";
import { useCoachingQuery, Failure, Loading } from "~/modules/coaching";
import { useT } from "~/shared/i18n/AppLocale";
import { privateMeta } from "~/shared/i18n/site";
import { PlanDescription } from "../routes/PlanDescription";
import { WeekView } from "../editor/components/WeekView";

export const meta = () => privateMeta("Training plan — Metrivum");

export default function AssignedPlan() {
  const { assignmentId = "" } = useParams();
  const t = useT();
  const query = useCoachingQuery<Schema<"AssignedPlanDto">>(
    `/api/v1/training/assignments/${assignmentId}/plan`,
  );
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure error={query.error} />;
  const names = new Map(
    Object.entries(query.data.exercises).map(([id, exercise]) => [
      id,
      {
        name: exercise.name,
        isArchived: false,
        loading: false,
        missing: false,
        movementPatternKeys: [],
        primaryMuscleKeys: [],
        secondaryMuscleKeys: [],
      },
    ]),
  );
  return (
    <>
      <PageHeader
        title={query.data.name}
        description={
          query.data.description ? (
            <PlanDescription
              text={query.data.description}
              title={query.data.name}
            />
          ) : undefined
        }
        meta={
          <>
            {query.data.status ? (
              <Badge
                tone={
                  query.data.status === "Active"
                    ? "success"
                    : query.data.status === "Paused"
                      ? "warning"
                      : "neutral"
                }
              >
                {t.ui[query.data.status]}
              </Badge>
            ) : null}
            {query.data.coachDisplayName || query.data.coachUsername ? (
              <span>
                {t.ui["Assigned by"]}{" "}
                {query.data.coachDisplayName || query.data.coachUsername}
                {query.data.coachDisplayName && query.data.coachUsername
                  ? ` (@${query.data.coachUsername})`
                  : ""}
              </span>
            ) : null}
          </>
        }
        actions={
          <LinkButton href="/app/my-training?tab=plans">
            {t.ui["All training plans"]}
          </LinkButton>
        }
      />
      <WeekView doc={query.data.document} names={names} />
    </>
  );
}
