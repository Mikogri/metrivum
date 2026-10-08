import { Link, useParams } from "react-router";
import type { Schema } from "@trainflow/api-client-web";
import { EmptyState, PageHeader, SearchInput } from "@trainflow/ui-web";
import { pageFromParam, useUrlState } from "~/shared/lib/useUrlState";
import { useCoachingQuery, type Page } from "../api";
import { Failure, ListPagination, Loading } from "../components";
import { priceDescription } from "../pricing";
import styles from "../coaching.module.css";

export default function CoachOffers() {
  const { coachId } = useParams();
  const [state, update] = useUrlState({ page: "1", q: "" });
  const query = useCoachingQuery<Page<Schema<"OfferRevisionDto">>>(`/api/v1/coaches/${coachId}/offers`, { page: pageFromParam(state.page), pageSize: 20, search: state.q || undefined });
  return <><PageHeader title="Coach offers" description="Explore this coach's available services and application forms." /><div className={styles.stack}><SearchInput aria-label="Search coach offers" value={state.q} onChange={(q) => update({ q })} placeholder="Search offers" />
    {query.isPending ? <Loading /> : query.isError ? <Failure error={query.error} retry={() => void query.refetch()} /> : !query.data.items.length ? <EmptyState title="No available offers" description="This coach has no matching active offers right now." /> : <><div className={styles.grid}>{query.data.items.map((offer) => <article key={offer.offerId} className={styles.panel}><h2><Link to={`/app/coaches/${coachId}/offers/${offer.offerId}`}>{offer.name}</Link></h2><p>{offer.description}</p><p className={styles.muted}>{offer.coachingMode} · {offer.category}</p>{offer.billingOptions.map((option) => <p key={option.id}>{option.name}: {priceDescription(option, offer.currency)}</p>)}</article>)}</div><ListPagination data={query.data} onChange={(page) => update({ page: String(page) })} /></>}
  </div></>;
}
