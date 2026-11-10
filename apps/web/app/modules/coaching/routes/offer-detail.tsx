import { privateMeta } from "~/shared/i18n/site";

export const meta = ({ location }: { location: { pathname: string } }) =>
  privateMeta(
    `${location.pathname.endsWith("/new") ? "New offer" : "Edit offer"} — Metrivum`,
  );

import { Navigate, useParams } from "react-router";
import type { Schema } from "@metrivum/api-client-web";
import { RequireFeature } from "~/shared/access";
import { useCoachingQuery } from "../api";
import { EditableResource, Failure, Loading } from "../components";
import { OfferEditor } from "../offer-editor";

type Offer = Schema<"OfferDto">;

function Detail() {
  const { offerId } = useParams();
  const detail = useCoachingQuery<Offer>(
    `/api/v1/offers/${offerId}`,
    undefined,
    Boolean(offerId),
  );
  // New offers are created in the side panel on the offers page.
  if (!offerId) return <Navigate to="/app/offers?create=1" replace />;
  if (detail.isPending) return <Loading />;
  if (detail.isError)
    return <Failure error={detail.error} retry={() => void detail.refetch()} />;
  return (
    <EditableResource value={detail.data}>
      {(value, onDirtyChange) => (
        <OfferEditor
          key={`${value.id}:${value.version}`}
          initial={value}
          onDirtyChange={onDirtyChange}
        />
      )}
    </EditableResource>
  );
}

export default function OfferDetail() {
  return (
    <RequireFeature feature="offers.manage">
      <Detail />
    </RequireFeature>
  );
}
