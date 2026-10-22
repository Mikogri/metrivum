import { privateMeta } from "~/shared/i18n/site";

export const meta = ({ location }: { location: { pathname: string } }) =>
  privateMeta(`${location.pathname.endsWith("/edit") ? "Edit training plan" : "Training plan"} — TrainFlow`);

import { useLocation, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { LinkButton, PageHeader } from "@trainflow/ui-web";
import { useCoachingQuery, Failure, Loading } from "~/modules/coaching";
import { usePlan } from "../queries";
import { EditorWorkspace } from "../editor/EditorWorkspace";
import { WeekView } from "../editor/components/WeekView";
import styles from "../delivery/delivery.module.css";

export default function PurchasedPlan() {
  const { programId = "" } = useParams();
  const location = useLocation();
  const plan = usePlan(programId);
  const snapshot = useCoachingQuery<Schema<"RevisionDto">>(`/api/v1/training/programs/${programId}/revisions/1`);
  if (plan.isPending || snapshot.isPending) return <Loading />;
  if (plan.isError || snapshot.isError) return <Failure error={plan.error ?? snapshot.error} />;
  if (location.pathname.endsWith("/edit")) return <EditorWorkspace key={programId} plan={plan.data.data} version={plan.data.version} />;
  const names = new Map(Object.entries(snapshot.data.snapshot.exercises).map(([id, exercise]) => [id, { name: exercise.name, isArchived: false, loading: false, missing: false, movementPatternKeys: [], primaryMuscleKeys: [], secondaryMuscleKeys: [] }]));
  return <><PageHeader title={plan.data.data.name} description="Your independent copy. Changes by the seller do not affect this plan." actions={<LinkButton href={`/app/training-plans/${programId}/edit`}>Edit my copy</LinkButton>} /><div className={styles.stack}><LinkButton href="/app/training-plans">All training plans</LinkButton><WeekView doc={plan.data.data.document} names={names} /></div></>;
}
